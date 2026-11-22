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
  // Spacing declarations use the 8px scale; keep only the a11y-only -1px sr-only offset.
  const css=html.slice(html.indexOf('<style>')+7,html.indexOf('</style>'));
  const spacing=/\b((?:margin|padding)(?:-(?:top|bottom|right|left|inline|block))?|(?:row-|column-)?gap)\s*:\s*([^;{}]+);/g;
  for(const rule of css.matchAll(spacing)){
    for(const match of rule[2].matchAll(/(-?\d+(?:\.\d+)?)px\b/g)){
      const amount=Number(match[1]);
      if(amount===-1)continue;
      assert.equal(amount%8,0,rule[1]+' uses non-8px spacing: '+rule[2]);
    }
  }
  assert.match(html,/\.custom-card \{ margin-top:16px; padding:0; border:0; border-radius:0; background:transparent; \}/);
  assert.match(html,/\.setup-import-card \{ margin-top: 24px; padding: 24px 0 0; border: 0; border-top: 1px solid var\(--line\);/);
  assert.match(html,/\.export-card \{ min-width:0; padding:0 0 0 16px; border:0; border-left:1px solid var\(--line\);/);
  assert.match(html,/\.export-card:first-child \{ padding-left:0; border-left:0; \}/);
  assert.match(html,/\.export-info \{[^\n]*border-top:1px solid var\(--line\);[^\n]*background:transparent;/);
  assert.match(html,/\.mobile-setting-card \{ min-width:0; padding:0; border:0; border-radius:0; background:transparent; \}/);
  assert.match(html,/\.tool-button\[aria-pressed="true"\] \{[^\n]*box-shadow:inset 3px 0 0 var\(--accent\);/);
  assert.match(html,/\.segment-button\[aria-pressed="true"\] \{ border-bottom-color:var\(--accent\);/);
  for(const id of ['savePngButton','saveGifButton','saveSpriteSheetButton']){
    assert.match(html,new RegExp('class="button export-action" id="'+id+'"'));
    assert.doesNotMatch(html,new RegExp('class="button primary export-action" id="'+id+'"'));
  }
  assert.match(html,/id="saveProjectButton"[^>]*data-i18n="saveProject"/);
  assert.match(html,/class="setup-import-actions"/);
    assert.match(html,/connect-src 'none'/);
 });

 test(label+': custom size disclosure and live zoom fit control',()=>{
  assert.match(html,/<details class="custom-card" id="customCanvasDetails">/);
  assert.doesNotMatch(html,/<details class="custom-card" id="customCanvasDetails" open/);
  assert.match(html,/<summary class="custom-head">[\s\S]*?data-i18n="customTitle"[\s\S]*?<\/summary>/);
  assert.match(html,/\.custom-content \{ padding-top:16px; \}/);
  assert.match(html,/<span class="preset-note" data-i18n="presetLarge">最大サイズ<\/span>/);
  assert.match(html,/presetLarge: '最大サイズ'/);
  assert.match(html,/presetLarge: 'Maximum size'/);
  assert.doesNotMatch(html,/id="fitButton"/);
  assert.match(html,/<button class="zoom-label zoom-fit-button" id="toolbarScaleValue" type="button" data-i18n-title="fitScale"[^>]*>1×<\/button>/);
  assert.match(html,/\$\('#toolbarScaleValue'\)\.addEventListener\('click', \(\) => fitCanvas\(\{announceChange:true\}\)\)/);
  assert.match(html,/setAttribute\('aria-label',/);
  assert.match(html,/\$\('#customCanvasDetails'\)\.open=false;/);
  assert.match(html,/fitScale: 'Fit canvas to view'/);
  assert.match(html,/if\(state\.persistenceReady\) updateAutosaveStatus\(state\.persistenceAvailable \? \(\$\('#projectStatus'\)\.dataset\.state \|\| 'saved'\) : 'error'\);/);
  assert.match(html,/\.editor-topbar \{ display:none; \}/);
  assert.match(html,/\.canvas-footer > span \{ display:none; \}/);
  assert.match(html,/\.canvas-footer > \.project-info \{ display:flex;/);
  assert.match(html,/\.canvas-stage \{ height:min\(calc\(46dvh \+ 48px\), 448px\);/);
  assert.match(html,/function syncProjectInfoPlacement\(\)/);
  assert.match(html,/window\.matchMedia\('\(max-width: 640px\)'\)\.matches/);
  assert.match(html,/parent\.append\(projectInfo\)/);
  assert.match(html,/parent\.prepend\(projectInfo\)/);
 });

 test(label+': preview player hierarchy and frame seeking',()=>{
  assert.match(html,/<div class="preview-heading">/);
  assert.match(html,/\.preview-layout \{ display:grid; grid-template-columns:minmax\(0,1fr\); grid-template-areas:"heading" "stage" "actions" "scrubber"; width:min\(100%,704px\); margin-inline:auto; \}/);
  assert.match(html,/\.preview-copy \{ display:contents; \}/);
  assert.match(html,/\.preview-stage \{ grid-area:stage; width:100%; height:288px; display:grid; place-items:center;/);
  assert.match(html,/#previewCanvas \{[^}]*background:linear-gradient\(45deg,var\(--checker-b\)/);
  assert.match(html,/\.preview-layout \{ grid-template-areas:"stage" "heading" "actions" "scrubber"; width:100%; margin:0; justify-items:stretch; \}/);
  assert.match(html,/\.preview-heading \{ grid-area:heading;/);
  assert.match(html,/\.preview-actions \{ grid-area:actions;/);
  assert.match(html,/\.preview-scrubber \{ grid-area:scrubber;/);
  assert.match(html,/<img class="brand-mark" id="appBrandIcon" src="[^"]+" alt="" aria-hidden="true">/);
  assert.doesNotMatch(html,/<div class="brand-mark"/);
  assert.match(html,/<button class="preview-main" id="playPreviewButton" type="button" aria-pressed="false">/);
  assert.match(html,/id="previewPlayIcon"/);
  assert.match(html,/id="previewPauseIcon"[^>]*hidden/);
  assert.match(html,/<button class="preview-secondary" id="restartPreviewButton"/);
  assert.match(html,/<button class="preview-loop" id="loopPreviewButton" type="button" aria-pressed="true">/);
  assert.match(html,/<div class="preview-scrubber" id="previewScrubber" hidden><input id="previewFrameSlider" type="range"/);
  assert.doesNotMatch(html,/id="pausePreviewButton"|id="previewNote"|class="preview-note"/);
  assert.match(html,/\.preview-scrubber\[hidden\] \{ display:none; \}/);
  assert.match(html,/previewSeek:'Choose preview frame'/);
  assert.match(html,/previewSeek:'プレビューのフレームを選ぶ'/);
  assert.match(html,/toggle\.setAttribute\('aria-pressed', String\(state\.previewPlaying\)\)/);
  assert.match(html,/\$\('#previewPlayIcon'\)\.toggleAttribute\('hidden', state\.previewPlaying\)/);
  assert.match(html,/\$\('#previewPauseIcon'\)\.toggleAttribute\('hidden', !state\.previewPlaying\)/);
  assert.match(html,/function seekPreviewFrame\(value\)/);
  assert.match(html,/slider\.max = String\(Math\.max\(1, state\.frames\.length\)\)/);
  assert.match(html,/if \(!state\.previewPlaying\) state\.previewIndex = state\.currentFrameIndex;[\s\S]*?updatePreviewControls\(\);/);
  assert.match(html,/\$\('#previewFrameSlider'\)\.addEventListener\('input', event => seekPreviewFrame\(event\.target\.value\)\)/);
 });
}
