'use strict';
// Bounded native layout regression. Inputs are synthetic, with no personal data.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');
const cfg = {"slug": "pixel-animation-studio", "bp": 640, "nav": ".mobile-workspace-tabs", "header": "#helpDialog .dialog-head", "body": "#helpDialog .dialog-body", "details": "#helpDialog details.help-build", "ids": ["buildVersion", "builtAt", "dependencyCount"], "end": "#dependencyCount", "hideBuild": true};
const evidence = path.resolve('test-results/mobile-layout');
async function settle(page) { await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))); }
async function bounds(locator, width, height, label, vertical = true) {
  const r = await locator.boundingBox();
  assert.ok(r && r.x >= -1 && r.x + r.width <= width + 1 && (!vertical || (r.y >= -1 && r.y + r.height <= height + 1)), label + ': bounds ' + JSON.stringify(r));
}
async function metadata(page, rendered) {
  for (const id of cfg.ids) {
    assert.equal(await page.locator('#' + id).count(), 1, id + ' unique');
    assert.equal(await page.locator('#helpDialog #' + id).count(), 1, id + ' inside Help');
    assert.equal(await page.locator('main #' + id).count(), 0, id + ' removed from main');
  }
  assert.match(await page.locator('#buildVersion').textContent(), /^\d+\.\d+\.\d+$/);
  assert.match(await page.locator('#builtAt').textContent(), /^\d{4}-\d\d-\d\dT/);
  if (cfg.slug === 'ffmpeg-filter-builder') {
    assert.equal(await page.locator('#builderVersion').textContent(), rendered ? 'v1.10.2' : '—', 'preserve lazy runtime population');
    for (const id of ['threadMode', 'isolationValue', 'filterCount', 'encoderList', 'workerCount']) {
      assert.equal(await page.locator('#' + id).count(), 1);
      assert.equal(await page.locator('main #' + id).count(), 1, id + ' remains operational');
    }
    assert.equal(await page.locator('#isolationValue').textContent(), 'false', 'file mode remains non-isolated');
    if (rendered) {
      assert.equal(await page.locator('#threadMode').textContent(), 'single-thread');
      assert.match(await page.locator('#filterCount').textContent(), /^[1-9]\d*$/);
      assert.match(await page.locator('#encoderList').textContent(), /libx264/);
      assert.equal(await page.locator('#workerCount').textContent(), '0');
    }
  } else assert.match(await page.locator('#dependencyCount').textContent(), /^\d+$/);
}
async function main() {
  fs.mkdirSync(evidence, { recursive: true });
  const browser = await chromium.launch();
  try {
    const cases = [];
    for (const language of ['ja', 'en']) for (const [width, height] of [[1360,900], [cfg.bp+1,568], [cfg.bp,568], [320,568], [393,252]]) cases.push({ file:'dist/index.html', language, width, height });
    cases.push({file:'dist/index.self-extract.html',language:'en',width:360,height:640}, {file:cfg.slug+'.html',language:'ja',width:1360,height:900});
    if (cfg.slug === 'ffmpeg-filter-builder') cases.push({file:'dist/index.mt.html',language:'en',width:320,height:568}, {file:cfg.slug+'.mt.html',language:'ja',width:1360,height:900});
    for (const {file, language, width, height} of cases) {
      const context = await browser.newContext({ viewport:{width,height}, locale:language, reducedMotion:'reduce' });
      const page = await context.newPage(), errors = [], requests = [], label = `${file} ${language} ${width}x${height}`;
      page.on('pageerror', e => errors.push(e.message));
      page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
      page.on('request', r => { if (/^https?:/.test(r.url())) requests.push(r.url()); });
      let rendered = false;
      try {
        await page.goto(pathToFileURL(path.resolve(file)).href);
        await page.locator('#helpButton').waitFor();
        await page.waitForFunction(() => /^\d+\.\d+\.\d+$/.test(document.querySelector('#buildVersion').textContent));
        if (await page.locator('html').getAttribute('lang') !== language) await page.locator('#languageButton').click();
        assert.equal((await page.locator('[data-i18n="localBadge"]').textContent()).trim(), language === 'ja' ? '完全ローカル処理' : 'Fully local processing');
        const custom = page.locator('#customCanvasDetails');
        assert.equal(await custom.evaluate(el=>el.open),false,label+': Custom starts folded');
        assert.equal(await page.locator('#customWidth').isVisible(),false,label+': Custom inputs are initially hidden');
        assert.equal((await page.locator('[data-i18n="presetLarge"]').textContent()).trim(),language==='ja'?'最大サイズ':'Maximum size',label+': preset note');
        await custom.locator('summary').focus(); await page.keyboard.press('Enter');
        assert.equal(await custom.evaluate(el=>el.open),true,label+': Enter expands Custom');
        assert.equal(await page.locator('#customWidth').isVisible(),true,label+': custom dimensions become visible');
        await page.keyboard.press('Space');
        assert.equal(await custom.evaluate(el=>el.open),false,label+': Space folds Custom');
        if (file==='dist/index.html' && language==='ja' && [320,1360].includes(width)) {
          await page.screenshot({path:path.join(evidence,'ja-'+width+'-setup.png')});
        }
        const setupStyles=await page.evaluate(() => {
          const computed = selector=>getComputedStyle(document.querySelector(selector));
          return {customBorderLeft:computed('.custom-card').borderLeftWidth,
                  customBorderTop:computed('.custom-card').borderTopWidth,
                  importBorderLeft:computed('.setup-import-card').borderLeftWidth,
                  importBorderTop:computed('.setup-import-card').borderTopWidth};
        });
        assert.deepEqual(setupStyles,{customBorderLeft:'0px',customBorderTop:'0px',importBorderLeft:'0px',importBorderTop:'1px'},label+': Custom unboxed; import retains divider');
        assert.equal(await page.locator('.local-badge').isVisible(), width > cfg.bp, label + ': local badge hidden on phones');
        if (width > cfg.bp) await bounds(page.locator('.local-badge'), width, height, label, false);
        assert.equal(await page.locator('body > footer').isVisible(), width > cfg.bp, label + ': initial footer');
        assert.equal(await page.locator(cfg.nav).isVisible(),false,'no project yet');
        await page.locator('[data-preset="16"]').click();
        await page.waitForFunction(()=>document.body.dataset.projectState==='editing');
        assert.equal(await page.locator('#editorView').isVisible(),true);
        const mobileLayout=width<=cfg.bp;
        assert.equal(await page.locator('.editor-topbar').isVisible(),!mobileLayout,label+': project header only on desktop');
        assert.equal(await page.locator('.canvas-footer .project-info').count(),mobileLayout?1:0,label+': project metadata moved to footer on phones');
        assert.equal(await page.locator('.editor-topbar .project-info').count(),mobileLayout?0:1,label+': one live project status');
        assert.equal(await page.locator('#projectSize').isVisible(),true,label+': canvas dimensions remain visible');
        assert.equal((await page.locator('#projectSize').textContent()).trim(),'16 × 16',label+': same dimensions in moved info');
        assert.equal(await page.locator('.canvas-footer > span:first-child').isVisible(),!mobileLayout,label+': redundant zoom footer hidden on phones');
        assert.equal(await page.locator('#projectStatus').isVisible(),true,label+': autosave status remains visible');
        if (mobileLayout) {
          const stageHeight=await page.locator('#canvasStage').evaluate(el=>parseFloat(getComputedStyle(el).height));
          assert.ok(stageHeight>=Math.min(height*.46,400)+40,label+': taller phone canvas '+stageHeight);
          assert.ok((await page.locator('.canvas-footer').boundingBox()).height<=48,label+': compact phone metadata footer');
        }
        assert.equal(await page.locator('#fitButton').count(),0,label+': separate Fit button removed');
        const liveZoom=page.locator('#toolbarScaleValue');
        const fittedZoom=(await liveZoom.textContent()).trim();
        assert.match(fittedZoom,/^\d+×$/,label+': live zoom is a button');
        assert.match(await liveZoom.getAttribute('aria-label'),language==='ja'?/全体を表示/:/Fit canvas to view/,label+': accessible fit label');
        await page.locator('#zoomInButton').click();
        assert.notEqual((await liveZoom.textContent()).trim(),fittedZoom,label+': zoom increment');
        await liveZoom.click();
        assert.equal((await liveZoom.textContent()).trim(),fittedZoom,label+': tapping live zoom fits canvas');
        await page.locator('#zoomInButton').click();
        await liveZoom.focus(); await page.keyboard.press('Space');
        assert.equal((await liveZoom.textContent()).trim(),fittedZoom,label+': Space on live zoom fits canvas');
        assert.ok((await liveZoom.getAttribute('aria-label')).startsWith(fittedZoom+' · '),label+': accessible current zoom');
        const editorStyles=await page.evaluate(() => {
          const computed = selector=>getComputedStyle(document.querySelector(selector));
          return {
            exportCardBorderLeft:computed('.export-card:nth-child(2)').borderLeftWidth,
            projectFileBorderLeft:computed('.project-file-card').borderLeftWidth,
            projectFileBorderBottom:computed('.project-file-card').borderBottomWidth,
            exportInfoBackground:computed('.export-info').backgroundColor,
            exportButtonBackground:computed('#savePngButton').backgroundColor
          };
        });
        assert.equal(editorStyles.projectFileBorderLeft,'0px',label+': no project-card box');
        assert.equal(editorStyles.projectFileBorderBottom,'1px',label+': project separation');
        assert.equal(editorStyles.exportCardBorderLeft,width<=cfg.bp?'0px':'1px',label+': export rows or columns');
        assert.equal(editorStyles.exportInfoBackground,'rgba(0, 0, 0, 0)',label+': export metadata unboxed');
        if(file==='dist/index.html' && language==='ja' && [320,1360].includes(width))
          await page.screenshot({path:path.join(evidence,'ja-'+width+'-editor.png')});
        assert.equal(await page.locator('.page-intro').isVisible(),false,label + ': intro hidden in editor');
        assert.equal(await page.locator('#fileFallbackButton').count(),0,label + ': extra picker removed');
        for (const w of [cfg.bp+1, cfg.bp, width]) {
          await page.setViewportSize({width:w,height}); await settle(page);
          assert.equal(await page.locator('body > footer').isVisible(), w > cfg.bp, label + ': footer resize');
          assert.equal(await page.locator(cfg.nav).isVisible(), w <= cfg.bp, label + ': functional bar');
          assert.equal(await page.locator('.editor-topbar').isVisible(),w>cfg.bp,label+': topbar breakpoint');
          assert.equal(await page.locator('.canvas-footer .project-info').count(),w<=cfg.bp?1:0,label+': status follows breakpoint');
          assert.equal(await page.locator('.editor-topbar .project-info').count(),w>cfg.bp?1:0,label+': desktop status restored');
          assert.equal(await page.locator('#projectStatus').count(),1,label+': one status element after resize');
          assert.equal(await page.locator('#projectStatus').isVisible(),true,label+': status visible after resize');
           assert.equal(await page.locator('.editor-top-actions').isVisible(), w > cfg.bp, label + ': top actions only on desktop');
          if (w <= cfg.bp) await bounds(page.locator(cfg.nav), w, height, label);
        }
        if (width <= cfg.bp) {
          await page.locator('[data-mobile-page-button="frames"]').click();
          assert.equal(await page.locator('#mobileImportButton').isVisible(),true,label + ': PNG import available under Frames');
          assert.equal(await page.locator('#editorImportButton').isVisible(),false,label + ': top import hidden');
          await bounds(page.locator('#mobileImportButton'),width,height,label,false);
          await page.locator('[data-mobile-page-button="export"]').click();
          assert.equal(await page.locator('#mobileNewCanvasButton').isVisible(),true,label + ': new canvas available under Export');
          const mobileStyles=await page.evaluate(()=>{
            const computed=selector=>getComputedStyle(document.querySelector(selector));
            return {settingsBorder:computed('.mobile-setting-card').borderLeftWidth,
                    exportBorderLeft:computed('.export-card:nth-child(2)').borderLeftWidth,
                    exportBorderTop:computed('.export-card:nth-child(2)').borderTopWidth};
          });
          assert.deepEqual(mobileStyles,{settingsBorder:'0px',exportBorderLeft:'0px',exportBorderTop:'1px'},label+': phone settings and exports are flat sections');
          if(file==='dist/index.html' && language==='ja' && width===320)
            await page.screenshot({path:path.join(evidence,'ja-320-export.png')});
          assert.equal(await page.locator('#newCanvasButton').isVisible(),false,label + ': top new canvas hidden');
          await bounds(page.locator('#mobileNewCanvasButton'),width,height,label,false);
          await page.locator('[data-mobile-page-button="edit"]').click();
        }
        await page.evaluate(() => scrollTo({left:0,top:0,behavior:'instant'})); await settle(page);
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), label + ': page width');
        await page.locator('#helpButton').click();
        const body = page.locator(cfg.body), details = page.locator(cfg.details);
        await metadata(page, rendered);
        assert.ok(await body.evaluate(e => e.lastElementChild.classList.contains('help-build')), label + ': final Help child');
        const hiddenBuild = cfg.hideBuild && width <= cfg.bp;
        assert.equal(await details.isVisible(), !hiddenBuild, label + ': preserve metadata visibility');
        if (!hiddenBuild) {
          assert.equal(await details.evaluate(e => e.open), false);
          const summary = details.locator('summary');
          await summary.scrollIntoViewIfNeeded(); await summary.focus(); await page.keyboard.press('Enter');
          assert.equal(await details.evaluate(e => e.open), true);
          assert.equal(await page.locator('#helpDialog').isVisible(), true, label + ': keyboard disclosure stays inside Help');
        }
        await body.evaluate(e => { e.scrollTop = e.scrollHeight; }); await settle(page);
        const end = page.locator(hiddenBuild ? '[data-i18n="helpMobileActions"]' : cfg.end);
        const last = await end.evaluate(el => {
          const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT); let node, last;
          while (node = walker.nextNode()) if (node.textContent.trim()) last = node;
          if (!last) throw Error('No final Help text');
          const range = document.createRange(); range.setStart(last,last.textContent.trimEnd().length-1); range.setEnd(last,last.textContent.trimEnd().length);
          const r = range.getBoundingClientRect(); let top = 0, bottom = innerHeight;
          for (let p = el.parentElement; p; p = p.parentElement) if (/auto|scroll|hidden|clip/.test(getComputedStyle(p).overflowY)) {
            const b = p.getBoundingClientRect(); top = Math.max(top,b.top); bottom = Math.min(bottom,b.bottom);
          }
          return {top:r.top,bottom:r.bottom,clipTop:top,clipBottom:bottom};
        });
        assert.ok(last.top >= last.clipTop-1 && last.bottom <= last.clipBottom+1, label + ': Help end ' + JSON.stringify(last));
        assert.ok(await body.evaluate(e => e.scrollWidth <= e.clientWidth+1), label + ': Help width');
        await bounds(page.locator(cfg.header), width, height, label);
        const chrome = await page.locator(cfg.header).evaluate(header => {
          const rect = e => { const r=e.getBoundingClientRect(); return {x:r.x,y:r.y,width:r.width,height:r.height}; };
          return {header:rect(header),dialog:rect(header.closest('dialog')),title:rect(header.querySelector('h2')),close:rect(header.querySelector('button'))};
        });
        for (const key of ['title','close']) {
          const r=chrome[key], h=chrome.header, d=chrome.dialog;
          assert.ok(r.x>=Math.max(h.x,d.x)-1 && r.x+r.width<=Math.min(h.x+h.width,d.x+d.width)+1 && r.y>=Math.max(h.y,d.y)-1 && r.y+r.height<=Math.min(h.y+h.height,d.y+d.height)+1, label+': Help '+key+' containment '+JSON.stringify(chrome));
        }
        if (file==='dist/index.html' && [1360,320].includes(width)) { await settle(page); await page.screenshot({path:path.join(evidence,`${language}-${width}.png`)}); }
        const box=await page.locator('#helpDialog').boundingBox();
        const point=[[1,1],[width-1,1],[1,height-1],[width-1,height-1]].find(([x,y])=>x<box.x||x>box.x+box.width||y<box.y||y>box.y+box.height);
        assert.ok(point,label+': genuine backdrop');
        const before=await page.evaluate(()=>({root:scrollY,main:document.querySelector('main').scrollTop}));
        await page.mouse.move(...point); await page.mouse.wheel(0,400); await page.waitForTimeout(100);
        assert.deepEqual(await page.evaluate(()=>({root:scrollY,main:document.querySelector('main').scrollTop})),before,label+': background locked');
        await page.keyboard.press('Escape'); assert.equal(await page.locator('#helpDialog').isVisible(),false);
        await page.locator('#languageButton').click(); await page.locator('#languageButton').click(); await metadata(page,rendered);
        await page.locator('#helpButton').click(); await page.locator('#closeHelpButton').click(); assert.equal(await page.locator('#helpDialog').isVisible(),false);
        assert.deepEqual(errors,[],label+': console errors'); assert.deepEqual(requests,[],label+': runtime requests');
        console.log('PASS '+label);
      } catch (e) { await page.screenshot({path:path.join(evidence,'failure.png')}).catch(()=>{}); throw new Error(label+': '+e.message,{cause:e}); }
      finally { await context.close(); }
    }
  } finally { await browser.close(); }
}
main().catch(e=>{console.error(e);process.exitCode=1;});
