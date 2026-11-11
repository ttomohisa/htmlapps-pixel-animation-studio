'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

const source = fs.readFileSync(path.join(__dirname, '../src/index.template.html'), 'utf8');

// Run the actual editor functions against minimal browser boundaries.
function productionFunction(name) {
  const marker = new RegExp('^      (?:async )?function ' + name + '\\(', 'm');
  const match = marker.exec(source);
  assert.ok(match, name + ' exists in production source');
  const tail = source.slice(match.index + match[0].length);
  const next = /\n      (?:async )?function [A-Za-z_$][\w$]*\(/.exec(tail);
  assert.ok(next, name + ' has a following function boundary');
  return source.slice(match.index, match.index + match[0].length + next.index);
}
function setup(names, bindings = {}) {
  const context = { Uint8Array, Uint8ClampedArray, Blob, ...bindings };
  vm.createContext(context);
  vm.runInContext(names.map(productionFunction).join('\n'), context);
  return context;
}
function rgbaPixels(colors) {
  const data = new Uint8ClampedArray(colors.length * 4);
  colors.forEach(([r,g,b,a=255], i) => data.set([r,g,b,a], i * 4));
  return { width: colors.length, height: 1, data };
}

test('opaque GIF palette retains all 256 distinct colors exactly', () => {
  const c = setup(['gifPaletteAndIndices']);
  const colors = Array.from({ length: 256 }, (_, i) => [i, 0, 0, 255]);
  const result = c.gifPaletteAndIndices(rgbaPixels(colors));
  assert.equal(result.hasTransparency, false);
  assert.equal(result.palette.length, 256);
  assert.equal(new Set(result.indices).size, 256);
  colors.forEach((color, i) => assert.deepEqual(Array.from(result.palette[result.indices[i]]), color.slice(0,3)));
});
test('255 opaque colors plus transparency use 256 palette entries', () => {
  const c = setup(['gifPaletteAndIndices']);
  const colors = Array.from({ length: 255 }, (_, i) => [i, 14, 27, 255]).concat([[0,0,0,0]]);
  const result = c.gifPaletteAndIndices(rgbaPixels(colors));
  assert.equal(result.hasTransparency, true);
  assert.equal(result.palette.length, 256);
  assert.equal(result.indices[255], 0);
  for(let i=0;i<255;i++) assert.deepEqual(Array.from(result.palette[result.indices[i]]), colors[i].slice(0,3));
});
test('257 opaque colors are reduced without invalid palette indices', () => {
  const c = setup(['gifPaletteAndIndices']);
  const colors=Array.from({length:257},(_,i)=>[Math.floor(i/256),i%256,30,255]);
  const result=c.gifPaletteAndIndices(rgbaPixels(colors));
  assert.equal(result.hasTransparency,false);
  assert.equal(result.palette.length,256);
  assert.ok([...result.indices].every(index=>index>=0&&index<result.palette.length));
  assert.ok(new Set(result.indices).size>=240,'color reduction should not collapse a gradient to a few colors');
});
test('256 colors and one transparent pixel reduce to 255 opaque slots', () => {
  const c=setup(['gifPaletteAndIndices']);
  const colors=Array.from({length:256},(_,i)=>[i,0,0,255]).concat([[0,0,0,0]]);
  const result=c.gifPaletteAndIndices(rgbaPixels(colors));
  assert.equal(result.hasTransparency,true);
  assert.equal(result.palette.length,256);
  assert.equal(result.indices[256],0);
  assert.ok([...result.indices].every(index=>index<256));
});

test('in-flight GIF export preserves original frames, size and delays', async () => {
  class ImageData {
    constructor(data,width,height) {this.data=data;this.width=width;this.height=height;}
  }
  const frame = (v,duration) => ({
    imageData: new ImageData(Uint8ClampedArray.from([v,v,v,255]),1,1),duration
  });
  const state={width:1,height:1,frames:[frame(0,100),frame(255,200)]};
  const elements=new Map(), $=id=>{if(!elements.has(id))elements.set(id,{hidden:true,max:0,value:0,textContent:''});return elements.get(id);};
  let ticks=0;
  const c=setup(['gifLe16','gifNextPow2','gifPaletteAndIndices','gifLiteralLzw','cloneImageData','encodeAnimatedGif'],{
    state,ImageData,$,saveCurrentFrame(){},DEFAULT_FRAME_DURATION:100,
    t:key=>key,formatText:()=>'',setTimeout:callback=>{
      if(++ticks===1){state.frames.splice(1,1);state.width=128;state.height=128;state.frames[0].imageData.data[0]=99;}
      callback();
    }
  });
  const blob=await c.encodeAnimatedGif(), bytes=new Uint8Array(await blob.arrayBuffer());
  assert.equal(String.fromCharCode(...bytes.slice(0,6)),'GIF89a');
  assert.equal(bytes[6],1); assert.equal(bytes[7],0);
  assert.equal(bytes[8],1); assert.equal(bytes[9],0);
  const delays=[];
  for(let i=0;i<bytes.length-7;i++) if(bytes[i]===0x21&&bytes[i+1]===0xF9&&bytes[i+2]===4)
    delays.push(bytes[i+4] | bytes[i+5]<<8);
  assert.deepEqual(delays,[10,20]);
  assert.equal(elements.get('#gifProgressBar').max,2);
});

test('PNG filename and selected frame remain paired after an async encode', async () => {
  let complete, saved;
  const state={frames:[{imageData:{value:'first'}},{imageData:{value:'second'}}],currentFrameIndex:0,outputBase:'original',pngScale:1};
  const c=setup(['saveCurrentFramePng'],{
    state,saveCurrentFrame(){},syncOutputBase(){},
    makeFrameCanvas:image=>image,canvasToPngBlob:()=>new Promise(resolve=>{complete=resolve;}),
    downloadBlob:(blob,name)=>{saved=name;},AppToast:{show(){}},t:x=>x,console
  });
  const saving=c.saveCurrentFramePng();
  state.currentFrameIndex=1; state.outputBase='changed'; complete(new Blob(['png']));
  await saving;
  assert.equal(saved,'original-frame-01.png');
});
test('sprite-sheet filename is captured before the async PNG encode', async () => {
  let complete,saved;
  const state={frames:[{}],outputBase:'before'};
  const c=setup(['saveSpriteSheet'],{
    state,syncOutputBase(){},document:{createElement(){return {};}},renderSpriteSheet(){},
    canvasToPngBlob:()=>new Promise(resolve=>{complete=resolve;}),
    downloadBlob:(blob,name)=>{saved=name;},AppToast:{show(){}},t:x=>x,console
  });
  const saving=c.saveSpriteSheet();state.outputBase='after';complete(new Blob(['png']));await saving;
  assert.equal(saved,'before-spritesheet.png');
});
test('PNG import cannot add old-sized frames after canvas replacement', async () => {
  let complete, activated=false;
  const state={importBusy:false,projectFileBusy:false,projectGeneration:1,width:0,height:0,frames:[],importReport:null};
  const elements=new Map(), $=id=>{if(!elements.has(id))elements.set(id,{disabled:false,value:''});return elements.get(id);};
  const toast={show(){},dismiss(){}};
  const c=setup(['importPngFiles'],{
    state,$,AppToast:toast,MAX_FRAMES:128,clearSelection(){},t:key=>key,
    decodePngFile:()=>new Promise(resolve=>{complete=resolve;}),
    activateImportedProject(){activated=true;},renderImportReport(){},setTimeout:callback=>callback()
  });
  const importing=c.importPngFiles([{name:'large.png'}]);
  state.projectGeneration=2;state.width=32;state.height=32;
  complete({width:64,height:64,imageData:{width:64,height:64}});
  await importing;
  assert.equal(activated,false);
  assert.equal(state.frames.length,0);
  assert.equal(state.importBusy,false);
  assert.equal(elements.get('#setupImportButton').disabled,false);
});
test('autosave is flushed when page becomes hidden or is dismissed', async () => {
  assert.match(source,/document\.addEventListener\('visibilitychange'.*flushPendingAutosave/);
  assert.match(source,/window\.addEventListener\('pagehide', flushPendingAutosave\)/);
  let cleared, writes=0;
  const state={persistenceAvailable:true,persistenceReady:true,width:32,autosaveTimer:7};
  const c=setup(['flushPendingAutosave'],{
    state,clearTimeout:id=>{cleared=id;},performAutosave:()=>{writes++;return Promise.resolve();}
  });
  c.flushPendingAutosave();
  assert.equal(cleared,7);assert.equal(state.autosaveTimer,0);assert.equal(writes,1);
});
