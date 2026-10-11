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
  const wrapper = fs.readFileSync(path.join(buildDir, 'index.self-extract.html'), 'utf8');
  const payload = wrapper.match(/<script id="self-extract-payload"[^>]*>([\s\S]*?)<\/script>/);
  assert.ok(payload, 'Self-extracting release must contain its payload');
  variants.push(['readable', fs.readFileSync(path.join(buildDir, 'index.html'), 'utf8')],
    ['standalone', fs.readFileSync(path.join(root, `${config.slug}.html`), 'utf8')],
    ['self-extract', gunzipSync(Buffer.from(payload[1], 'base64')).toString('utf8')]);
}

// These are source/release CSS contracts, not a simulated browser scroll test.
// Native wheel scrolling and short-viewport reachability need browser verification.
function declarations(css, selector) {
  const result = {};
  for (const rule of css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (!rule[1].split(',').some(value => value.trim() === selector)) continue;
    for (const entry of rule[2].split(';')) {
      const colon = entry.indexOf(':');
      if (colon >= 0) result[entry.slice(0, colon).trim()] = entry.slice(colon + 1).trim();
    }
  }
  return result;
}

for (const [label, html] of variants) {
  const css = html.match(/<style>([\s\S]*?)<\/style>/)[1];
  for (const element of ['html', 'body']) {
    test(`${label}: ${element} overflow is locked by native modal state`, () => {
      assert.equal(declarations(css, `${element}:has(dialog:modal)`).overflow, 'hidden',
        `${element} must stop background scrolling while Help or confirmation is modal`);
    });
  }
  test(`${label}: both dialog bodies retain their own contained scroll area`, () => {
    const body = declarations(css, '.dialog-body');
    assert.equal(body.overflow, 'auto');
    assert.equal(body['overscroll-behavior'], 'contain');
    for (const id of ['helpDialog', 'appConfirmDialog']) {
      const dialog = html.match(new RegExp(`<dialog id="${id}">([\\s\\S]*?)<\\/dialog>`));
      assert.ok(dialog, id);
      assert.match(dialog[1], /class="dialog-shell"/);
      assert.match(dialog[1], /class="dialog-body"/);
    }
  });
  for (const language of ['ja', 'en']) {
    test(`${label}/${language}: Help explains modal background and inner scrolling`, () => {
      const start = html.indexOf('      const translations =');
      const end = html.indexOf('      const $ =', start);
      assert.ok(start >= 0 && end > start, 'Production translations are present');
      const translations = vm.runInNewContext(html.slice(start, end) + '\ntranslations;');
      const text = translations[language].helpDialogScroll;
      assert.equal(typeof text, 'string', 'Localized modal scroll guidance must exist');
      assert.match(text, language === 'ja' ? /背景.*スクロールしません/ : /background stays still/);
      assert.match(text, language === 'ja' ? /説明.*スクロール/ : /Scroll within Help/);
      assert.match(html, /<p data-i18n="helpDialogScroll">[^<]+<\/p>/);
    });
  }
}

test('canonical repository check runs the modal scroll regression', () => {
  const checker = fs.readFileSync(path.join(root, 'scripts/check-repository.ps1'), 'utf8');
  assert.match(checker, /& \$node\.Source --test \(Join-Path \$Root "scripts\\test-modal-scroll\.cjs"\)/);
  assert.match(checker, /throw "Modal scroll regression tests failed\."/);
});
