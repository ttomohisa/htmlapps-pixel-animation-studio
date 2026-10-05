const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const { gunzipSync } = require('node:zlib');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'src/index.template.html'), 'utf8');
const readable = fs.readFileSync(path.join(root, 'dist/index.html'), 'utf8');
const standalone = fs.readFileSync(path.join(root, 'pixel-animation-studio.html'), 'utf8');
const wrapper = fs.readFileSync(path.join(root, 'dist/index.self-extract.html'), 'utf8');
const payload = wrapper.match(/<script id="self-extract-payload"[^>]*>([\s\S]*?)<\/script>/);
assert.ok(payload, 'Self-extracting release must contain its payload');
const restored = gunzipSync(Buffer.from(payload[1], 'base64')).toString('utf8');

// Minimal DOM boundaries only. The actual registered handlers and pan functions
// below are taken from each release, not reimplemented in this test harness.
class Element {
  constructor(tag, attributes = {}, parentElement = null) {
    this.tagName = tag.toUpperCase();
    this.attributes = attributes;
    this.parentElement = parentElement;
    this.isContentEditable = false;
    this.classes = new Set();
    this.classList = { add: name => this.classes.add(name), remove: name => this.classes.delete(name) };
    this.scrollLeft = 100;
    this.scrollTop = 100;
  }
  closest(selectors) {
    for (let element = this; element; element = element.parentElement) {
      if (selectors.split(',').some(selector => {
        const match = selector.trim().match(/^(\w+)?(?:\[([^=\]]+)(?:="?([^"\]]+)"?)?\])?$/);
        assert.ok(match, `Unsupported selector in test DOM: ${selector}`);
        const [, tag, attribute, value] = match;
        return (!tag || element.tagName === tag.toUpperCase()) && (!attribute ||
          (attribute in element.attributes && (value === undefined || element.attributes[attribute] === value)));
      })) return element;
    }
    return null;
  }
  focus(options) { this.focused = true; this.focusOptions = options; }
}
class Input extends Element { constructor() { super('input'); } }
class TextArea extends Element { constructor() { super('textarea'); } }
class Select extends Element { constructor() { super('select'); } }

function harness(html) {
  const start = html.indexOf("      window.addEventListener('keydown', event => { const target=event.target;");
  const end = html.indexOf("      $('#languageButton').addEventListener", start);
  assert.ok(start >= 0 && end > start, 'Production keyboard handlers must be present');
  const panStart = html.indexOf('      function startPan(event)');
  const panEnd = html.indexOf('      function touchCenterAndDistance()', panStart);
  const pointerStart = html.indexOf('      function handleCanvasPointerDown(event)');
  const pointerEnd = html.indexOf('      async function returnToSetup()', pointerStart);
  const handlers = {};
  const canvas = new Element('canvas');
  const stage = new Element('div');
  const editor = { hidden: false };
  const state = { tool: 'pencil', spacePressed: false, pan: null };
  const calls = [];
  const context = {
    Element, HTMLInputElement: Input, HTMLTextAreaElement: TextArea, HTMLSelectElement: Select,
    canvas, stage, state, document: { querySelector: () => context.dialogOpen ? {} : null },
    window: { addEventListener: (name, callback) => { handlers[name] = callback; } },
    $: selector => { assert.equal(selector, '#editorView'); return editor; },
    hideBrushPreview: () => calls.push('hideBrushPreview'),
    updateBrushPreview: () => {}, beginStroke: () => calls.push('beginStroke'),
    finishStroke: () => calls.push('finishStroke'),
  };
  for (const name of ['undo', 'redo', 'copySelection', 'cutSelection', 'pasteSelection', 'deleteSelection', 'clearSelection', 'applySelectionMove']) {
    context[name] = (...args) => calls.push([name, ...args]);
  }
  vm.createContext(context);
  vm.runInContext(html.slice(panStart, panEnd) + html.slice(pointerStart, pointerEnd) + html.slice(start, end), context);
  function key(type, target = canvas, options = {}) {
    const event = { target, key: ' ', code: 'Space', defaultPrevented: false,
      preventDefault() { this.defaultPrevented = true; }, ...options };
    handlers[type](event);
    return event;
  }
  return { context, canvas, stage, state, editor, handlers, calls, key };
}

for (const [label, html] of [['source', source], ['readable', readable], ['standalone', standalone], ['self-extract', restored]]) {
  test(`${label}: Space remains available to native and custom interactive controls`, () => {
    for (const target of [new Element('button'), new Element('span', {}, new Element('button')),
      new Element('a', { href: '#help' }), new Element('summary'),
      new Element('div', { role: 'button' }), new Element('div', { role: 'link' })]) {
      const h = harness(html);
      assert.equal(h.key('keydown', target).defaultPrevented, false, target.tagName);
      assert.equal(h.state.spacePressed, false);
      assert.equal(h.canvas.classes.has('is-pan-ready'), false);
      assert.equal(h.key('keydown', target, { repeat: true }).defaultPrevented, false);
      h.key('keyup', target);
    }
  });
  test(`${label}: inputs, editable text and open dialogs retain their keys`, () => {
    const editable = new Element('span'); editable.isContentEditable = true;
    for (const target of [new Input(), new TextArea(), new Select(), editable]) {
      const h = harness(html);
      assert.equal(h.key('keydown', target).defaultPrevented, false);
      assert.equal(h.key('keydown', target, { key: 'z', code: 'KeyZ', ctrlKey: true }).defaultPrevented, false);
      assert.equal(h.state.spacePressed, false);
    }
    const h = harness(html); h.context.dialogOpen = true;
    assert.equal(h.key('keydown').defaultPrevented, false);
    assert.equal(h.state.spacePressed, false);
  });
  test(`${label}: canvas and noninteractive editor surfaces keep Space-drag panning`, () => {
    for (const target of [new Element('canvas'), new Element('div'), new Element('body')]) {
      const h = harness(html);
      assert.equal(h.key('keydown', target).defaultPrevented, true);
      assert.equal(h.key('keydown', target, { repeat: true }).defaultPrevented, true);
      assert.equal(h.state.spacePressed, true);
      const pointer = { pointerType: 'mouse', button: 0, pointerId: 7, clientX: 20, clientY: 30, target: h.canvas, preventDefault() {} };
      h.context.handleCanvasPointerDown(pointer);
      assert.equal(h.state.pan.pointerId, 7);
      assert.ok(!h.calls.includes('beginStroke'));
      h.context.handleCanvasPointerMove({ ...pointer, clientX: 50, clientY: 40 });
      assert.equal(h.stage.scrollLeft, 70);
      assert.equal(h.stage.scrollTop, 90);
      h.key('keyup', new Input());
      assert.equal(h.state.spacePressed, false);
      assert.equal(h.canvas.classes.has('is-pan-ready'), false);
      h.context.handleCanvasPointerEnd(pointer);
      assert.equal(h.state.pan, null);
      assert.equal(h.canvas.classes.has('is-panning'), false);
      h.context.handleCanvasPointerDown(pointer);
      assert.ok(h.calls.includes('beginStroke'));
    }
  });
  test(`${label}: key release and window blur clear pan readiness after focus changes`, () => {
    for (const release of ['keyup', 'blur']) {
      const h = harness(html);
      h.key('keydown');
      if (release === 'blur') h.handlers.blur();
      else { h.context.dialogOpen = true; h.key('keyup', new Element('button')); }
      assert.equal(h.state.spacePressed, false);
      assert.equal(h.canvas.classes.has('is-pan-ready'), false);
    }
  });
  test(`${label}: canvas pointer interaction restores focus for the next Space-drag`, () => {
    const h = harness(html);
    const pointer = { pointerType: 'mouse', button: 0, pointerId: 8, clientX: 20, clientY: 30, target: h.canvas, preventDefault() {} };
    h.context.handleCanvasPointerDown(pointer);
    assert.equal(h.canvas.focused, true, 'preventDefault must not leave focus on the previously clicked toolbar button');
    assert.equal(h.canvas.focusOptions.preventScroll, true);
    h.context.handleCanvasPointerEnd(pointer);
    h.key('keydown', h.canvas);
    h.context.handleCanvasPointerDown(pointer);
    assert.equal(h.state.pan.pointerId, 8);
  });
  test(`${label}: hidden editor and an already handled Space do not start panning`, () => {
    const h = harness(html); h.editor.hidden = true;
    assert.equal(h.key('keydown').defaultPrevented, false);
    assert.equal(h.state.spacePressed, false);
    h.editor.hidden = false;
    h.key('keydown', h.canvas, { defaultPrevented: true });
    assert.equal(h.state.spacePressed, false);
  });
  test(`${label}: editing shortcuts still work while a toolbar button is focused`, () => {
    const h = harness(html), target = new Element('button');
    h.key('keydown', target, { key: 'z', code: 'KeyZ', ctrlKey: true });
    h.key('keydown', target, { key: 'z', code: 'KeyZ', metaKey: true, shiftKey: true });
    h.state.tool = 'selection'; h.state.selection = {};
    h.key('keydown', target, { key: 'ArrowRight', code: 'ArrowRight', shiftKey: true });
    assert.ok(h.calls.some(call => call[0] === 'undo'));
    assert.ok(h.calls.some(call => call[0] === 'redo'));
    assert.ok(h.calls.some(call => call[0] === 'applySelectionMove' && call[1] === 5 && call[2] === 0));
  });
}

test('root standalone matches readable build except the generated timestamp', () => {
  const normalize = html => html.replace(/("generatedAtUtc":")[^"]+(")/, '$1TIMESTAMP$2');
  assert.equal(normalize(standalone), normalize(readable));
});

test('self-extracting release restores the readable build byte-for-byte', () => {
  assert.equal(restored, readable);
});
