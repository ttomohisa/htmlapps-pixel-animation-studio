'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{gunzipSync}=require('node:zlib');
const root=path.resolve(__dirname,'..'),dist=path.resolve(process.env.PIXEL_BUILD_DIR||path.join(root,'dist'));
const variants=[['source',fs.readFileSync(path.join(root,'src/index.template.html'),'utf8')]];
if(!process.env.PIXEL_SOURCE_ONLY){
 variants.push(['root',fs.readFileSync(path.join(root,'pixel-animation-studio.html'),'utf8')]);
 variants.push(['readable',fs.readFileSync(path.join(dist,'index.html'),'utf8')]);
 const wrapper=fs.readFileSync(path.join(dist,'index.self-extract.html'),'utf8');
 const payload=wrapper.match(/<script id="self-extract-payload"[^>]*>([\s\S]*?)<\/script>/);
 assert.ok(payload,'missing embedded HTML');variants.push(['self-extract',gunzipSync(Buffer.from(payload[1],'base64')).toString('utf8')]);
}
function fn(html,name){
 const marker=new RegExp('^      (?:async )?function '+name+'\\(','m'),start=html.search(marker);
 assert.ok(start>=0,'missing '+name);const rest=html.slice(start+1),next=rest.search(/\n      (?:async )?function /);
 assert.ok(next>=0,'missing delimiter for '+name);return html.slice(start,start+1+next);
}
function context(html,names,bindings){vm.createContext(bindings);vm.runInContext(names.map(name=>fn(html,name)).join('\n'),bindings);return bindings;}
function pngFile(w,h,valid=true){
 const header=Buffer.from([137,80,78,71,13,10,26,10,0,0,0,13,73,72,68,82,0,0,0,0,0,0,0,0]);
 header.writeUInt32BE(w,16);header.writeUInt32BE(h,20);if(!valid)header[0]=0;
 return {name:'input.png',type:'image/png',slice:(begin,end)=>({arrayBuffer:async()=>Uint8Array.from(header.subarray(begin,end)).buffer})};
}
for(const [label,html] of variants){
 test(label+': PNG IHDR is validated before decoding any oversized image',async()=>{
   let decoded=0;
   const c=context(html,['isPngFile','decodeImageElement','decodePngFile'],{
     Uint8Array,DataView,Image:class{},URL,validateDimension:v=>Number.isInteger(v)&&v>=1&&v<=128,
     createImageBitmap:async()=>{decoded++;return {width:2,height:2,close(){}};},
     document:{createElement:()=>({getContext:()=>({clearRect(){},drawImage(){},getImageData(){return {width:2,height:2};}})})}
   });
   await assert.rejects(c.decodePngFile(pngFile(50000,50000)),e=>e.code==='tooLarge'&&e.width===50000);
   await assert.rejects(c.decodePngFile(pngFile(2,2,false)),e=>e.code==='decode');
   assert.equal(decoded,0,'oversized/invalid PNG must not be decoded');
   const ok=await c.decodePngFile(pngFile(2,2));assert.equal(decoded,1);assert.equal(ok.width,2);
 });
 test(label+': closed sprite preview does not rasterize during export-panel updates',()=>{
   const elements=new Map(),timeouts=[];
   const $=id=>{if(!elements.has(id))elements.set(id,{value:'base',open:false,textContent:'',disabled:false,max:''});return elements.get(id);};
   const state={width:64,height:64,frames:Array.from({length:128},()=>({duration:100})),currentFrameIndex:0,pngScale:1,spriteLayout:'horizontal',spriteColumns:4,outputBase:'base',spritePreviewDirty:true,spritePreviewTimer:0};
   let draws=0;const c=context(html,['spriteGrid','queueSpritePreview','updateExportPanel'],{
     state,$,$$:()=>[],outputFilename:$('#outputFilename'),renderSpriteSheet:()=>{draws++;return {columns:128,rows:1}},formatText:(x)=>x,t:x=>x,
     window:{setTimeout:fn=>{timeouts.push(fn);return timeouts.length}},clearTimeout:()=>{},console,AppToast:{show(){}}
   });
   c.updateExportPanel();c.updateExportPanel();
   assert.equal($('#spriteOutputSize').textContent,'8192 × 64 px');assert.equal(draws,0);assert.equal(timeouts.length,0);
   $('#spritePreviewDetails').open=true;c.updateExportPanel();assert.equal(timeouts.length,1);assert.equal(draws,0);
   timeouts.shift()();assert.equal(draws,1);assert.equal(state.spritePreviewDirty,false);
   c.updateExportPanel();assert.equal(timeouts.length,0);
   state.spritePreviewDirty=true;c.updateExportPanel();assert.equal(timeouts.length,1);
 });
 test(label+': autosave includes current editing preferences and older saves stay compatible',()=>{
   const frame={imageData:{data:new Uint8ClampedArray(16)},duration:120};
   const state={width:2,height:2,frames:[frame],currentFrameIndex:0,color:'#123456',recentColors:[],grid:true,onionSkin:false,outputBase:'saved',tool:'selection',brushSize:4,previewLoop:false,pngScale:8,spriteLayout:'grid',spriteColumns:3};
   const c=context(html,['currentProjectSettings','serializeProject'],{state,Date,Uint8ClampedArray,PROJECT_SCHEMA_VERSION:1,DEFAULT_FRAME_DURATION:100,saveCurrentFrame(){}});
   const saved=c.serializeProject();assert.equal(saved.settings.tool,'selection');assert.equal(saved.settings.pngScale,8);assert.equal(saved.settings.spriteColumns,3);
   assert.match(html,/if\(settings && typeof settings==='object'\)/,'legacy recovery must tolerate absent settings');
 });
}
