import assert from 'node:assert/strict';

// Renderer geometry checks complement screenshots: they distinguish the native
// viewport branch from a temporarily narrow legacy text layer.
export async function assertFenceViewport(cdp, expectedEditors, requireNative = false) {
  const result = await cdp.command('Runtime.evaluate', { returnByValue: true, awaitPromise: true, expression: `(async () => {
    await document.fonts.ready;
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const canvas = document.createElement('canvas'), context = canvas.getContext('2d');
    return [...document.querySelectorAll('.monaco-editor')].flatMap(editor => {
      const label = [...editor.querySelectorAll('.view-lines span')].find(node => getComputedStyle(node, '::before').content.includes('TypeScript'));
      if (!label) return [];
      const lines = editor.querySelector('.view-lines');
      const native = editor.querySelector(':scope > .overflow-guard > .native-edit-context');
      const before = getComputedStyle(label, '::before');
      context.font = before.fontStyle + ' ' + before.fontWeight + ' ' + before.fontSize + ' ' + before.fontFamily;
      const zeroWidth = context.measureText('0').width;
      const data = { nativeWidth: native ? parseFloat(getComputedStyle(native).width) : null,
        variable: getComputedStyle(label).getPropertyValue('--mic-native-viewport-width').trim(),
        left: parseFloat(before.left), zeroWidth, linesWidth: parseFloat(getComputedStyle(lines).width) };
      // Missing native input must restore the original calculation in this
      // editor only. Restore its class synchronously before any input event.
      if (native) {
        const original = native.className;
        try {
          native.classList.remove('native-edit-context');
          data.fallbackVariable = getComputedStyle(label).getPropertyValue('--mic-native-viewport-width').trim();
          data.fallbackLeft = parseFloat(getComputedStyle(label, '::before').left);
        } finally { native.className = original; }
        const originalWidth = native.style.width;
        try {
          native.style.width = '4097px';
          data.wideVariable = getComputedStyle(label).getPropertyValue('--mic-native-viewport-width').trim();
          data.wideLeft = parseFloat(getComputedStyle(label, '::before').left);
        } finally { native.style.width = originalWidth; }
      } else { data.fallbackLeft = data.left; data.fallbackVariable = data.variable; }
      return [data];
    });
  })()` });
  if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
  const editors = result.result.value;
  assert.equal(editors.length, expectedEditors, 'Every visible fixture split must have a fence label');
  for (const editor of editors) {
    const hasNative = Number.isInteger(editor.nativeWidth) && editor.nativeWidth > 0 && editor.nativeWidth <= 4096;
    if (requireNative) assert.ok(hasNative, 'This renderer must exercise native-edit-context');
    if (hasNative) {
      assert.equal(parseFloat(editor.variable), editor.nativeWidth, 'Native width must belong to this editor');
      assert.ok(Math.abs(editor.left - (editor.nativeWidth + editor.zeroWidth) / 2) < 0.25, JSON.stringify(editor));
    } else assert.equal(editor.variable, '', 'Unsupported native width must use fallback');
    assert.equal(editor.fallbackVariable, '', 'Missing native input must not inherit another split width');
    assert.ok(Math.abs(editor.fallbackLeft - ((editor.linesWidth + editor.zeroWidth) / 2 - 7)) < 0.25, 'Legacy fallback: ' + JSON.stringify(editor));
    if (editor.nativeWidth !== null) {
      assert.equal(editor.wideVariable, '', 'Widths beyond lookup limit must use fallback');
      assert.ok(Math.abs(editor.wideLeft - editor.fallbackLeft) < 0.25, 'Wide viewport fallback');
    }
  }
  console.log(`PASS fence viewport geometry in ${expectedEditors} editor(s): ${editors.some(editor => editor.variable) ? 'native width and missing-element fallback' : 'legacy fallback'}`);
  return editors;
}
