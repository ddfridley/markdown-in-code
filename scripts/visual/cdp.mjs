export async function connect(port) {
  const pages = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const page = pages.find(page => page.type === 'page' && page.url.includes('workbench'));
  if (!page) throw new Error('No test workbench found');
  const socket = new WebSocket(page.webSocketDebuggerUrl);
  const pending = new Map();
  let id = 0;
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    const waiter = pending.get(message.id);
    if (!waiter) return;
    pending.delete(message.id); clearTimeout(waiter.timer);
    if (message.error) waiter.reject(new Error(JSON.stringify(message.error))); else waiter.resolve(message.result);
  });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('CDP connection timed out')), 10000);
    socket.addEventListener('open', () => { clearTimeout(timer); resolve(); }, { once: true });
    socket.addEventListener('error', error => { clearTimeout(timer); reject(error); }, { once: true });
  });
  return {
    command(method, params = {}) {
      return new Promise((resolve, reject) => {
        const requestId = ++id;
        const timer = setTimeout(() => { pending.delete(requestId); reject(new Error(`CDP timeout: ${method}`)); }, 10000);
        pending.set(requestId, { resolve, reject, timer });
        socket.send(JSON.stringify({ id: requestId, method, params }));
      });
    },
    close() { socket.close(); }
  };
}

export async function captureEditor(cdp, width, mutation, theme) {
  await cdp.command('Emulation.setDeviceMetricsOverride', { width, height: 800, deviceScaleFactor: 1, mobile: false });
  await cdp.command('Runtime.evaluate', { expression: `(() => {
    if (!document.getElementById('mic-visual-style')) {
      const style = document.createElement('style'); style.id = 'mic-visual-style';
      style.textContent = '.monaco-editor .cursor { visibility: hidden !important; } .notifications-toasts, .notifications-center { display: none !important; }' +
        ${JSON.stringify(mutation === 'missing-border' ? '[class*="TextEditorDecorationType"]::before, [class*="TextEditorDecorationType"]::after { border-color: transparent !important; }'
          : mutation === 'offset' ? '[class*="TextEditorDecorationType"]::before { transform: translateX(2px) !important; }' : '')};
      document.head.appendChild(style);
    }
  })()` });
  const layout = await cdp.command('Runtime.evaluate', { returnByValue: true, awaitPromise: true,
    expression: `(async () => {
      await document.fonts.ready;
      const expected = ${JSON.stringify(theme === 'dark' ? 'rgb(31, 31, 31)' : 'rgb(255, 255, 255)')};
      const deadline = performance.now() + 10000;
      while (getComputedStyle(document.querySelector('.monaco-editor-background')).backgroundColor !== expected) {
        if (performance.now() > deadline) throw new Error('Expected ${theme} editor theme did not paint');
        await new Promise(resolve => requestAnimationFrame(resolve));
      }
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const editor = document.querySelector('.monaco-editor');
      if (!editor) throw new Error('No editor to capture');
      const rect = editor.getBoundingClientRect();
      // The overview ruler shares the scrollbar gutter. Keep both out of the
      // capture using measured bounds rather than a font-dependent pixel inset.
      let right = Math.floor(rect.right);
      for (const element of editor.querySelectorAll('.scrollbar.vertical, .decorationsOverviewRuler')) {
        const gutter = element.getBoundingClientRect();
        if (gutter.width > 0 && gutter.left > rect.left && gutter.left < right) right = Math.floor(gutter.left);
      }
      const x = Math.ceil(rect.x);
      return { x, y: Math.ceil(rect.y), width: right - x, height: Math.floor(rect.height), scale: 1 };
    })()` });
  const clip = layout.result.value;
  if (!clip || clip.width < 100 || clip.height < 100) throw new Error(`Invalid editor clip: ${JSON.stringify(clip)}`);
  let previous;
  let matches = 0;
  for (let attempt = 0; attempt < 15; attempt++) {
    await cdp.command('Runtime.evaluate', { expression: 'new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))', awaitPromise: true });
    const { data } = await cdp.command('Page.captureScreenshot', { format: 'png', clip, captureBeyondViewport: false });
    const image = Buffer.from(data, 'base64');
    matches = previous?.equals(image) ? matches + 1 : 0;
    if (matches >= 2) return image;
    previous = image;
  }
  throw new Error('Editor pixels did not stabilize across three captures');
}
