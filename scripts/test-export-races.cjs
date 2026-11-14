'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {test} = require('node:test');
const {gunzipSync} = require('node:zlib');

const root = path.resolve(__dirname,'..');
const dist = path.resolve(process.env.PIXEL_BUILD_DIR || path.join(root,'dist'));
const variants = [['source',fs.readFileSync(path.join(root,'src/index.template.html'),'utf8')]];
if (!process.env.PIXEL_SOURCE_ONLY) {
  variants.push(['readable',fs.readFileSync(path.join(dist,'index.html'),'utf8')]);
  variants.push(['standalone',fs.readFileSync(path.join(root,'pixel-animation-studio.html'),'utf8')]);
  const wrapper=fs.readFileSync(path.join(dist,'index.self-extract.html'),'utf8');
  const payload=wrapper.match(/<script id="self-extract-payload"[^>]*>([\s\S]*?)<\/script>/);
  assert.ok(payload,'self-extract payload is required');
  variants.push(['self-extract',gunzipSync(Buffer.from(payload[1],'base64')).toString('utf8')]);
}
function extract(html,name) {
  const marker=new RegExp('^      (?:async )?function '+name+'\\(','m');
  const start=html.search(marker);
  assert.ok(start>=0,'missing '+name);
  const rest=html.slice(start+1);
  const next=rest.search(/\n      (?:async )?function /);
  assert.ok(next>=0,'missing delimiter after '+name);
  return html.slice(start,start+1+next);
}
function contextFor(html,names,context) {
  vm.createContext(context);
  vm.runInContext(names.map(name=>extract(html,name)).join('\n'),context);
  return context;
}
class TestImageData {
  constructor(data,width,height) {
    this.data=data;this.width=width;this.height=height;
  }
}
function frame(width,height,seed) {
  const data=new Uint8ClampedArray(width*height*4);
  for(let i=0;i<data.length;i+=4) {
    data[i]=(i+seed)%256;data[i+1]=(seed*3)%256;data[i+2]=seed;data[i+3]=255;
  }
  return {imageData:new TestImageData(data,width,height),duration:seed===1?100:220};
}
function gifHarness(html) {
  const downloads=[],messages=[];
  const state={width:2,height:1,frames:[frame(2,1,1),frame(2,1,2)],currentFrameIndex:0,outputBase:'before',gifBusy:false};
  const elements={'#gifProgress':{hidden:true},'#gifProgressBar':{value:0,max:0},'#gifProgressText':{textContent:''},'#saveGifButton':{disabled:false}};
  const context={state,Uint8ClampedArray,Uint8Array,ImageData:TestImageData,Blob,console,
    DEFAULT_FRAME_DURATION:100,$:id=>elements[id],t:key=>key,formatText:key=>key,
    saveCurrentFrame(){},syncOutputBase(){},setTimeout:resolve=>resolve(),
    AppToast:{show:value=>messages.push(value)},
    downloadBlob:(blob,filename)=>downloads.push({blob,filename})};
  contextFor(html,['cloneImageData','gifLe16','gifNextPow2','gifPaletteAndIndices','gifLiteralLzw','encodeAnimatedGif','saveAnimatedGif'],context);
  return {context,state,downloads,messages};
}
function pngHarness(html) {
  const downloads=[],state={frames:[frame(2,1,1),frame(2,1,2)],currentFrameIndex:0,outputBase:'before',pngScale:1};
  let finish;
  const context={state,console,AppToast:{show(){}},t:key=>key,saveCurrentFrame(){},syncOutputBase(){},
    makeFrameCanvas:()=>({}),canvasToPngBlob:()=>new Promise(resolve=>finish=resolve),
    downloadBlob:(blob,filename)=>downloads.push({blob,filename})};
  contextFor(html,['saveCurrentFramePng'],context);
  return {context,state,downloads,complete:()=>finish(new Blob(['png']))};
}
function importHarness(html) {
  const state={width:0,height:0,frames:[],projectGeneration:0,importBusy:false,projectFileBusy:false};
  const controls={'#setupImportButton':{disabled:false},'#editorImportButton':{disabled:false},'#pngFileInput':{value:'selected'}};
  let finish;const activations=[],messages=[];
  const context={state,console,MAX_FRAMES:128,DEFAULT_FRAME_DURATION:100,$:id=>controls[id],
    t:key=>key,clearSelection(){},AppToast:{show:msg=>messages.push(msg),dismiss(){}},
    decodePngFile:()=>new Promise(resolve=>finish=resolve),
    activateImportedProject:(...args)=>activations.push(args),
    renderImportReport(){},saveCurrentFrame(){},makeFrame(){},cloneImageData(){},
    updateHistoryButtons(){},renderFrames(){},updateOnionSkin(){},scheduleAutosave(){},
    ctx:{putImageData(){}},setTimeout:resolve=>resolve()};
  contextFor(html,['importPngFiles'],context);
  return {context,state,controls,activations,messages,complete:()=>finish({width:64,height:64,imageData:frame(64,64,1).imageData})};
}

for(const [label,html] of variants) {
  test(label+': GIF retains 256 opaque colors and reserves transparency only when needed',async()=>{
    const h=gifHarness(html),data=new Uint8ClampedArray(256*4);
    for(let i=0;i<256;i++)data.set([i,0,0,255],i*4);
    const input=new TestImageData(data,16,16);
    const exact=h.context.gifPaletteAndIndices(input);
    assert.equal(exact.palette.length,256);
    assert.equal(exact.hasTransparency,false);
    assert.equal(new Set(exact.indices).size,256);
    h.state.width=16;h.state.height=16;h.state.frames=[{imageData:input,duration:100}];
    const gif=Buffer.from(await (await h.context.encodeAnimatedGif()).arrayBuffer());
    const gce=gif.indexOf(Buffer.from([0x21,0xF9,0x04]));
    assert.ok(gce>0);assert.equal(gif[gce+3]&1,0,'no transparent palette entry for an opaque GIF');
    const transparentData=new Uint8ClampedArray(data);transparentData[3]=0;
    const withAlpha=h.context.gifPaletteAndIndices(new TestImageData(transparentData,16,16));
    assert.equal(withAlpha.hasTransparency,true);
    assert.equal(withAlpha.palette.length,256);
    assert.equal(withAlpha.indices[0],0);
    assert.equal(new Set(withAlpha.indices).size,256);
  });
  test(label+': 257 opaque gradient colors reduce without collapsing into coarse buckets',()=>{
    const h=gifHarness(html),data=new Uint8ClampedArray(257*4);
    for(let i=0;i<257;i++)data.set([i%256,Math.floor(i/256),0,255],i*4);
    const result=h.context.gifPaletteAndIndices(new TestImageData(data,257,1));
    assert.equal(result.hasTransparency,false);
    assert.equal(result.palette.length,256);
    assert.ok([...result.indices].every(index=>index<result.palette.length));
    assert.ok(new Set(result.indices).size>=240,'a gradient must retain most of its distinct colors');
  });
  test(label+': transparency threshold and 256 opaque colors never overflow palette',()=>{
    const h=gifHarness(html),data=new Uint8ClampedArray(258*4);
    for(let i=0;i<256;i++)data.set([i,0,0,255],i*4);
    data.set([0,0,0,127],256*4);
    data.set([8,3,9,128],257*4);
    const result=h.context.gifPaletteAndIndices(new TestImageData(data,258,1));
    assert.equal(result.hasTransparency,true);
    assert.equal(result.palette.length,256);
    assert.equal(result.indices[256],0);
    assert.notEqual(result.indices[257],0);
    assert.ok([...result.indices].every(index=>index<256));
    assert.ok(new Set(result.indices.slice(0,256)).size>=240);
  });
  test(label+': GIF output is a consistent snapshot despite edits/deletion/replacement mid-encoding',async()=>{
    const baseline=gifHarness(html);
    const original=Buffer.from(await (await baseline.context.encodeAnimatedGif()).arrayBuffer());
    const h=gifHarness(html);
    const pending=h.context.encodeAnimatedGif();
    h.state.frames[1].imageData.data.fill(0);
    h.state.frames.pop();
    h.state.width=1;h.state.height=1;
    const actual=Buffer.from(await (await pending).arrayBuffer());
    assert.deepEqual(actual,original);
  });
  test(label+': GIF filename does not change while encoding',async()=>{
    const h=gifHarness(html);
    const pending=h.context.saveAnimatedGif();
    h.state.outputBase='after';
    await pending;
    assert.equal(h.downloads.length,1);
    assert.equal(h.downloads[0].filename,'before.gif');
  });
  test(label+': PNG filename stays with the captured frame',async()=>{
    const h=pngHarness(html);
    const pending=h.context.saveCurrentFramePng();
    h.state.currentFrameIndex=1;h.state.outputBase='after';
    h.complete();await pending;
    assert.equal(h.downloads.length,1);
    assert.equal(h.downloads[0].filename,'before-frame-01.png');
  });
  test(label+': sprite-sheet filename is fixed before the asynchronous PNG write',async()=>{
    let complete=null,filename='';
    const context={state:{frames:[frame(2,1,1)],outputBase:'original'},
      document:{createElement:()=>({})},console,AppToast:{show(){}},
      syncOutputBase(){},renderSpriteSheet(){},t:key=>key,
      canvasToPngBlob:()=>new Promise(resolve=>{complete=resolve;}),
      downloadBlob:(blob,name)=>{filename=name;}};
    contextFor(html,['saveSpriteSheet'],context);
    const pending=context.saveSpriteSheet();
    context.state.outputBase='changed';
    complete(new Blob(['png']));
    await pending;
    assert.equal(filename,'original-spritesheet.png');
  });
  test(label+': new frames added during PNG decoding cannot overflow the 128-frame limit',async()=>{
    const h=importHarness(html);
    h.state.width=64;h.state.height=64;
    h.state.frames=Array.from({length:127},()=>frame(64,64,1));
    const pending=h.context.importPngFiles([{name:'late.png',type:'image/png'}]);
    // The user adds a frame while image decoding is still pending.
    h.state.frames.push(frame(64,64,2));
    h.complete();
    await pending;
    assert.equal(h.state.frames.length,128);
    assert.equal(h.state.importReport.added,0);
    assert.equal(h.state.importReport.failures.length,1);
    assert.equal(h.state.importReport.failures[0].code,'frameLimit');
  });
  test(label+': late PNG decoding cannot modify a replaced project',async()=>{
    const h=importHarness(html);
    const pending=h.context.importPngFiles([{name:'original.png',type:'image/png'}]);
    h.state.projectGeneration++;
    h.state.width=32;h.state.height=32;
    h.complete();await pending;
    assert.equal(h.activations.length,0);
    assert.equal(h.state.frames.length,0);
    assert.equal(h.state.importBusy,false);
    assert.equal(h.controls['#setupImportButton'].disabled,false);
    assert.equal(h.controls['#pngFileInput'].value,'');
    assert.ok(h.messages.some(msg=>msg.message==='importCancelled'));
  });
  test(label+': visibility flush submits a pending autosave',()=>{
    let calls=0,callbacks=[];
    const state={width:16,persistenceAvailable:true,persistenceReady:true,autosaveTimer:0,autosaveQueued:false};
    const document={visibilityState:'visible'};
    const context={state,document,window:{setTimeout:fn=>{callbacks.push(fn);return 77;}},
      clearTimeout(){},updateAutosaveStatus(){},AUTOSAVE_DELAY:700,
      performAutosave:async()=>{calls++;}};
    contextFor(html,['scheduleAutosave','flushPendingAutosave'],context);
    context.scheduleAutosave();
    assert.equal(state.autosaveTimer,77);
    assert.equal(calls,0);
    document.visibilityState='hidden';context.flushPendingAutosave();
    assert.equal(calls,1);
    assert.equal(state.autosaveTimer,0);
    context.scheduleAutosave();
    assert.equal(calls,2,'hidden pages flush without the 700 ms delay');
    assert.match(html,/addEventListener\('visibilitychange'/);
    assert.match(html,/addEventListener\('pagehide', flushPendingAutosave\)/);
  });
  test(label+': stale deleted-frame Undo is guarded',()=>{
    assert.match(html,/onAction:\(\)=>\{if\(generation!==state\.projectGeneration\)return/);
    assert.match(html,/if\(state\.frames\.length>=MAX_FRAMES\)/);
  });
}
