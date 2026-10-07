'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const { gunzipSync } = require('node:zlib');
const root = path.resolve(__dirname, '..');
const config = JSON.parse(fs.readFileSync(path.join(root, 'app.config.json'), 'utf8'));
const variants = [['source', fs.readFileSync(path.join(root, 'src/index.template.html'), 'utf8')]];
if (!process.env.PIXEL_SOURCE_ONLY) {
  const buildDir = path.resolve(process.env.PIXEL_BUILD_DIR || path.join(root, 'dist'));
  const readable = fs.readFileSync(path.join(buildDir, 'index.html'), 'utf8');
  const standalone = fs.readFileSync(path.join(root, `${config.slug}.html`), 'utf8');
  const wrapper = fs.readFileSync(path.join(buildDir, 'index.self-extract.html'), 'utf8');
  const payload = wrapper.match(/<script id="self-extract-payload"[^>]*>([\s\S]*?)<\/script>/);
  assert.ok(payload);
  const restored = gunzipSync(Buffer.from(payload[1], 'base64')).toString('utf8');
  variants.push(['readable', readable], ['standalone', standalone], ['self-extract', restored]);
  test('root release matches readable content and self-extract restores exact bytes', () => {
    const normalize = value => value.replace(/("generatedAtUtc":")[^"]+(")/, '$1TIMESTAMP$2');
    assert.equal(normalize(standalone), normalize(readable)); assert.equal(restored, readable);
  });
}

// Execute production language initialization, translations, applyLanguage and
// registered header handlers. Only DOM/storage and unrelated canvas work are doubles.
function harness(html, language, storage = new Map()) {
  const elements = new Map();
  for (const match of html.matchAll(/<([a-z]+)\b([^>]*\bid="([^"]+)"[^>]*)>/g)) {
    const attrs = Object.fromEntries([...match[2].matchAll(/([\w-]+)="([^"]*)"/g)].map(m => [m[1], m[2]]));
    const element = { attrs, dataset: {}, listeners: {}, open: false,
      setAttribute(name, value) { this.attrs[name] = value; },
      addEventListener(type, callback) { this.listeners[type] = callback; },
      click(event = {}) { this.listeners.click?.({ clientX: 10, clientY: 10, ...event }); },
      showModal() { this.open = true; }, close() { this.open = false; },
      getBoundingClientRect() { return { left: 0, top: 0, right: 100, bottom: 100 }; }
    };
    for (const [name, value] of Object.entries(attrs)) if (name.startsWith('data-')) element.dataset[name.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = value;
    elements.set(match[3], element);
  }
  const $ = selector => { const element = elements.get(selector.slice(1)); assert.ok(element, selector); return element; };
  const context = { $, $$: selector => [...elements.values()].filter(el => selector.slice(1, -1) in el.attrs),
    document: { documentElement: {} }, navigator: { language }, state: { persistenceReady: false },
    localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) } };
  for (const name of ['updateToolSummary', 'renderRecentColors', 'renderFrames', 'updatePreviewControls', 'updateOnionSkinControls', 'updateExportPanel', 'renderImportReport']) context[name] = () => {};
  function section(startMarker, endMarker) {
    const start = html.indexOf(startMarker), end = html.indexOf(endMarker, start);
    assert.ok(start >= 0 && end > start, startMarker); return html.slice(start, end);
  }
  const metadata = ['APP_CONFIG', 'BUILD_MANIFEST'].map(name => html.match(new RegExp(`const ${name} = (.+);`))[0]).join('\n')
    .replace('__APP_CONFIG_JSON__', JSON.stringify(config)).replace('__BUILD_MANIFEST_JSON__', '{}');
  vm.createContext(context);
  vm.runInContext(metadata + section('      const translations =', '      const $ =') +
    'const storageKeyLanguage = `${APP_CONFIG.slug}:language`;\n' +
    section('      function readStorage(', '      function formatText(') +
    section('      function applyLanguage()', '      function normalizeHex(') +
    section("      $('#languageButton').addEventListener", "      window.addEventListener('resize'") +
    section("      $('#versionBadge').textContent", "      document.body.dataset.projectState") +
    '\napplyLanguage(); globalThis.metadata = { config: APP_CONFIG, manifest: BUILD_MANIFEST };', context);
  return { $, context, storage };
}

for (const [label, html] of variants) {
  for (const language of ['ja', 'en']) {
    test(`${label}/${language}: EN/JA targets survive repeated switching and preference reload`, () => {
      const h = harness(html, language);
      for (let count = 0; count < 3; count++) {
        const current = h.context.document.documentElement.lang;
        assert.equal(h.$('#languageButton').textContent, current === 'ja' ? 'EN' : 'JA');
        h.$('#languageButton').click();
        assert.equal(h.context.document.documentElement.lang, current === 'ja' ? 'en' : 'ja');
        assert.equal(h.storage.get(`${config.slug}:language`), h.context.document.documentElement.lang);
      }
      const reloaded = harness(html, language, h.storage);
      assert.equal(reloaded.context.document.documentElement.lang, h.context.document.documentElement.lang);
      assert.equal(reloaded.$('#languageButton').textContent, h.$('#languageButton').textContent);
    });
    test(`${label}/${language}: language target has matching localized name and tooltip`, () => {
      const h = harness(html, language);
      for (let count = 0; count < 3; count++) {
        const expected = h.context.document.documentElement.lang === 'ja' ? '英語に切り替え' : 'Switch to Japanese';
        assert.equal(h.$('#languageButton').attrs['aria-label'], expected);
        assert.equal(h.$('#languageButton').title, expected);
        h.$('#languageButton').click();
      }
    });
    test(`${label}/${language}: Help open and close retain localized names and tooltips`, () => {
      const h = harness(html, language);
      for (let count = 0; count < 3; count++) {
        const japanese = h.context.document.documentElement.lang === 'ja';
        for (const [id, expected] of [['helpButton', japanese ? '使い方と注意事項' : 'How to use & notes'], ['closeHelpButton', japanese ? '閉じる' : 'Close']]) {
          assert.equal(h.$(`#${id}`).attrs['aria-label'], expected);
          assert.equal(h.$(`#${id}`).title, expected);
        }
        h.$('#helpButton').click(); assert.equal(h.$('#helpDialog').open, true);
        h.$('#closeHelpButton').click(); assert.equal(h.$('#helpDialog').open, false);
        h.$('#helpButton').click(); h.$('#helpDialog').click({ clientX: -1, clientY: -1 });
        assert.equal(h.$('#helpDialog').open, false);
        h.$('#languageButton').click();
      }
    });
  }
  test(`${label}: header and build information match canonical configuration`, () => {
    const h = harness(html, 'en');
    assert.match(config.version, /^\d+\.\d+\.\d+$/);
    assert.equal(html.match(/id="versionBadge">([^<]+)/)[1], `v${config.version}`);
    assert.equal(h.context.metadata.config.version, config.version);
    assert.equal(h.$('#versionBadge').textContent, `v${config.version}`);
    assert.equal(h.$('#buildVersion').textContent, config.version);
    if (label !== 'source') assert.equal(h.context.metadata.manifest.app.version, config.version);
    h.$('#languageButton').click();
    assert.equal(h.$('#versionBadge').textContent, `v${config.version}`);
    assert.equal(h.$('#buildVersion').textContent, config.version);
  });
}
