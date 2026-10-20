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

export async function captureEditor(cdp, width, mutation, theme, scrollRight = false) {
  await cdp.command('Emulation.setDeviceMetricsOverride', { width, height: 800, deviceScaleFactor: 1, mobile: false });
  await cdp.command('Runtime.evaluate', { expression: `(() => {
    if (!document.getElementById('mic-visual-style')) {
      const style = document.createElement('style'); style.id = 'mic-visual-style';
      style.textContent = '.monaco-editor .cursor { visibility: hidden !important; } .notifications-toasts, .notifications-center { display: none !important; }' +
        ${JSON.stringify(mutation === 'missing-border' ? '[class*="TextEditorDecorationType"]::before, [class*="TextEditorDecorationType"]::after { border-color: transparent !important; }'
          : mutation === 'offset' ? '[class*="TextEditorDecorationType"]::before { transform: translateX(2px) !important; }'
          : mutation === 'heading-size' ? '[class*="TextEditorDecorationType"] { font-size: 16px !important; }' : '')};
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
  if (scrollRight) {
    const before = await cdp.command('Runtime.evaluate', { returnByValue: true, expression: `(() => {
      const editor = document.querySelector('.monaco-editor');
      const bounds = editor.getBoundingClientRect();
      const slider = editor.querySelector('.scrollbar.horizontal .slider').getBoundingClientRect();
      return { sliderX: slider.left + slider.width / 2, sliderY: slider.top + slider.height / 2,
        sliderLeft: slider.left, right: bounds.right };
    })()` });
    const point = before.result.value;
    await cdp.command('Input.dispatchMouseEvent', { type: 'mouseMoved', x: point.sliderX, y: point.sliderY });
    await cdp.command('Input.dispatchMouseEvent', { type: 'mousePressed', x: point.sliderX, y: point.sliderY, button: 'left', buttons: 1, clickCount: 1 });
    await cdp.command('Input.dispatchMouseEvent', { type: 'mouseMoved', x: Math.min(point.sliderX + 200, point.right - 30), y: point.sliderY, button: 'left', buttons: 1 });
    await cdp.command('Input.dispatchMouseEvent', { type: 'mouseReleased', x: Math.min(point.sliderX + 200, point.right - 30), y: point.sliderY, button: 'left', buttons: 0, clickCount: 1 });
    const after = await cdp.command('Runtime.evaluate', { expression: `new Promise(resolve => setTimeout(() => resolve(document.querySelector('.monaco-editor .scrollbar.horizontal .slider').getBoundingClientRect().left), 250))`, awaitPromise: true });
    if (!(after.result.value > point.sliderLeft + 50)) throw new Error('Wrapped table did not scroll horizontally');
    console.log('PASS wrapped table actually scrolls horizontally');
  }
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

/** Exercise VS Code's native modifier-click path against a local fixture only. */
export async function controlClickLink(cdp, label, control = true, fraction = 0.5) {
  const result = await cdp.command('Runtime.evaluate', { returnByValue: true, expression: `(() => {
    for (const line of document.querySelectorAll('.monaco-editor .view-lines .view-line')) {
      const walker = document.createTreeWalker(line, NodeFilter.SHOW_TEXT);
      const nodes = []; let text = '';
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        nodes.push({ node, start: text.length }); text += node.textContent.split(String.fromCharCode(160)).join(' ');
      }
      const index = text.indexOf(${JSON.stringify(label)});
      if (index < 0) continue;
      const first = nodes.find(item => item.start + item.node.length > index);
      const last = nodes.find(item => item.start + item.node.length >= index + ${label.length});
      if (!first || !last) continue;
      const range = document.createRange(); range.setStart(first.node, index - first.start); range.setEnd(last.node, index + ${label.length} - last.start);
      const rect = range.getBoundingClientRect();
      if (rect.width && rect.height) return { x: rect.x + rect.width * ${fraction}, y: rect.y + rect.height / 2 };
    }
    throw new Error('Native link click label not found');
  })()` });
  if (result.exceptionDetails || !result.result.value) throw new Error(`Cannot locate native link click target: ${JSON.stringify(result.exceptionDetails ?? result.result)}`);
  const point = result.result.value;
  if (control) await cdp.command('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Control', code: 'ControlLeft', windowsVirtualKeyCode: 17, modifiers: 2 });
  try {
    await cdp.command('Input.dispatchMouseEvent', { type: 'mouseMoved', ...point, modifiers: control ? 2 : 0 });
    await cdp.command('Runtime.evaluate', { expression: 'new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))', awaitPromise: true });
    await cdp.command('Input.dispatchMouseEvent', { type: 'mousePressed', ...point, button: 'left', buttons: 1, clickCount: 1, modifiers: control ? 2 : 0 });
    await cdp.command('Input.dispatchMouseEvent', { type: 'mouseReleased', ...point, button: 'left', buttons: 0, clickCount: 1, modifiers: control ? 2 : 0 });
  } finally {
    if (control) await cdp.command('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Control', code: 'ControlLeft', windowsVirtualKeyCode: 17 });
  }
}

export async function clickEditorLine(cdp, lineNumber) {
  const result = await cdp.command('Runtime.evaluate', { returnByValue: true, expression: `(() => {
    const number = [...document.querySelectorAll('.monaco-editor .line-numbers')].find(node => node.textContent.trim() === ${JSON.stringify(String(lineNumber))});
    const lines = document.querySelector('.monaco-editor .view-lines');
    if (!number || !lines) throw new Error('Requested editor line is not visible');
    const rect = number.getBoundingClientRect(); return { x: lines.getBoundingClientRect().left + 2, y: rect.y + rect.height / 2 };
  })()` });
  if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
  const point = result.result.value;
  await cdp.command('Input.dispatchMouseEvent', { type: 'mouseMoved', ...point, modifiers: 0 });
  await cdp.command('Input.dispatchMouseEvent', { type: 'mousePressed', ...point, button: 'left', buttons: 1, clickCount: 1, modifiers: 0 });
  await cdp.command('Input.dispatchMouseEvent', { type: 'mouseReleased', ...point, button: 'left', buttons: 0, clickCount: 1, modifiers: 0 });
}
