const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const { gunzipSync } = require('node:zlib');

const root = path.resolve(__dirname, '..');
const buildDir = path.resolve(process.env.PIXEL_BUILD_DIR || path.join(root, 'dist'));
const variants = [['source', fs.readFileSync(path.join(root, 'src/index.template.html'), 'utf8')]];
if (!process.env.PIXEL_SOURCE_ONLY) {
  variants.push(['readable', fs.readFileSync(path.join(buildDir, 'index.html'), 'utf8')],
    ['standalone', fs.readFileSync(path.join(root, 'pixel-animation-studio.html'), 'utf8')]);
  const wrapper = fs.readFileSync(path.join(buildDir, 'index.self-extract.html'), 'utf8');
  const payload = wrapper.match(/<script id="self-extract-payload"[^>]*>([\s\S]*?)<\/script>/);
  assert.ok(payload);
  variants.push(['self-extract', gunzipSync(Buffer.from(payload[1], 'base64')).toString('utf8')]);
}

// DOM and Canvas boundaries only. All editing, pointer, history, selection and
// export algorithms below execute the actual functions in each release.
class Element {
  constructor(id = '') {
    this.id = id; this.disabled = false; this.hidden = false; this.style = { setProperty() {} };
    this.classes = new Set(); this.listeners = {}; this.value = ''; this.scrollLeft = 0; this.scrollTop = 0;
    this.classList = { add: x => this.classes.add(x), remove: x => this.classes.delete(x),
      toggle: (x, enabled) => enabled ? this.classes.add(x) : this.classes.delete(x) };
  }
  addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }
  dispatch(type, event) { for (const fn of this.listeners[type] || []) fn(event); }
  click() { if (!this.disabled) this.dispatch('click', { currentTarget: this }); }
  setAttribute(name, value) { this[name] = value; }
  focus() { this.focused = true; }
  setPointerCapture() {}
  getBoundingClientRect() { return { left: 0, top: 0, width: this.width, height: this.height }; }
}
class ImageData {
  constructor(data, width, height) {
    if (typeof data === 'number') { height = width; width = data; data = new Uint8ClampedArray(width * height * 4); }
    this.width = width; this.height = height; this.data = data;
  }
}
class Canvas extends Element {
  constructor(width = 1, height = 1) { super(); this.width = width; this.height = height; }
  set width(value) { this.w = value; this.pixels = new Uint8ClampedArray(this.w * (this.h || 0) * 4); }
  get width() { return this.w; }
  set height(value) { this.h = value; this.pixels = new Uint8ClampedArray(this.w * this.h * 4); }
  get height() { return this.h; }
  getContext() {
    const c = this;
    return {
      getImageData(x, y, w, h) { const out = new ImageData(w, h); for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) {
        if (x + xx >= 0 && y + yy >= 0 && x + xx < c.width && y + yy < c.height)
          out.data.set(c.pixels.subarray(((y + yy) * c.width + x + xx) * 4, ((y + yy) * c.width + x + xx) * 4 + 4), (yy * w + xx) * 4);
      } return out; },
      putImageData(image, x, y) { for (let yy = 0; yy < image.height; yy++) for (let xx = 0; xx < image.width; xx++) {
        if (x + xx >= 0 && y + yy >= 0 && x + xx < c.width && y + yy < c.height)
          c.pixels.set(image.data.subarray((yy * image.width + xx) * 4, (yy * image.width + xx) * 4 + 4), ((y + yy) * c.width + x + xx) * 4);
      } },
      clearRect(x, y, w, h) { this.putImageData(new ImageData(w, h), x, y); },
      fillRect(x, y, w, h) { const image = new ImageData(w, h), color = this.fillStyle.match(/[a-f\d]{2}/gi).map(v => parseInt(v, 16)); for (let i = 0; i < image.data.length; i += 4) image.data.set([...color, 255], i); this.putImageData(image, x, y); },
      drawImage(source, x, y, w = source.width, h = source.height) { const image = new ImageData(w, h); for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) {
        const pos = (Math.floor(yy * source.height / h) * source.width + Math.floor(xx * source.width / w)) * 4;
        image.data.set(source.pixels.subarray(pos, pos + 4), (yy * w + xx) * 4);
      } this.putImageData(image, x, y); }
    };
  }
}
function extract(html, name) {
  const marker = new RegExp(`^      (?:async )?function ${name}\\(`, 'm');
  const start = html.search(marker); if (start < 0) return '';
  const tail = html.slice(start + 1); const end = tail.search(/\n      (?:async )?function /);
  return html.slice(start, end < 0 ? html.length : start + 1 + end);
}
function harness(html, width = 3, height = 5) {
  const elements = new Map([...html.matchAll(/id="([^"]+)"/g)].map(m => [m[1], new Element(m[1])]));
  const canvas = new Canvas(width, height), ctx = canvas.getContext(), stage = new Element();
  const state = { width, height, tool: 'selection', color: '#FF0000', previousValidColor: '#FF0000', recentColors: ['#112233'], brushSize: 1,
    selection: null, selectionDrag: null, clipboard: null, dirty: false, drawing: false, pointerId: null, pan: null, scale: 1, spacePressed: false,
    frames: [{ imageData: new ImageData(width, height), undoStack: [], redoStack: [], duration: 100 }], currentFrameIndex: 0,
    undoStack: [], redoStack: [], touchPointers: new Map(), touchGesture: null, touchGestureBlocked: false, deferredTouchAction: null,
    pngScale: 1, spriteLayout: 'horizontal', spriteColumns: 2, outputBase: 'pixel-animation' };
  const saved = [], announcements = [], downloads = [], encodedCanvases = [];
  const $ = selector => { const result = elements.get(selector.slice(1)); assert.ok(result, `Missing DOM element ${selector}`); return result; };
  const names = ['captureCanvas','imageDataEquals','commitHistory','undo','redo','saveCurrentFrame','cloneImageData',
    'hexToRgba','normalizeHex','rgbaToHex','rememberColor','applyColor','sampleColor','floodFill','runInstantTool',
    'normalizeSelection','pointInSelection','updateSelectionOverlay','clearSelection','selectionImage','copySelection','cutSelection','deleteSelection','pasteSelection','applySelectionMove',
    'canSelectAll','updateSelectAllButton','selectAll','beginSelection','continueSelection','finishSelection',
    'eventToPixel','paintPoint','drawInterpolated','beginStroke','continueStroke','finishStroke','cancelStrokeForGesture',
    'startPan','continuePan','endPan','touchCenterAndDistance','startTouchGesture','continueTouchGesture',
    'handleCanvasPointerDown','handleCanvasPointerMove','handleCanvasPointerEnd','setTool',
    'sanitizeFilenameBase','syncOutputBase','makeFrameCanvas','spriteGrid','renderSpriteSheet','saveCurrentFramePng','saveSpriteSheet',
    'gifLe16','gifNextPow2','gifPaletteAndIndices','gifLiteralLzw','encodeAnimatedGif','saveAnimatedGif'];
  const context = { $, $$: () => [], state, canvas, ctx, stage, selectionOverlay: $('#selectionOverlay'), outputFilename: $('#outputFilename'),
    ImageData, Uint8ClampedArray, Uint8Array, Blob, console, MAX_HISTORY: 30, MAX_SCALE: 64, DEFAULT_FRAME_DURATION: 100,
    document: { documentElement: new Element(), createElement: tag => { assert.equal(tag, 'canvas'); return new Canvas(); } },
    t: key => key, formatText: text => text, setTimeout: fn => { fn(); }, AppToast: { show() {} },
    announce: text => announcements.push(text), scheduleAutosave: () => saved.push(true),
    renderFrames: () => context.saveCurrentFrame(), updateHistoryButtons() {}, updateOnionSkin() {}, renderRecentColors() {}, updateToolSummary() {}, hideBrushPreview() {}, updateBrushPreview() {}, updateCanvasPresentation() {}, updateExportPanel() {},
    canvasToPngBlob: async target => { encodedCanvases.push({ width: target.width, height: target.height, data: Array.from(target.pixels) }); return new Blob(['synthetic-encoder-boundary'], {type:'image/png'}); },
    downloadBlob: (blob, filename) => downloads.push({blob, filename}) };
  vm.createContext(context); vm.runInContext(names.map(name => extract(html, name)).join('\n'), context);
  const registrations = html.match(/canvas\.addEventListener\('pointer(?:down|move|up|cancel)', [A-Za-z]+\)/g);
  assert.equal(registrations.length, 4); vm.runInContext(registrations.join(';'), context);
  const selectRegistration = html.match(/\$\('#selectAllButton'\)\.addEventListener\('click',\s*selectAll\)/);
  if (selectRegistration) vm.runInContext(selectRegistration[0], context);
  function send(type, id = 1, options = {}) { const event = { type, pointerType: 'touch', pointerId: id, clientX: 0, clientY: 0, button: 0, target: canvas, preventDefault() {}, ...options }; canvas.dispatch(type, event); }
  function seed() { for (let i = 0; i < canvas.pixels.length; i += 4) canvas.pixels.set([20 + i % 100, 80, 150, i % 12 === 0 ? 0 : i % 12 === 4 ? 128 : 255], i); context.saveCurrentFrame(); }
  return { context, state, canvas, ctx, $, send, saved, announcements, downloads, encodedCanvases, seed };
}
const plain = value => JSON.parse(JSON.stringify(value));
const pixels = h => Array.from(h.canvas.pixels);
function unchangedState(h) { return plain({ pixels: pixels(h), frames: h.state.frames, undo: h.state.undoStack, redo: h.state.redoStack,
  color: h.state.color, previous: h.state.previousValidColor, recent: h.state.recentColors, dirty: h.state.dirty, clipboard: h.state.clipboard, saved: h.saved }); }

for (const [label, html] of variants) {
  for (const tool of ['fill', 'eyedropper']) {
    test(`${label}: cancelled deferred ${tool} leaves pixels, color, history and saved data untouched`, () => {
      const h = harness(html); h.seed(); h.state.tool = tool;
      const before = unchangedState(h);
      h.send('pointerdown', 1, {clientX: 1});
      assert.deepEqual(unchangedState(h), before);
      h.send('pointercancel'); h.send('pointerup');
      assert.deepEqual(unchangedState(h), before);
      assert.equal(h.state.deferredTouchAction, null); assert.equal(h.state.touchPointers.size, 0);
    });
    test(`${label}: ${tool} normal release, unrelated cancellation and duplicate release`, () => {
      const h = harness(html); h.seed(); h.state.tool = tool;
      h.send('pointerdown', 1, {clientX: 1}); h.send('pointercancel', 99);
      assert.equal(h.state.deferredTouchAction.pointerId, 1);
      h.send('pointerup'); const after = unchangedState(h); h.send('pointerup'); h.send('pointercancel');
      assert.deepEqual(unchangedState(h), after);
      if (tool === 'fill') { assert.equal(h.state.undoStack.length, 1); assert.equal(h.canvas.pixels[4], 255); }
      else { assert.equal(h.state.color, '#185096'); assert.equal(h.state.undoStack.length, 0); assert.equal(h.saved.length, 1); }
    });
    test(`${label}: ${tool} two-finger gesture discards pending action and recovers`, () => {
      const h = harness(html); h.seed(); h.state.tool = tool; const before = unchangedState(h);
      h.send('pointerdown'); h.send('pointerdown', 2, {clientX: 2}); h.send('pointercancel', 1); h.send('pointerup', 2);
      assert.deepEqual(unchangedState(h), before); assert.equal(h.state.touchGestureBlocked, false);
      h.send('pointerdown', 3, {clientX: 1}); h.send('pointerup', 3);
      assert.notDeepEqual(unchangedState(h), before);
    });
    test(`${label}: mouse ${tool} still executes immediately`, () => {
      const h = harness(html); h.seed(); h.state.tool = tool;
      h.send('pointerdown', 1, {pointerType: 'mouse', clientX: 1});
      assert.equal(h.state.deferredTouchAction, null);
      if (tool === 'fill') assert.equal(h.state.undoStack.length, 1); else assert.equal(h.state.color, '#185096');
    });
  }
  for (const tool of ['pencil', 'eraser']) test(`${label}: ${tool} cancellation still finishes its existing stroke`, () => {
    const h = harness(html); h.seed(); h.state.tool = tool; const before = pixels(h);
    h.send('pointerdown', 1, {clientX: 1}); h.send('pointercancel');
    assert.equal(h.state.undoStack.length, 1); assert.notDeepEqual(pixels(h), before);
    h.context.undo(); assert.deepEqual(pixels(h), before);
  });
  test(`${label}: selection cancellation retains its existing rectangle semantics`, () => {
    const h = harness(html); h.send('pointerdown'); h.send('pointermove', 1, {clientX: 1, clientY: 2}); h.send('pointercancel');
    assert.deepEqual(plain(h.state.selection), {x: 0, y: 0, w: 2, h: 3}); assert.equal(h.state.selectionDrag, null); assert.equal(h.state.undoStack.length, 0);
  });
}

for (const [label, html] of variants) {
  test(`${label}: Select All is a native bilingual action separate from existing rectangle actions`, () => {
    assert.match(html, /<button[^>]*id="selectAllButton"[^>]*type="button"[^>]*data-i18n="selectAll"[^>]*>/);
    assert.match(html, /selectAll:\s*'すべて選択'/); assert.match(html, /selectAll:\s*'Select all'/);
    assert.match(html, /selectedAll:\s*'キャンバス全体を選択しました'/); assert.match(html, /selectedAll:\s*'Entire canvas selected'/);
    const h = harness(html); h.context.updateSelectionOverlay();
    assert.ok(h.$('#selectionTools').classes.has('active')); assert.equal(h.$('#selectAllButton').disabled, false);
    assert.equal(h.$('#selectionActions').classes.has('active'), false);
    h.$('#selectAllButton').click(); assert.deepEqual(plain(h.state.selection), {x:0,y:0,w:3,h:5});
    assert.ok(h.$('#selectionActions').classes.has('active'));
    h.context.clearSelection(); assert.equal(h.$('#selectionActions').classes.has('active'), false);
    assert.equal(h.$('#selectAllButton').disabled, false);
    h.context.setTool('pencil'); assert.equal(h.$('#selectionTools').classes.has('active'), false);
    assert.equal(h.$('#selectAllButton').disabled, true);
  });
  for (const [width, height] of [[1,1], [3,5], [128,128]]) test(`${label}: Select All ${width}x${height} is exact and does not change project data`, () => {
    const h = harness(html, width, height); h.seed(); h.state.selection = {x:0,y:0,w:1,h:1};
    h.state.clipboard = new ImageData(1,1); h.state.undoStack.push(new ImageData(width,height)); h.state.redoStack.push(new ImageData(width,height));
    h.state.frames.push({imageData: new ImageData(width,height),undoStack:[],redoStack:[],duration:250});
    h.context.updateSelectionOverlay();
    const before = unchangedState(h), clipboard = h.state.clipboard;
    assert.equal(typeof h.context.selectAll, 'function', 'Select All action is missing');
    h.context.selectAll(); assert.deepEqual(plain(h.state.selection), {x:0,y:0,w:width,h:height});
    h.context.selectAll(); assert.deepEqual(plain(h.state.selection), {x:0,y:0,w:width,h:height});
    assert.deepEqual(unchangedState(h), before); assert.equal(h.state.clipboard, clipboard);
    assert.equal(h.$('#selectionOverlay').style.width, `${width}px`); assert.equal(h.$('#selectionOverlay').style.height, `${height}px`);
  });
  test(`${label}: Select All guards empty projects, other tools and every active gesture`, () => {
    const blockers = [s => s.width=0, s => s.height=0, s => s.frames=[], s => s.tool='pencil', s => s.drawing=true,
      s => s.selectionDrag={pointerId:1}, s => s.pan={pointerId:1}, s => s.touchGesture={}, s => s.touchGestureBlocked=true,
      s => s.touchPointers.set(1, {x:0,y:0}), s => s.deferredTouchAction={pointerId:1,point:{x:0,y:0}}];
    for (const block of blockers) {
      const h = harness(html); block(h.state); h.context.updateSelectionOverlay();
      assert.equal(h.$('#selectAllButton').disabled, true); h.context.selectAll(); assert.equal(h.state.selection, null);
    }
  });
  test(`${label}: Select All disables during a rectangle drag and recovers after up or cancel`, () => {
    for (const end of ['pointerup', 'pointercancel']) {
      const h = harness(html); h.context.updateSelectionOverlay(); h.send('pointerdown');
      assert.equal(h.$('#selectAllButton').disabled, true); const before = plain(h.state.selection);
      h.$('#selectAllButton').click(); assert.deepEqual(plain(h.state.selection), before);
      h.send(end); assert.equal(h.$('#selectAllButton').disabled, false); h.$('#selectAllButton').click();
      assert.deepEqual(plain(h.state.selection), {x:0,y:0,w:3,h:5});
    }
  });
  test(`${label}: Select All disables during Space-pan and two-finger gestures then recovers`, () => {
    const h = harness(html); h.context.updateSelectionOverlay(); h.state.spacePressed=true;
    h.send('pointerdown',1,{pointerType:'mouse'}); assert.equal(h.$('#selectAllButton').disabled,true);
    h.send('pointercancel',1,{pointerType:'mouse'}); assert.equal(h.$('#selectAllButton').disabled,false);
    h.state.spacePressed=false; h.send('pointerdown'); h.send('pointerdown',2,{clientX:2});
    assert.equal(h.$('#selectAllButton').disabled,true); h.send('pointercancel',1); assert.equal(h.$('#selectAllButton').disabled,true);
    h.send('pointerup',2); assert.equal(h.$('#selectAllButton').disabled,false);
  });
  test(`${label}: selection ownership recovers when both gesture pointers end without committing an edit`, () => {
    const h=harness(html); h.seed(); h.state.selection={x:0,y:0,w:1,h:1}; const before=unchangedState(h);
    h.send('pointerdown'); h.send('pointerdown',2,{clientX:2}); const rectangle=plain(h.state.selection);
    h.send('pointercancel',1); h.send('pointerup',2);
    assert.equal(h.state.selectionDrag,null); assert.deepEqual(plain(h.state.selection),rectangle); assert.deepEqual(unchangedState(h),before);
  });
  test(`${label}: Select All re-enables after an active mouse stroke ends following a tool change`, () => {
    const h=harness(html); h.state.tool='pencil'; h.send('pointerdown',1,{pointerType:'mouse'}); h.context.setTool('selection');
    assert.equal(h.$('#selectAllButton').disabled,true); h.send('pointerup',1,{pointerType:'mouse'});
    assert.equal(h.$('#selectAllButton').disabled,false);
  });
  for (const operation of ['cutSelection','deleteSelection']) test(`${label}: full-canvas ${operation} is one reversible edit isolated to this frame`, () => {
    const h = harness(html); h.seed(); const before = pixels(h); const other = {imageData:new ImageData(3,5),undoStack:[],redoStack:[],duration:230}; h.state.frames.push(other);
    h.context.selectAll(); h.context[operation](); assert.equal(h.state.undoStack.length,1); assert.ok(pixels(h).every(value=>value===0));
    if (operation === 'cutSelection') assert.deepEqual(Array.from(h.state.clipboard.data), before);
    h.context.undo(); assert.deepEqual(pixels(h),before); assert.equal(h.state.undoStack.length,0); assert.equal(h.state.redoStack.length,1);
    h.context.redo(); assert.ok(pixels(h).every(value=>value===0)); assert.equal(h.state.undoStack.length,1);
    assert.ok(Array.from(other.imageData.data).every(value=>value===0)); assert.equal(other.duration,230); assert.equal(other.undoStack.length,0);
  });
  test(`${label}: full selection copy/paste, edge nudge and clear retain existing semantics`, () => {
    const h = harness(html); h.seed(); const before = pixels(h); h.context.selectAll(); h.context.copySelection();
    assert.deepEqual(Array.from(h.state.clipboard.data), before); assert.equal(h.state.undoStack.length,0);
    for (const [dx,dy] of [[-1,0],[1,0],[0,-5],[0,5]]) assert.equal(h.context.applySelectionMove(dx,dy),false);
    h.context.clearSelection(); h.context.pasteSelection(); assert.deepEqual(pixels(h), before); assert.equal(h.state.selection,null);
    h.context.selectAll(); h.context.deleteSelection(); h.context.pasteSelection(); assert.deepEqual(pixels(h),before); assert.equal(h.state.undoStack.length,2);
    h.context.setTool('eraser'); assert.equal(h.state.selection,null); assert.deepEqual(Array.from(h.state.clipboard.data),before);
  });
  test(`${label}: selecting the full canvas leaves PNG/sprite pixels, GIF bytes and filenames unchanged`, async () => {
    const h = harness(html); h.seed(); const original=pixels(h); h.state.frames.push({imageData:new ImageData(3,5),undoStack:[],redoStack:[],duration:250});
    h.context.outputFilename.value='my/sprite.gif'; const gifBefore=Buffer.from(await (await h.context.encodeAnimatedGif()).arrayBuffer());
    h.context.selectAll(); const gifAfter=Buffer.from(await (await h.context.encodeAnimatedGif()).arrayBuffer());
    assert.deepEqual(gifAfter,gifBefore); assert.equal(gifAfter.subarray(0,6).toString(),'GIF89a'); assert.equal(gifAfter.readUInt16LE(6),3); assert.equal(gifAfter.readUInt16LE(8),5); assert.equal(gifAfter.at(-1),0x3b);
    for (const scale of [1,2,4,8]) {
      h.state.pngScale=scale; await h.context.saveCurrentFramePng(); const result=h.encodedCanvases.at(-1);
      assert.equal(result.width,3*scale); assert.equal(result.height,5*scale); assert.equal(h.downloads.at(-1).filename,'my-sprite-frame-01.png');
      for(let y=0;y<result.height;y++) for(let x=0;x<result.width;x++) assert.deepEqual(result.data.slice((y*result.width+x)*4,(y*result.width+x)*4+4),original.slice((Math.floor(y/scale)*3+Math.floor(x/scale))*4,(Math.floor(y/scale)*3+Math.floor(x/scale))*4+4));
    }
    for (const layout of ['horizontal','grid']) {
      h.state.spriteLayout=layout; h.state.spriteColumns=1; await h.context.saveSpriteSheet(); const result=h.encodedCanvases.at(-1);
      assert.equal(result.width,layout==='horizontal'?6:3); assert.equal(result.height,layout==='horizontal'?5:10);
      assert.equal(h.downloads.at(-1).filename,'my-sprite-spritesheet.png');
      for(let y=0;y<5;y++)for(let x=0;x<3;x++)assert.deepEqual(result.data.slice((y*result.width+x)*4,(y*result.width+x)*4+4),original.slice((y*3+x)*4,(y*3+x)*4+4));
      const secondStart=layout==='horizontal'?3:5*3; assert.deepEqual(result.data.slice(secondStart*4,secondStart*4+4),[0,0,0,0]);
    }
    await h.context.saveAnimatedGif(); assert.equal(h.downloads.at(-1).filename,'my-sprite.gif'); assert.deepEqual(Buffer.from(await h.downloads.at(-1).blob.arrayBuffer()),gifBefore);
  });
}
