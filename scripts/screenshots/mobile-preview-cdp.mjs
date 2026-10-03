import fs from 'node:fs/promises';

const targets = await (await fetch('http://localhost:9222/json/list')).json();
const target = targets.find(t => t.type === 'page');
if (!target) throw new Error('No capture browser page is available.');
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  ws.addEventListener('open', resolve, { once: true });
  ws.addEventListener('error', reject, { once: true });
});
let seq = 0;
const pending = new Map();
ws.addEventListener('message', e => {
  const msg = JSON.parse(e.data);
  const p = pending.get(msg.id);
  if (p) {
    pending.delete(msg.id);
    msg.error ? p.reject(new Error(JSON.stringify(msg.error))) : p.resolve(msg.result);
  }
});
function command(method, params = {}) {
  const id = ++seq;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(expression) {
  const r = await command('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails));
  return r.result.value;
}
try {
  const [action, ...args] = process.argv.slice(2);
  if (action === 'open') {
    await command('Emulation.setDeviceMetricsOverride', {
      width: 440, height: 956, deviceScaleFactor: 3, mobile: true,
      screenWidth: 440, screenHeight: 956,
    });
    await command('Emulation.setTouchEmulationEnabled', { enabled: true });
    await command('Page.navigate', { url: `https://${process.env.REPLIT_EXPO_DEV_DOMAIN}/` });
    await new Promise(resolve => setTimeout(resolve, 18000));
    console.log(await evaluate('document.body.innerText'));
  } else if (action === 'eval') {
    console.log(JSON.stringify(await evaluate(args.join(' ')), null, 2));
  } else if (action === 'capture') {
    await command('Emulation.setDeviceMetricsOverride', {
      width: 440, height: 956, deviceScaleFactor: 3, mobile: true,
      screenWidth: 440, screenHeight: 956,
    });
    await evaluate('document.fonts.ready.then(() => true)');
    await new Promise(resolve => setTimeout(resolve, 900));
    const r = await command('Page.captureScreenshot', {
      format: 'png', captureBeyondViewport: false, fromSurface: true,
    });
    const out = args[0];
    await fs.mkdir(out.slice(0, out.lastIndexOf('/')), { recursive: true });
    await fs.writeFile(out, Buffer.from(r.data, 'base64'));
    console.log(out);
  } else {
    throw new Error('Use open, eval EXPRESSION, or capture FILE.png');
  }
} finally {
  ws.close();
}