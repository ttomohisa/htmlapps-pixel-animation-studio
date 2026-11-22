'use strict';
const { test }=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const read=relative=>fs.readFileSync(path.join(root,relative),'utf8');
const config=JSON.parse(read('app.config.json'));
const version=config.version;
const source=read('src/index.template.html');
const en=read('README.md');
const ja=read('README.ja.md');
const spec=read('APP_SPEC.md');
const offline=read('VERIFY_OFFLINE.md');
const notices=read('THIRD_PARTY_NOTICES.md');
const changelog=read('CHANGELOG.md');

test('version and release descriptions match the canonical branch configuration',()=>{
  assert.match(version,/^\d+\.\d+\.\d+$/);
  assert.ok(spec.includes('Application version (this branch):** v'+version));
  assert.ok(offline.includes('v'+version+' readable build'));
  assert.ok(offline.includes('Build information shows `'+version+'`'));
  assert.ok(notices.includes('v'+version+' has no runtime third-party dependencies'));
  assert.ok(changelog.includes('## ['+version+']'));
  assert.ok(!/Current stable release:\*\* v1\.0\.6/.test(spec));
  assert.ok(!offline.includes('v1.0.1'));
  assert.ok(!notices.includes('v1.0.0'));
  assert.equal(JSON.parse(read('dependencies.json')).dependencies.length,0);
});

test('offline QA instructions follow current Preview, Custom, Fit and phone interactions',()=>{
  assert.match(source,/id="customCanvasDetails"/);
  assert.match(source,/id="toolbarScaleValue"/);
  assert.doesNotMatch(source,/id="fitButton"/);
  assert.match(source,/id="previewFrameSlider"/);
  assert.match(offline,/Custom.*collapsed/);
  assert.match(offline,/live zoom value/);
  assert.match(offline,/Play and Pause share one button/);
  assert.match(offline,/640\/641px/);
  assert.match(offline,/Firefox and Safari\/iOS/);
  assert.match(offline,/assets\/screenshot-mobile\.png/);
  assert.match(offline,/12 MiB/);
});

test('README Japanese/English feature and safety claims are aligned',()=>{
  for(const [lang,doc] of [['en',en],['ja',ja]]){
    for(const term of ['128','20','5000','12 MiB','IndexedDB','PNG','GIF','Sprite Sheet','file://','connect-src']){
      assert.ok(doc.includes(term),lang+' README omits '+term);
    }
    assert.ok(doc.includes('v'+version),lang+' README version');
  }
  assert.match(en,/the same button to Pause/);
  assert.match(ja,/「再生」を押すと「一時停止」に切り替わり/);
  assert.match(en,/desktop Preview/i);
  assert.match(ja,/PCのプレビュー/);
  assert.match(en,/no runtime network request/i);
  assert.match(ja,/実行時外部通信なし/);
  assert.match(en,/self-extracting single-HTML variant/i);
  assert.match(ja,/自己展開版/);
});

test('documented local files and code-linked checks really exist',()=>{
  const documents=['README.md','README.ja.md','APP_SPEC.md','VERIFY_OFFLINE.md','SECURITY.md','THIRD_PARTY_NOTICES.md'];
  for(const filename of documents){
    const content=read(filename);
    for(const match of content.matchAll(/\]\(([^)]+)\)/g)){
      const link=match[1].split('#')[0].trim();
      if(!link || /^[a-z]+:\/\//i.test(link) || link.startsWith('mailto:'))continue;
      const resolved=path.resolve(root,decodeURIComponent(link));
      assert.ok(fs.existsSync(resolved),filename+' has broken local link: '+link);
    }
  }
  assert.ok(fs.existsSync(path.join(root,'assets/favicon.svg')));
  assert.ok(fs.existsSync(path.join(root,'scripts/check-repository.ps1')));
});

test('repository checks run to completion before the success banner',()=>{
  const check=read('scripts/check-repository.ps1');
  const documentationRun=check.indexOf('test-documentation.cjs');
  const success=check.indexOf('[OK] Repository check passed.');
  assert.ok(documentationRun>0 && success>documentationRun);
  assert.equal(check.lastIndexOf('[OK] Repository check passed.'),success);
  const release=read('.github/workflows/release-on-merge.yml');
  assert.match(release,/github\.event\.pull_request\.merged == true/);
  assert.match(release,/check-repository\.ps1/);
  assert.match(release,/version_patch/);
  assert.match(release,/gh release create/);
});
