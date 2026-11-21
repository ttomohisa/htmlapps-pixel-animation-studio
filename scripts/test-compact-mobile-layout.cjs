'use strict';
const { test }=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),{gunzipSync}=require('node:zlib');
const root=path.resolve(__dirname,'..');
const variants=[['source',fs.readFileSync(path.join(root,'src/index.template.html'),'utf8')]];
if(!process.env.PIXEL_SOURCE_ONLY){
  variants.push(['root',fs.readFileSync(path.join(root,'pixel-animation-studio.html'),'utf8')]);
  const dist=path.resolve(process.env.PIXEL_BUILD_DIR||path.join(root,'dist'));
  variants.push(['readable',fs.readFileSync(path.join(dist,'index.html'),'utf8')]);
  const wrapper=fs.readFileSync(path.join(dist,'index.self-extract.html'),'utf8');
  const payload=wrapper.match(/<script id="self-extract-payload"[^>]*>([\s\S]*?)<\/script>/);
  assert.ok(payload,'self-extract payload must exist');
  variants.push(['self-extract',gunzipSync(Buffer.from(payload[1],'base64')).toString('utf8')]);
}
for(const [label,html] of variants){
 test(label+': compact intro and privacy visibility',()=>{
  assert.doesNotMatch(html,/id="introTitle"|introTitle:/);
  assert.match(html,/<div class="page-intro">\s*<p data-i18n="introLead">フレームごとにドット絵を描き、GIFやPNGに保存できます。<\/p>/);
  assert.match(html,/body\[data-project-state="editing"\] \.page-intro \{ display: none; \}/);
  assert.match(html,/@media \(max-width: 640px\)[\s\S]*?\.local-badge \{ display:none; \}/);
  assert.match(html,/introLead: 'Draw pixel art frame by frame and save it as GIF or PNG\.'/);
 });
 test(label+': secondary mobile actions remain available and connected',()=>{
  assert.doesNotMatch(html,/id="fileFallbackButton"|id="fileFallbackInput"|fileFallback:|class="file-fallback-button"/);
  assert.match(html,/<section class="frames-panel"[\s\S]*?<div class="mobile-frame-import">[\s\S]*?id="mobileImportButton"[\s\S]*?<\/section>/);
  assert.match(html,/<section class="export-panel"[\s\S]*?<div class="mobile-canvas-actions">[\s\S]*?id="mobileNewCanvasButton"[\s\S]*?<\/section>/);
  assert.match(html,/\['setupImportButton','editorImportButton','mobileImportButton'\]/);
  assert.match(html,/\['newCanvasButton','mobileNewCanvasButton'\]/);
  assert.match(html,/\.mobile-frame-import, \.mobile-canvas-actions \{ display:none; \}/);
  assert.match(html,/@media \(max-width: 640px\)[\s\S]*?\.mobile-frame-import \{ display:flex;/);
  assert.match(html,/@media \(max-width: 640px\)[\s\S]*?\.editor-top-actions \{ display:none; \}/);
  assert.match(html,/helpMobileActions: 'On phones, add PNG files from Frames/);
 });
 test(label+': quiet cards, 8px layout scale and local execution',()=>{
  assert.match(html,/\.panel \{\s*border: 1px solid var\(--line\); border-radius: 12px; background: var\(--surface\); box-shadow: none;/);
  assert.match(html,/\.main \{[^\n]*padding: 24px 32px 48px;/);
  assert.match(html,/\.setup-panel \{ padding: 24px; \}/);
  assert.match(html,/\.export-grid \{[^\n]*gap:16px;/);
  assert.match(html,/\.button\.subtle \{ min-height:44px;/);
  assert.match(html,/connect-src 'none'/);
 });
}
