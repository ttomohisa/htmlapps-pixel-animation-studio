'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {test}=require('node:test');
const {gunzipSync}=require('node:zlib');
const root=path.resolve(__dirname,'..');
const variants=[['source',fs.readFileSync(path.join(root,'src/index.template.html'),'utf8')]];
if(!process.env.PIXEL_SOURCE_ONLY){
  const dist=path.resolve(process.env.PIXEL_BUILD_DIR||path.join(root,'dist'));
  variants.push(['readable',fs.readFileSync(path.join(dist,'index.html'),'utf8')]);
  variants.push(['root',fs.readFileSync(path.join(root,'pixel-animation-studio.html'),'utf8')]);
  const packed=fs.readFileSync(path.join(dist,'index.self-extract.html'),'utf8');
  const payload=packed.match(/<script id="self-extract-payload"[^>]*>([\s\S]*?)<\/script>/);
  assert.ok(payload,'self-extract payload');
  variants.push(['self-extract',gunzipSync(Buffer.from(payload[1],'base64')).toString('utf8')]);
}
function getFunction(html,name){
  const m=new RegExp('^      (?:async )?function '+name+'\\(','m').exec(html);
  assert.ok(m, 'expected function '+name);
  if(name==='initializePersistence'){
    const boundary=html.indexOf('\n      const AppToast =',m.index);
    assert.ok(boundary>m.index,'recovery function boundary');
    return html.slice(m.index,boundary);
  }
  const rest=html.slice(m.index+m[0].length);
  const next=/\n      (?:async )?function [A-Za-z_$][\w$]*\(/.exec(rest);
  assert.ok(next, 'function boundary '+name);
  return html.slice(m.index,m.index+m[0].length+next.index);
}
for(const [label,html] of variants){
  test(label+': invalid IndexedDB frame never mutates the active project',()=>{
    const current=[{marker:'existing work'}],state={projectGeneration:5,width:16,height:16,frames:current};
    const context={state,Uint8ClampedArray,makeFrame(){throw new Error('unexpected valid frame');}};
    vm.createContext(context);
    vm.runInContext(getFunction(html,'restoreProject'),context);
    assert.throws(()=>context.restoreProject({
      width:2,height:2,frames:[{data:Uint8ClampedArray.from([1,2,3])}]
    }),/Invalid saved frame/);
    assert.equal(state.width,16);
    assert.equal(state.height,16);
    assert.equal(state.frames,current);
    assert.equal(state.projectGeneration,5);
  });
  test(label+': a new canvas created while IndexedDB opens wins over stale recovery',async()=>{
    const state={width:0,height:0,projectGeneration:3,persistenceReady:false},counters={saved:0,asked:0,restored:0,deleted:0,disabled:0};
    let resolveRead;
    const context={state,idbGetProject:()=>new Promise(resolve=>resolveRead=resolve),
      scheduleAutosave(){counters.saved++;},validateSavedProject:()=>true,
      AppConfirm:{ask:async()=>{counters.asked++;return true;}},
      restoreProject(){counters.restored++;},clearAutosave:async()=>{counters.deleted++;},
      disablePersistence(){counters.disabled++;},
      formatText:x=>x,t:x=>x};
    vm.createContext(context);
    vm.runInContext(getFunction(html,'initializePersistence'),context);
    const pending=context.initializePersistence();
    state.width=32;state.height=32;state.projectGeneration++;
    resolveRead({width:16,height:16,frames:[{}]});
    await pending;
    assert.equal(state.persistenceReady,true);
    assert.deepEqual(counters,{saved:1,asked:0,restored:0,deleted:0,disabled:0});
  });
  test(label+': a changed canvas is not overwritten after the restore prompt',async()=>{
    const state={width:0,height:0,projectGeneration:0,persistenceReady:false},counters={saved:0,restored:0,deleted:0};
    let respond;
    const context={state,idbGetProject:async()=>({width:16,height:16,frames:[{}]}),
      scheduleAutosave(){counters.saved++;},validateSavedProject:()=>true,
      AppConfirm:{ask:()=>new Promise(resolve=>respond=resolve)},
      restoreProject(){counters.restored++;},clearAutosave:async()=>{counters.deleted++;},
      disablePersistence(){throw Error('unexpected failure');},
      formatText:x=>x,t:x=>x};
    vm.createContext(context);
    vm.runInContext(getFunction(html,'initializePersistence'),context);
    const pending=context.initializePersistence();
    for(let attempt=0;attempt<5&&!respond;attempt++) await new Promise(resolve=>setImmediate(resolve));
    assert.equal(typeof respond,'function');
    state.projectGeneration++;state.width=64;state.height=64;
    respond(true);
    await pending;
    assert.deepEqual(counters,{saved:1,restored:0,deleted:0});
  });
  test(label+': Help names limitations without exposing the app version in its heading',()=>{
    assert.match(html,/helpLimitsTitle: '機能と注意事項'/);
    assert.match(html,/helpLimitsTitle: 'Features and limitations'/);
    assert.doesNotMatch(html,/(v1\.0\.5の範囲|v1\.0\.5 scope)/);
  });
}
test('post-merge release workflow requires a successful verified build and version change',()=>{
  const workflow=fs.readFileSync(path.join(root,'.github/workflows/release-on-merge.yml'),'utf8');
  assert.match(workflow,/'on':\s*\n\s*pull_request:\s*\n\s*types: \[closed\]/);
  assert.match(workflow,/if: github\.event\.pull_request\.merged == true/);
  assert.match(workflow,/needs: verify/);
  assert.match(workflow,/app\.config\.json/);
  assert.match(workflow,/CHANGELOG\.md/);
  assert.match(workflow,/--verify-tag/);
  assert.match(workflow,/--generate-notes/);
  assert.match(workflow,/gh release view/);
  assert.match(workflow,/git show-ref --verify/);
  assert.match(workflow,/contents: write/);
  assert.match(workflow,/dist\/index\.self-extract\.html/);
  assert.match(workflow,/permissions:\s*\n\s*contents: read/);
});
