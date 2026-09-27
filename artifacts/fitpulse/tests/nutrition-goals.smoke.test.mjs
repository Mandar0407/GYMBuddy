import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const workspaceRoot = fileURLToPath(new URL('../../../', import.meta.url));

async function freePort() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const { port } = server.address();
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return port;
}

async function waitFor(check, description, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const result = await check();
      if (result) return result;
    } catch (error) {
      lastError = error;
    }
    await delay(150);
  }
  throw new Error(`Timed out waiting for ${description}${lastError ? `: ${lastError.message}` : ''}`);
}

function connectCdp(url) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    const pending = new Map();
    const eventListeners = new Map();
    let nextId = 0;
    const timeout = setTimeout(() => reject(new Error('Timed out connecting to Chromium DevTools')), 10000);

    socket.addEventListener('open', () => {
      clearTimeout(timeout);
      resolve({
        send(method, params = {}) {
          const id = ++nextId;
          return new Promise((resolveCommand, rejectCommand) => {
            const timer = setTimeout(() => {
              pending.delete(id);
              rejectCommand(new Error(`Timed out waiting for ${method}`));
            }, 10000);
            pending.set(id, { resolve: resolveCommand, reject: rejectCommand, timer });
            socket.send(JSON.stringify({ id, method, params }));
          });
        },
        close() {
          socket.close();
        },
        waitForEvent(method, timeoutMs = 15000) {
          return new Promise((resolveEvent, rejectEvent) => {
            const listeners = eventListeners.get(method) ?? [];
            const listener = (event) => {
              clearTimeout(timer);
              resolveEvent(event);
            };
            const timer = setTimeout(() => {
              eventListeners.set(method, (eventListeners.get(method) ?? []).filter((current) => current !== listener));
              rejectEvent(new Error(`Timed out waiting for ${method}`));
            }, timeoutMs);
            listeners.push(listener);
            eventListeners.set(method, listeners);
          });
        },
        socket,
      });
    });

    socket.addEventListener('error', () => {
      clearTimeout(timeout);
      reject(new Error('Could not connect to Chromium DevTools'));
    });
    socket.addEventListener('message', ({ data }) => {
      const message = JSON.parse(data);
      if (message.method) {
        for (const listener of eventListeners.get(message.method) ?? []) listener(message.params);
        eventListeners.delete(message.method);
        return;
      }
      if (!message.id) return;
      const command = pending.get(message.id);
      if (!command) return;
      clearTimeout(command.timer);
      pending.delete(message.id);
      if (message.error) command.reject(new Error(message.error.message));
      else command.resolve(message.result);
    });
  });
}

async function setInput(cdp, selector, value) {
  const expression = `(() => {
    const input = document.querySelector(${JSON.stringify(selector)});
    if (!input) throw new Error('Missing input: ${selector}');
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, ${JSON.stringify(String(value))});
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  })()`;
  await evaluate(cdp, expression);
}

async function evaluate(cdp, expression) {
  const response = await cdp.send('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (response.exceptionDetails) {
    throw new Error(response.exceptionDetails.exception?.description ?? response.exceptionDetails.text);
  }
  return response.result?.value;
}

async function stopProcess(processHandle) {
  if (!processHandle || processHandle.exitCode !== null) return;
  try {
    process.kill(-processHandle.pid, 'SIGTERM');
  } catch {
    processHandle.kill('SIGTERM');
  }
  await Promise.race([once(processHandle, 'close'), delay(3000)]);
  if (processHandle.exitCode === null) {
    try {
      process.kill(-processHandle.pid, 'SIGKILL');
    } catch {
      processHandle.kill('SIGKILL');
    }
  }
}

async function click(cdp, selector) {
  await evaluate(cdp, `(() => {
    const element = document.querySelector(${JSON.stringify(selector)});
    if (!element) throw new Error('Missing button: ${selector}');
    element.click();
    return true;
  })()`);
}

async function navigateTo(cdp, view) {
  await click(cdp, '[data-testid="button-mobile-menu"]');
  const selector = `#fitpulse-mobile-navigation [data-testid="button-nav-${view}"]`;
  await waitFor(async () => evaluate(cdp, `Boolean(document.querySelector(${JSON.stringify(selector)}))`), `mobile navigation to ${view}`);
  await click(cdp, selector);
}

async function readProgress(cdp, scope) {
  return evaluate(cdp, `(() => {
    const root = document.querySelector(${JSON.stringify(scope)});
    if (!root) throw new Error('Missing progress section: ${scope}');
    const read = (selector) => {
      const element = root.querySelector(selector);
      if (!element) throw new Error('Missing progress value: ' + selector);
      return {
        current: Number(element.getAttribute('aria-valuenow')),
        target: Number(element.getAttribute('aria-valuemax')),
        width: element.querySelector('.bar-fill, i')?.style.width || element.style.getPropertyValue('--calorie-progress') || element.style.getPropertyValue('--meter-progress') || null,
      };
    };
    return {
      calories: read('[data-testid="progress-calories"]'),
      protein: read('[data-testid="progress-protein"]'),
      carbs: read('[data-testid="progress-carbs"]'),
      fat: read('[data-testid="progress-fat"]'),
    };
  })()`);
}

test('custom nutrition goals update both views and persist after refresh', { timeout: 60000 }, async () => {
  const appPort = await freePort();
  const debugPort = await freePort();
  const appUrl = `http://127.0.0.1:${appPort}/`;
  const profileDir = await mkdtemp(path.join(tmpdir(), 'fitpulse-goals-'));
  const server = spawn('pnpm', ['--filter', '@workspace/fitpulse', 'run', 'dev'], {
    cwd: workspaceRoot,
    env: { ...process.env, PORT: String(appPort), BASE_PATH: '/' },
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
  });
  let serverOutput = '';
  server.stdout.on('data', (chunk) => { serverOutput += chunk.toString(); });
  server.stderr.on('data', (chunk) => { serverOutput += chunk.toString(); });

  let browser;
  let cdp;
  let browserOutput = '';
  try {
    await waitFor(async () => {
      if (server.exitCode !== null) throw new Error(`Vite exited early: ${serverOutput}`);
      const response = await fetch(appUrl);
      return response.ok;
    }, 'FitPulse to start');

    browser = spawn(process.env.CHROMIUM_PATH ?? 'chromium', [
      '--headless=new',
      '--no-sandbox',
      '--disable-gpu',
      '--disable-dev-shm-usage',
      '--no-first-run',
      '--no-default-browser-check',
      '--remote-allow-origins=*',
      `--remote-debugging-port=${debugPort}`,
      `--user-data-dir=${profileDir}`,
      'about:blank',
    ], { stdio: ['ignore', 'pipe', 'pipe'], detached: true });
    browser.stdout.on('data', (chunk) => { browserOutput += chunk.toString(); });
    browser.stderr.on('data', (chunk) => { browserOutput += chunk.toString(); });

    await waitFor(async () => {
      const response = await fetch(`http://127.0.0.1:${debugPort}/json/version`);
      if (!response.ok) return false;
      return response.json();
    }, 'Chromium DevTools to start');

    const targetResponse = await fetch(`http://127.0.0.1:${debugPort}/json/new?about:blank`, { method: 'PUT' });
    assert.equal(targetResponse.ok, true, 'Chromium should open a test tab');
    const target = await targetResponse.json();
    cdp = await connectCdp(target.webSocketDebuggerUrl);
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Page.navigate', { url: appUrl });
    await waitFor(async () => evaluate(cdp, `Boolean(document.querySelector('[data-testid="button-mobile-menu"]'))`), 'FitPulse to render');
    const shell = await evaluate(cdp, `(() => {
      const rect = document.querySelector('#root').getBoundingClientRect();
      return {
        width: rect.width,
        left: rect.left,
        expectedLeft: (document.documentElement.clientWidth - rect.width) / 2,
        sidebarDisplay: getComputedStyle(document.querySelector('.fp-sidebar')).display,
        mobileBarDisplay: getComputedStyle(document.querySelector('.fp-mobilebar')).display,
      };
    })()`);
    assert.equal(shell.width, 640, 'the app should stay at a 640px maximum width on desktop');
    assert.ok(Math.abs(shell.left - shell.expectedLeft) <= 1, 'the app should be centered in the usable viewport');
    assert.equal(shell.sidebarDisplay, 'none', 'the desktop sidebar should not occupy the narrow shell');
    assert.notEqual(shell.mobileBarDisplay, 'none', 'the mobile navigation trigger should be available');

    const header = await evaluate(cdp, `(() => {
      const style = getComputedStyle(document.querySelector('.fp-mobilebar'));
      return { position: style.position, top: style.top, zIndex: style.zIndex, background: style.backgroundColor };
    })()`);
    assert.deepEqual(header, { position: 'sticky', top: '0px', zIndex: '100', background: 'rgb(247, 245, 238)' });
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: false });
    const phone = await evaluate(cdp, `(() => ({
      viewport: document.documentElement.clientWidth,
      width: document.querySelector('#root').getBoundingClientRect().width,
      rootPadding: getComputedStyle(document.querySelector('#root')).paddingLeft,
      mainPadding: getComputedStyle(document.querySelector('.fp-main')).paddingLeft,
      pagePadding: getComputedStyle(document.querySelector('.fp-page')).paddingLeft,
    }))()`);
    assert.equal(phone.width, phone.viewport, 'the app should use the full usable phone width');
    assert.equal(phone.rootPadding, '0px');
    assert.equal(phone.mainPadding, '0px');
    assert.equal(phone.pagePadding, '16px');
    await evaluate(cdp, `window.scrollTo({ top: 300, behavior: 'instant' }); true`);
    await waitFor(async () => evaluate(cdp, `window.scrollY > 0`), 'mobile page to scroll');
    assert.ok(Math.abs(await evaluate(cdp, `document.querySelector('.fp-mobilebar').getBoundingClientRect().top`)) <= 1, 'the mobile header should stay pinned on scroll');
    await evaluate(cdp, `window.scrollTo({ top: 0, behavior: 'instant' }); true`);
    await cdp.send('Emulation.clearDeviceMetricsOverride');

    await navigateTo(cdp, 'macros');
    await waitFor(async () => evaluate(cdp, `Boolean(document.querySelector('[data-testid="input-target-calories"]'))`), 'daily target form');

    await setInput(cdp, '[data-testid="input-meal-calories"]', 900);
    await setInput(cdp, '[data-testid="input-meal-protein"]', 30);
    await setInput(cdp, '[data-testid="input-meal-carbs"]', 60);
    await setInput(cdp, '[data-testid="input-meal-fat"]', 20);
    await click(cdp, '[data-testid="button-submit-meal"]');
    await waitFor(async () => evaluate(cdp, `document.querySelector('[data-testid="card-macro-totals"]')?.textContent.includes('900')`), 'meal totals to update');

    await setInput(cdp, '[data-testid="input-target-calories"]', 1800);
    await setInput(cdp, '[data-testid="input-target-protein"]', 60);
    await setInput(cdp, '[data-testid="input-target-carbs"]', 120);
    await setInput(cdp, '[data-testid="input-target-fat"]', 40);
    await click(cdp, '[data-testid="button-save-daily-targets"]');

    const macrosProgress = await readProgress(cdp, '[data-testid="card-macro-totals"]');
    assert.deepEqual(macrosProgress, {
      calories: { current: 900, target: 1800, width: '50%' },
      protein: { current: 30, target: 60, width: '50%' },
      carbs: { current: 60, target: 120, width: '50%' },
      fat: { current: 20, target: 40, width: '50%' },
    });
    assert.match(await evaluate(cdp, `document.querySelector('[data-testid="card-macro-totals"]').textContent`), /50% target/);

    await navigateTo(cdp, 'dashboard');
    await waitFor(async () => evaluate(cdp, `document.querySelector('[data-testid="card-dashboard-macros"] [data-testid="progress-calories"]')?.getAttribute('aria-valuemax') === '1800'`), 'dashboard targets to update');
    const dashboardProgress = await readProgress(cdp, '[data-testid="card-dashboard-macros"]');
    assert.deepEqual(dashboardProgress, {
      calories: { current: 900, target: 1800, width: '50%' },
      protein: { current: 30, target: 60, width: '50%' },
      carbs: { current: 60, target: 120, width: '50%' },
      fat: { current: 20, target: 40, width: '50%' },
    });
    assert.match(await evaluate(cdp, `document.querySelector('[data-testid="card-metric-calories"]').textContent`), /50% of daily target/);

    const pageLoaded = cdp.waitForEvent('Page.loadEventFired');
    await cdp.send('Page.reload');
    await pageLoaded;
    await waitFor(async () => evaluate(cdp, `document.querySelector('[data-testid="card-dashboard-macros"] [data-testid="progress-calories"]')?.getAttribute('aria-valuemax') === '1800'`), 'saved dashboard targets after refresh');
    const refreshedDashboard = await readProgress(cdp, '[data-testid="card-dashboard-macros"]');
    assert.deepEqual(refreshedDashboard, dashboardProgress);

    await navigateTo(cdp, 'macros');
    await waitFor(async () => evaluate(cdp, `document.querySelector('[data-testid="input-target-fat"]')?.value === '40'`), 'saved macro form after refresh');
    const savedTargets = await evaluate(cdp, `Object.fromEntries(
      ['calories', 'protein', 'carbs', 'fat'].map((name) => [
        name,
        document.querySelector('[data-testid="input-target-' + name + '"]').value,
      ])
    )`);
    assert.deepEqual(savedTargets, { calories: '1800', protein: '60', carbs: '120', fat: '40' });
    assert.deepEqual(await readProgress(cdp, '[data-testid="card-macro-totals"]'), macrosProgress);
  } catch (error) {
    error.message += `\nVite output:\n${serverOutput}\nChromium output:\n${browserOutput}`;
    throw error;
  } finally {
    cdp?.close();
    await Promise.all([stopProcess(browser), stopProcess(server)]);
    await rm(profileDir, { recursive: true, force: true });
  }
});