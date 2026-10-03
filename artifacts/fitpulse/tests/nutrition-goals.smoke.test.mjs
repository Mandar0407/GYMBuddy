import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
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
    await waitFor(async () => evaluate(cdp, `(() => {
      const indicator = document.querySelector('[data-testid="indicator-top-nav"]').getBoundingClientRect();
      const tab = document.querySelector('[data-testid="button-top-nav-macros"]').getBoundingClientRect();
      return Math.abs(indicator.left - tab.left) <= 1;
    })()`), 'top navigation underline to slide to Nutrition');
    await cdp.send('Page.bringToFront');
    await evaluate(cdp, `(() => {
      const field = document.querySelector('[data-testid="input-target-calories"]');
      field.focus();
      return true;
    })()`);
    await delay(450);
    const motionStyles = await evaluate(cdp, `(() => {
      const field = document.querySelector('[data-testid="input-target-calories"]');
      const style = getComputedStyle(field);
      return { active: document.activeElement === field, focused: field.matches(':focus'), transition: style.transitionProperty, border: style.borderTopColor, glow: style.boxShadow };
    })()`);
    assert.equal(motionStyles.active, true, JSON.stringify(motionStyles));
    assert.equal(motionStyles.transition, 'all');
    assert.equal(motionStyles.border, 'rgb(130, 169, 155)', JSON.stringify(motionStyles));
    assert.match(motionStyles.glow, /40, 105, 92/, JSON.stringify(motionStyles));
    await evaluate(cdp, `document.activeElement.blur(); true`);

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

    assert.match(await evaluate(cdp, `document.querySelector('[data-testid="text-water-goal"]').textContent`), /2,000 ml goal/);
    await click(cdp, '[data-testid="button-edit-water-goal"]');
    await setInput(cdp, '[data-testid="input-water-goal"]', 0);
    await click(cdp, '[data-testid="button-save-water-goal"]');
    assert.match(await evaluate(cdp, `document.querySelector('[data-testid="status-water-goal-error"]')?.textContent`), /whole number/);
    await setInput(cdp, '[data-testid="input-water-goal"]', 3000);
    await click(cdp, '[data-testid="button-save-water-goal"]');
    assert.match(await evaluate(cdp, `document.querySelector('[data-testid="text-water-goal"]').textContent`), /3,000 ml goal/);
    await click(cdp, '[data-testid="button-add-water-330"]');
    await click(cdp, '[data-testid="button-add-water-750"]');
    await setInput(cdp, '[data-testid="input-water-custom"]', 420);
    await click(cdp, '[data-testid="button-add-water-custom"]');
    const waterProgress = await evaluate(cdp, `(() => {
      const card = document.querySelector('[data-testid="card-water-intake"]');
      const progress = card.querySelector('[role="progressbar"]');
      return {
        current: progress.getAttribute('aria-valuenow'),
        target: progress.getAttribute('aria-valuemax'),
        segments: card.querySelectorAll('.water-segments .is-filled').length,
        amount: card.querySelector('[data-testid="text-water-intake"]').textContent.trim(),
      };
    })()`);
    assert.deepEqual(waterProgress, { current: '1500', target: '3000', segments: 4, amount: '1,500 ml' });

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
    assert.match(await evaluate(cdp, `document.querySelector('[data-testid="text-water-goal"]').textContent`), /50% of 3,000 ml goal/);
    assert.match(await evaluate(cdp, `document.querySelector('[data-testid="text-water-intake"]').textContent`), /1,500 ml/);

    await navigateTo(cdp, 'steps');
    await waitFor(async () => evaluate(cdp, `Boolean(document.querySelector('[data-testid="chart-hourly-steps"]'))`), 'hourly activity chart');
    await click(cdp, '[data-testid="button-edit-movement-goal"]');
    assert.equal(await evaluate(cdp, `document.querySelector('[data-testid="input-movement-stride"]').value`), '76');
    assert.match(await evaluate(cdp, `document.querySelector('#movement-stride-hint').textContent`), /Height × 0\.415/);
    await setInput(cdp, '[data-testid="input-movement-height"]', 180);
    assert.equal(await evaluate(cdp, `document.querySelector('[data-testid="input-movement-stride"]').value`), '75');
    await click(cdp, '[data-testid="button-cancel-movement-settings"]');

    await click(cdp, '[data-testid="button-mobile-menu"]');
    await click(cdp, '[data-testid="button-mobile-profile"]');
    await setInput(cdp, '[data-testid="input-profile-height"]', 200);
    await click(cdp, '[data-testid="button-save-profile"]');
    await click(cdp, '[data-testid="button-edit-movement-goal"]');
    assert.equal(await evaluate(cdp, `document.querySelector('[data-testid="input-movement-height"]').value`), '200');
    assert.equal(await evaluate(cdp, `document.querySelector('[data-testid="input-movement-stride"]').value`), '83');
    await setInput(cdp, '[data-testid="input-movement-stride"]', 90);
    await setInput(cdp, '[data-testid="input-movement-height"]', 190);
    assert.equal(await evaluate(cdp, `document.querySelector('[data-testid="input-movement-stride"]').value`), '90', 'manual stride remains until reset');
    await click(cdp, '[data-testid="button-save-movement-settings"]');
    assert.match(await evaluate(cdp, `document.querySelector('.movement-estimate-note').textContent`), /90 cm stride/);
    await click(cdp, '[data-testid="button-edit-movement-goal"]');
    assert.equal(await evaluate(cdp, `document.querySelector('[data-testid="input-movement-height"]').value`), '190');
    assert.equal(await evaluate(cdp, `document.querySelector('[data-testid="input-movement-stride"]').value`), '90');
    await click(cdp, '[data-testid="button-reset-stride-auto"]');
    assert.equal(await evaluate(cdp, `document.querySelector('[data-testid="input-movement-stride"]').value`), '79');
    await click(cdp, '[data-testid="button-save-movement-settings"]');
    await click(cdp, '[data-testid="button-add-500-steps"]');
    await click(cdp, '[data-testid="button-add-1000-steps"]');
    await click(cdp, '[data-testid="button-add-2500-steps"]');
    assert.match(await evaluate(cdp, `document.querySelector('[data-testid="text-step-total"]').textContent`), /4,000/);
    assert.match(await evaluate(cdp, `document.querySelector('[data-testid="text-step-progress"]').textContent`), /40%/);
    const currentHour = await evaluate(cdp, `new Date().getHours()`);
    assert.match(await evaluate(cdp, `document.querySelector('[data-testid="bar-hour-${currentHour}"]').getAttribute('aria-label')`), /4,000 steps/);
    await evaluate(cdp, `window.DeviceMotionEvent ??= function DeviceMotionEvent() {}; true`);
    await click(cdp, '[data-testid="button-start-live-tracking"]');
    await evaluate(cdp, `(() => {
      const event = new Event('devicemotion');
      Object.defineProperty(event, 'acceleration', { value: { x: 0, y: 0, z: 0 } });
      window.dispatchEvent(event);
      return true;
    })()`);
    await waitFor(async () => evaluate(cdp, `document.querySelector('[data-testid="status-motion-tracking"]')?.textContent.includes('Active Motion Sensor')`), 'live sensor reading');
    await delay(370);
    await evaluate(cdp, `(() => {
      const event = new Event('devicemotion');
      Object.defineProperty(event, 'acceleration', { value: { x: 0, y: 0, z: 4 } });
      window.dispatchEvent(event);
      return true;
    })()`);
    await waitFor(async () => evaluate(cdp, `document.querySelector('[data-testid="text-step-total"]')?.textContent.includes('4,001')`), 'live motion step');
    assert.match(await evaluate(cdp, `document.querySelector('[data-testid="bar-hour-${currentHour}"]').getAttribute('aria-label')`), /4,001 steps/);
    await click(cdp, '[data-testid="button-stop-live-tracking"]');
    if (process.env.MOVEMENT_SCREENSHOT_DIR) {
      await cdp.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
      await evaluate(cdp, `document.querySelector('[data-testid="chart-hourly-steps"]').scrollIntoView({ behavior: 'instant', block: 'center' }); true`);
      await delay(550);
      const image = await cdp.send('Page.captureScreenshot', { format: 'png' });
      await writeFile(path.join(process.env.MOVEMENT_SCREENSHOT_DIR, 'fitpulse-hourly-movement.png'), Buffer.from(image.data, 'base64'));
    }
    const stepsReload = cdp.waitForEvent('Page.loadEventFired');
    await cdp.send('Page.reload');
    await stepsReload;
    await navigateTo(cdp, 'steps');
    await waitFor(async () => evaluate(cdp, `document.querySelector('[data-testid="text-step-total"]')?.textContent.includes('4,001')`), 'saved step total after refresh');
    await click(cdp, '[data-testid="button-edit-movement-goal"]');
    assert.equal(await evaluate(cdp, `document.querySelector('[data-testid="input-movement-height"]').value`), '190');
    assert.equal(await evaluate(cdp, `document.querySelector('[data-testid="input-movement-stride"]').value`), '79', 'auto stride persists after reload');
    await click(cdp, '[data-testid="button-cancel-movement-settings"]');
    assert.match(await evaluate(cdp, `document.querySelector('[data-testid="bar-hour-${currentHour}"]').getAttribute('aria-label')`), /4,001 steps/);
    assert.equal(await evaluate(cdp, `Boolean(document.querySelector('[data-testid="text-unassigned-steps"]'))`), false);
    await navigateTo(cdp, 'insights');
    await waitFor(async () => evaluate(cdp, `Boolean(document.querySelector('[data-testid="page-weekly-insights"]'))`), 'weekly insights view');
    assert.match(await evaluate(cdp, `document.querySelector('[data-testid="text-weekly-steps-total"]').textContent`), /4,001/);
    const today = await evaluate(cdp, `(() => { const d = new Date(); return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-'); })()`);
    assert.match(await evaluate(cdp, `document.querySelector('[data-testid="bar-weekly-steps-${today}"]').getAttribute('aria-label')`), /4,001 steps recorded/);
    assert.equal(await evaluate(cdp, `document.querySelector('[data-testid="button-next-week"]').disabled`), true);
    assert.match(await evaluate(cdp, `document.querySelector('[data-testid="bar-weekly-water-${today}"]').getAttribute('aria-label')`), /ml of water logged/);
    assert.match(await evaluate(cdp, `document.querySelector('[data-testid="bar-weekly-nutrition-${today}"]').getAttribute('aria-label')`), /kcal of food logged/);
    assert.match(await evaluate(cdp, `document.querySelector('[data-testid="bar-weekly-strength-${today}"]').getAttribute('aria-label')`), /no log/);
    if (process.env.INSIGHTS_SCREENSHOT_DIR) {
      await cdp.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
      await evaluate(cdp, `window.scrollTo({ top: 0, behavior: 'instant' }); true`);
      await delay(400);
      const image = await cdp.send('Page.captureScreenshot', { format: 'png' });
      await writeFile(path.join(process.env.INSIGHTS_SCREENSHOT_DIR, 'fitpulse-weekly-insights.png'), Buffer.from(image.data, 'base64'));
      await evaluate(cdp, `document.querySelector('.wi-detail-grid').scrollIntoView({ behavior: 'instant', block: 'start' }); window.scrollBy({ top: -135, behavior: 'instant' }); true`);
      await delay(250);
      const lowerImage = await cdp.send('Page.captureScreenshot', { format: 'png' });
      await writeFile(path.join(process.env.INSIGHTS_SCREENSHOT_DIR, 'fitpulse-weekly-details.png'), Buffer.from(lowerImage.data, 'base64'));
    }
    await click(cdp, '[data-testid="button-previous-week"]');
    await waitFor(async () => evaluate(cdp, `Boolean(document.querySelector('[data-testid="empty-weekly-insights"]'))`), 'empty previous week');
    await click(cdp, '[data-testid="button-next-week"]');
    await waitFor(async () => evaluate(cdp, `document.querySelector('[data-testid="text-weekly-steps-total"]')?.textContent.includes('4,001')`), 'current week after browsing');
    await navigateTo(cdp, 'steps');
    await click(cdp, '[data-testid="button-reset-steps"]');
    assert.match(await evaluate(cdp, `document.querySelector('[data-testid="bar-hour-${currentHour}"]').getAttribute('aria-label')`), /0 steps/);

    await navigateTo(cdp, 'workout');
    await waitFor(async () => evaluate(cdp, `Boolean(document.querySelector('[data-testid="section-strength-interval-timer"]'))`), 'interval timer module');
    await click(cdp, '[data-testid="button-preset-tabata"]');
    assert.equal(await evaluate(cdp, `document.querySelector('[data-testid="text-work"]').textContent`), '00:20');
    assert.equal(await evaluate(cdp, `document.querySelector('[data-testid="text-rest"]').textContent`), '00:10');
    await click(cdp, '[data-testid="button-increase-sets"]');
    await click(cdp, '[data-testid="switch-skip-last-rest"]');
    assert.equal(await evaluate(cdp, `document.querySelector('[data-testid="switch-skip-last-rest"]').getAttribute('aria-checked')`), 'false');
    await click(cdp, '[data-testid="switch-skip-last-rest"]');
    await setInput(cdp, '[data-testid="input-preset-name"]', 'My short intervals');
    await click(cdp, '[data-testid="button-save-preset"]');
    assert.match(await evaluate(cdp, `document.querySelector('.sit-custom').textContent`), /My short intervals/);
    if (process.env.TIMER_SCREENSHOT_DIR) {
      await cdp.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
      await evaluate(cdp, `document.querySelector('[data-testid="section-strength-interval-timer"]').scrollIntoView({ behavior: 'instant' }); window.scrollBy({ top: -85, behavior: 'instant' }); true`);
      const image = await cdp.send('Page.captureScreenshot', { format: 'png' });
      await writeFile(path.join(process.env.TIMER_SCREENSHOT_DIR, 'fitpulse-strength-setup.png'), Buffer.from(image.data, 'base64'));
    }
    await click(cdp, '[data-testid="button-start-interval"]');
    assert.equal(await evaluate(cdp, `document.querySelector('[data-testid="dialog-interval-timer"]').dataset.phase`), 'prepare');
    if (process.env.TIMER_SCREENSHOT_DIR) {
      await delay(450);
      const image = await cdp.send('Page.captureScreenshot', { format: 'png' });
      await writeFile(path.join(process.env.TIMER_SCREENSHOT_DIR, 'fitpulse-strength-active.png'), Buffer.from(image.data, 'base64'));
    }
    await waitFor(async () => evaluate(cdp, `document.querySelector('[data-testid="dialog-interval-timer"]')?.dataset.phase === 'work'`), 'prepare countdown to enter work', 9000);
    await waitFor(async () => evaluate(cdp, `getComputedStyle(document.querySelector('[data-testid="dialog-interval-timer"]')).backgroundColor === 'rgb(211, 228, 215)'`), 'sage work background');
    await click(cdp, '[data-testid="button-pause-interval"]');
    const pausedTime = await evaluate(cdp, `document.querySelector('[data-testid="text-interval-countdown"]').textContent`);
    await delay(1100);
    assert.equal(await evaluate(cdp, `document.querySelector('[data-testid="text-interval-countdown"]').textContent`), pausedTime, 'pause should stop the clock');
    await click(cdp, '[data-testid="button-resume-interval"]');
    await click(cdp, '[data-testid="button-skip-interval-set"]');
    assert.equal(await evaluate(cdp, `document.querySelector('[data-testid="text-interval-set-progress"]').textContent`), '2 / 9');
    await evaluate(cdp, `(() => { const originalNow = Date.now; Date.now = () => originalNow() + 21000; return true; })()`);
    await waitFor(async () => evaluate(cdp, `document.querySelector('[data-testid="dialog-interval-timer"]')?.dataset.phase === 'rest'`), 'work countdown to enter rest');
    await waitFor(async () => evaluate(cdp, `getComputedStyle(document.querySelector('[data-testid="dialog-interval-timer"]')).backgroundColor === 'rgb(242, 212, 199)'`), 'terracotta rest background');
    await click(cdp, '[data-testid="button-reset-interval"]');
    assert.equal(await evaluate(cdp, `Boolean(document.querySelector('[data-testid="dialog-interval-timer"]'))`), false);
    const timerReload = cdp.waitForEvent('Page.loadEventFired');
    await cdp.send('Page.reload');
    await timerReload;
    await navigateTo(cdp, 'workout');
    assert.match(await evaluate(cdp, `document.querySelector('.sit-custom').textContent`), /My short intervals/, 'saved timer preset should survive refresh');
    await setInput(cdp, '[data-testid="input-exercise"]', 'Smoke test squat');
    await setInput(cdp, '[data-testid="input-workout-weight"]', '40');
    await setInput(cdp, '[data-testid="input-workout-reps"]', '10');
    await click(cdp, '[data-testid="button-set-type-warmup"]');
    await click(cdp, '[data-testid="button-submit-workout"]');
    assert.equal(await evaluate(cdp, `Boolean(document.querySelector('[data-testid="dialog-rest-timer"]'))`), false, 'warm-up should not start rest');
    await setInput(cdp, '[data-testid="input-workout-weight"]', '50');
    await setInput(cdp, '[data-testid="input-workout-reps"]', '1');
    await click(cdp, '[data-testid="button-set-type-working"]');
    await click(cdp, '[data-testid="button-submit-workout"]');
    assert.equal(await evaluate(cdp, `Boolean(document.querySelector('[data-testid="dialog-rest-timer"]'))`), true);
    assert.equal(await evaluate(cdp, `Boolean(document.querySelector('[data-testid="text-pr-weight"]'))`), true);
    assert.equal(await evaluate(cdp, `Boolean(document.querySelector('[data-testid="text-pr-one-rm"]'))`), false, 'weight-only record is not an estimated 1RM record');
    await click(cdp, '[data-testid="button-close-pr-celebration"]');
    await click(cdp, '[data-testid="button-close-rest-timer"]');
    assert.match(await evaluate(cdp, `document.querySelector('[data-testid^="text-set-intensity-"]').textContent`), /% 1RM/);
    await click(cdp, '[data-testid="button-complete-workout"]');
    assert.equal(await evaluate(cdp, `document.querySelector('[data-testid="button-complete-workout"]').disabled`), true, 'same sets cannot be finished twice');
    await navigateTo(cdp, 'macros');
    await click(cdp, '[data-testid="button-create-meal-template"]');
    await setInput(cdp, '[data-testid="input-template-name"]', 'Regular smoothie');
    await setInput(cdp, '[data-testid="input-template-calories"]', '320');
    await setInput(cdp, '[data-testid="input-template-protein"]', '28');
    await setInput(cdp, '[data-testid="input-template-carbs"]', '32');
    await setInput(cdp, '[data-testid="input-template-fat"]', '9');
    await click(cdp, '[data-testid="button-save-meal-template"]');
    await click(cdp, '[data-testid^="button-log-template-"]');
    assert.match(await evaluate(cdp, `document.querySelector('[data-testid="card-recent-meals"]')?.textContent ?? document.querySelector('.log-list').textContent`), /Regular smoothie/);
    await navigateTo(cdp, 'dashboard');
    await click(cdp, '[data-testid="button-fast-preset-18-6"]');
    await click(cdp, '[data-testid="button-start-fast"]');
    assert.match(await evaluate(cdp, `document.querySelector('[data-testid="text-fasting-window"]').textContent`), /18 hours fasting/);
    await click(cdp, '[data-testid="button-dashboard-weekly-analytics"]');
    await waitFor(async () => evaluate(cdp, `Boolean(document.querySelector('[data-testid="text-advanced-workouts-completed"]'))`), 'detailed analytics to finish loading');
    assert.equal(await evaluate(cdp, `document.querySelector('[data-testid="text-advanced-workouts-completed"]').textContent`), '1');
    await setInput(cdp, '[data-testid="input-advanced-weight"]', '70.4');
    await click(cdp, '[data-testid="button-log-advanced-weight"]');
    assert.match(await evaluate(cdp, `document.querySelector('[data-testid="card-advanced-weight"]').textContent`), /70.4 kg/);
    if (process.env.ADVANCED_SCREENSHOT_DIR) {
      await cdp.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
      await evaluate(cdp, `document.querySelector('[data-testid="section-advanced-analytics"]').scrollIntoView({ behavior: 'instant', block: 'start' }); window.scrollBy({ top: -135, behavior: 'instant' }); true`);
      await delay(350);
      const image = await cdp.send('Page.captureScreenshot', { format: 'png' });
      await writeFile(path.join(process.env.ADVANCED_SCREENSHOT_DIR, 'fitpulse-advanced-analytics.png'), Buffer.from(image.data, 'base64'));
    }
    const featureReload = cdp.waitForEvent('Page.loadEventFired');
    await cdp.send('Page.reload');
    await featureReload;
    assert.equal(await evaluate(cdp, `document.querySelector('[data-testid="status-fasting"]').textContent`), 'In progress');
    await click(cdp, '[data-testid="button-reset-fast"]');
    await navigateTo(cdp, 'macros');
    assert.match(await evaluate(cdp, `document.querySelector('[data-testid="section-meal-templates"]').textContent`), /Regular smoothie/);
    await navigateTo(cdp, 'insights');
    await waitFor(async () => evaluate(cdp, `Boolean(document.querySelector('[data-testid="text-advanced-workouts-completed"]'))`), 'detailed analytics after reload');
    assert.equal(await evaluate(cdp, `document.querySelector('[data-testid="text-advanced-workouts-completed"]').textContent`), '1');
    assert.match(await evaluate(cdp, `document.querySelector('[data-testid="card-advanced-weight"]').textContent`), /70.4 kg/);
    await navigateTo(cdp, 'workout');
    const completedSetIds = await evaluate(cdp, `Array.from(document.querySelectorAll('[data-testid^="row-workout-"]')).filter((row) => row.textContent.includes('Smoke test squat')).map((row) => row.dataset.testid.slice('row-workout-'.length))`);
    assert.equal(completedSetIds.length, 2);
    for (const id of completedSetIds) await click(cdp, `[data-testid="row-workout-${id}"] [data-testid="button-delete-workout-${id}"]`);
    await navigateTo(cdp, 'insights');
    await waitFor(async () => evaluate(cdp, `Boolean(document.querySelector('[data-testid="text-advanced-workouts-completed"]'))`), 'updated analytics after deleting sets');
    assert.equal(await evaluate(cdp, `document.querySelector('[data-testid="text-advanced-workouts-completed"]').textContent`), '0', 'a workout with no remaining sets is not counted as completed');
    await navigateTo(cdp, 'workout');
    await click(cdp, '[data-testid="button-start-workout-strength"]');
    assert.equal(await evaluate(cdp, `document.querySelector('[data-testid="text-workout-countdown"]').textContent`), '3');
    if (process.env.TIMER_SCREENSHOT_DIR) {
      const image = await cdp.send('Page.captureScreenshot', { format: 'png' });
      await writeFile(path.join(process.env.TIMER_SCREENSHOT_DIR, 'fitpulse-live-countdown.png'), Buffer.from(image.data, 'base64'));
    }
    await waitFor(async () => evaluate(cdp, `Boolean(document.querySelector('[data-testid="screen-live-workout"]'))`), 'live strength screen after countdown', 6000);
    if (process.env.TIMER_SCREENSHOT_DIR) {
      const image = await cdp.send('Page.captureScreenshot', { format: 'png' });
      await writeFile(path.join(process.env.TIMER_SCREENSHOT_DIR, 'fitpulse-live-strength.png'), Buffer.from(image.data, 'base64'));
    }
    assert.equal(await evaluate(cdp, `document.querySelector('[data-testid="text-live-distance"]').textContent`), '—', 'strength does not invent distance');
    await delay(250);
    await click(cdp, '[data-testid="button-pause-resume-workout"]');
    const workoutPausedAt = await evaluate(cdp, `document.querySelector('[data-testid="text-live-elapsed"]').textContent`);
    await delay(250);
    assert.equal(await evaluate(cdp, `document.querySelector('[data-testid="text-live-elapsed"]').textContent`), workoutPausedAt);
    const liveReload = cdp.waitForEvent('Page.loadEventFired');
    await cdp.send('Page.reload');
    await liveReload;
    await waitFor(async () => evaluate(cdp, `document.querySelector('[data-testid="status-live-workout"]')?.textContent === 'PAUSED'`), 'paused session recovery');
    await click(cdp, '[data-testid="button-pause-resume-workout"]');
    await delay(250);
    assert.notEqual(await evaluate(cdp, `document.querySelector('[data-testid="text-live-elapsed"]').textContent`), workoutPausedAt);
    await click(cdp, '[data-testid="button-end-workout"]');
    await click(cdp, '[data-testid="button-confirm-end-workout"]');
    await waitFor(async () => evaluate(cdp, `Boolean(document.querySelector('[data-testid="section-workout-session-history"]'))`), 'Movement session history after ending');
    assert.match(await evaluate(cdp, `document.querySelector('[data-testid="section-workout-session-history"]').textContent`), /Traditional Strength Training/);
    const historyReload = cdp.waitForEvent('Page.loadEventFired');
    await cdp.send('Page.reload');
    await historyReload;
    await navigateTo(cdp, 'steps');
    assert.match(await evaluate(cdp, `document.querySelector('[data-testid="section-workout-session-history"]').textContent`), /Traditional Strength Training/, 'completed session persists after refresh');
    await navigateTo(cdp, 'insights');
    assert.equal(await evaluate(cdp, `document.querySelector('[data-testid="text-advanced-workouts-completed"]').textContent`), '1', 'live completed session counts as a workout');
    await navigateTo(cdp, 'steps');
    await click(cdp, '[data-testid="button-start-workout-outdoor-walk"]');
    await waitFor(async () => evaluate(cdp, `Boolean(document.querySelector('[data-testid="screen-live-workout"]'))`), 'live walk screen after countdown', 6000);
    assert.equal(await evaluate(cdp, `document.querySelector('[data-testid="text-live-distance"]').textContent`), '—', 'unsupported motion does not fabricate distance');
    assert.equal(await evaluate(cdp, `document.querySelector('[data-testid="text-live-active-calories"]').textContent`), '—', 'unsupported motion does not fabricate calories');
    if (process.env.TIMER_SCREENSHOT_DIR) {
      const image = await cdp.send('Page.captureScreenshot', { format: 'png' });
      await writeFile(path.join(process.env.TIMER_SCREENSHOT_DIR, 'fitpulse-live-walk.png'), Buffer.from(image.data, 'base64'));
    }
    await click(cdp, '[data-testid="button-end-workout"]');
    await click(cdp, '[data-testid="button-confirm-end-workout"]');
    assert.match(await evaluate(cdp, `document.querySelector('[data-testid="section-workout-session-history"]').textContent`), /Outdoor Walk/);
    await navigateTo(cdp, 'dashboard');
    await click(cdp, '[data-testid="button-open-quick-meal"]');
    await setInput(cdp, '[data-testid="input-quick-meal-name"]', '<img src=x onerror=alert(1)>Oats<script>alert(1)</script>');
    await setInput(cdp, '[data-testid="input-quick-meal-calories"]', '320');
    await click(cdp, '[data-testid="button-submit-quick-meal"]');
    await navigateTo(cdp, 'macros');
    assert.match(await evaluate(cdp, `document.querySelector('.log-list')?.textContent`), /Oats/);
    assert.equal(await evaluate(cdp, `localStorage.getItem('fitpulse-macros').includes('<script>')`), false, 'malicious markup is not persisted');
    await setInput(cdp, '[data-testid="input-target-calories"]', '999999999');
    await click(cdp, '[data-testid="button-save-daily-targets"]');
    assert.match(await evaluate(cdp, `document.querySelector('[data-testid="status-target-error"]')?.textContent`), /1,000–10,000/, 'extreme targets are rejected');
    const intactProfile = await evaluate(cdp, `JSON.parse(localStorage.getItem('fitpulse-profile')).calorieTarget`);
    assert.notEqual(intactProfile, 999999999, 'invalid target does not replace saved profile');
    await navigateTo(cdp, 'plan');
    await setInput(cdp, '[data-testid="input-plan-weight"]', '500');
    await setInput(cdp, '[data-testid="input-plan-height"]', '230');
    await setInput(cdp, '[data-testid="input-plan-age"]', '14');
    await evaluate(cdp, `(() => {
      const input = document.querySelector('[data-testid="select-plan-activity"]');
      input.value = 'high';
      input.dispatchEvent(new Event('change', { bubbles: true }));
    })()`);
    assert.equal(await evaluate(cdp, `document.querySelector('[data-testid="button-apply-plan"]').disabled`), true, 'out-of-range generated plan cannot replace saved goals');
    assert.match(await evaluate(cdp, `document.querySelector('.plan-validation')?.textContent`), /supported target range/);
    await evaluate(cdp, `localStorage.setItem('fitpulse-workouts', JSON.stringify([
      {id:'invalid-date',exercise:'Squat',weight:70,reps:5,date:'2026-02-31'},
      ...JSON.parse(localStorage.getItem('fitpulse-workouts'))
    ]))`);
    const invalidDateReload = cdp.waitForEvent('Page.loadEventFired');
    await cdp.send('Page.reload');
    await invalidDateReload;
    await navigateTo(cdp, 'workout');
    assert.equal(await evaluate(cdp, `Boolean(document.querySelector('[data-testid="row-workout-invalid-date"]'))`), false, 'malformed saved workout date is rejected without crashing');
  } catch (error) {
    error.message += `\nVite output:\n${serverOutput}\nChromium output:\n${browserOutput}`;
    throw error;
  } finally {
    cdp?.close();
    await Promise.all([stopProcess(browser), stopProcess(server)]);
    await rm(profileDir, { recursive: true, force: true });
  }
});