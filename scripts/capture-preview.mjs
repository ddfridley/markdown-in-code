// Capture only the workbench served by an explicitly launched local CDP endpoint.
// This is a visual-inspection utility, not a screenshot baseline test.
import { writeFile } from 'node:fs/promises';
const [port = '9444', output = '.vscode-test/box-preview.png', ...flags] = process.argv.slice(2);
if (!/^\d+$/.test(port)) throw new Error('Expected a local debug port');
const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const target = targets.find(target => target.type === 'page' && target.url.includes('workbench'));
if (!target) throw new Error('No VS Code workbench target found');
const socket = new WebSocket(target.webSocketDebuggerUrl);
const pending = new Map();
let id = 0;
socket.addEventListener('message', event => {
  const message = JSON.parse(event.data);
  const waiter = pending.get(message.id);
  if (!waiter) return;
  pending.delete(message.id);
  clearTimeout(waiter.timer);
  if (message.error) waiter.reject(new Error(JSON.stringify(message.error)));
  else waiter.resolve(message.result);
});
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true });
  socket.addEventListener('error', reject, { once: true });
});
function command(method, params = {}) {
  return new Promise((resolve, reject) => {
    const requestId = ++id;
    const timer = setTimeout(() => { pending.delete(requestId); reject(new Error(`Timed out: ${method}`)); }, 10000);
    pending.set(requestId, { resolve, reject, timer });
    socket.send(JSON.stringify({ id: requestId, method, params }));
  });
}
try {
  const viewportWidth = flags.find(flag => flag.startsWith('--width='))?.slice(8);
  if (viewportWidth) {
    if (!/^\d+$/.test(viewportWidth)) throw new Error('Expected a numeric viewport width');
    await command('Emulation.setDeviceMetricsOverride', { width: Number(viewportWidth), height: 800, deviceScaleFactor: 1, mobile: false });
    await command('Runtime.evaluate', { expression: 'new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))', awaitPromise: true });
  }
  if (flags.includes('--metrics')) {
    const metrics = await command('Runtime.evaluate', { returnByValue: true,
      expression: `Array.from(document.querySelectorAll('.monaco-editor')).map(editor => ({
        width: editor.getBoundingClientRect().width,
        scroll: Array.from(editor.querySelectorAll('.monaco-scrollable-element')).map(element => ({ width: element.clientWidth, scrollWidth: element.scrollWidth })),
        lines: editor.querySelector('.view-lines')?.getBoundingClientRect().width,
        decorations: Array.from(editor.querySelectorAll('.view-lines span')).flatMap(element => {
          const before = getComputedStyle(element, '::before');
          const after = getComputedStyle(element, '::after');
          if (!before.content.includes('┌') && after.borderTopWidth === '0px') return [];
          return [{ className: element.className, top: element.getBoundingClientRect().top,
            before: { content: before.content, height: before.height, verticalAlign: before.verticalAlign },
            after: { content: after.content, height: after.height, position: after.position, top: after.top, verticalAlign: after.verticalAlign, lineHeight: after.lineHeight, margin: after.margin } }];
        })
      }))` });
    console.log(JSON.stringify(metrics.result.value));
  }
  const result = await command('Page.captureScreenshot', { format: 'png' });
  await writeFile(output, Buffer.from(result.data, 'base64'));
  console.log(`Captured VS Code workbench to ${output}`);
  if (flags.includes('--close')) socket.send(JSON.stringify({ id: ++id, method: 'Browser.close' }));
} finally {
  socket.close();
}
