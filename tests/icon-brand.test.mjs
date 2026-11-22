import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
const root = new URL('../', import.meta.url);
const svg = readFileSync(new URL('assets/favicon.svg', root), 'utf8');
const attrs = s => Object.fromEntries([...s.matchAll(/([\w:-]+)="([^"]*)"/g)].map(m => [m[1], m[2]]));
test('canonical icon has the exact brand color and quarter-axis corner radii', () => {
  const rect = attrs(svg.match(/<rect\b[^>]*>/)[0]);
  const rootAttrs = attrs(svg.match(/<svg\b[^>]*>/)[0]);
  assert.equal((rect.fill || rootAttrs.fill).toLowerCase(), '#16624f');
  assert.equal(Number(rect.rx), Number(rect.width) / 4);
  assert.equal(Number(rect.ry || rect.rx), Number(rect.height) / 4);
  assert.ok(!svg.toLowerCase().includes('#066751'));
  assert.equal(rootAttrs.viewBox,'99.44824 101.05225 897.17285 895.56885');
  assert.equal(rootAttrs.width,'48');
  assert.equal(rootAttrs.height,'48');
  assert.equal(rootAttrs.preserveAspectRatio,'none');
});
test('original pixel artwork geometry is preserved when adjusting the icon crop', () => {
  const stable = svg.replace(/<svg\b[^>]*>/, '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1095 1095">').replace(/#16624f/gi, '#BRAND').replace(/<rect\b[^>]*>/, s => s.replace(/\s+r[xy]="[^"]*"/g, ''));
  assert.equal(createHash('sha256').update(stable).digest('hex'), '1fac8147ab337f4351fecb4b050b0fd4fa5742f15d055cbb756ac4d4970bde42');
});
test('runtime header and favicon embed the exact canonical SVG', () => {
  const uri = 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64');
  for (const path of ['pixel-animation-studio.html', 'dist/index.html']) {
    if (!existsSync(new URL(path, root))) continue;
    const html = readFileSync(new URL(path, root), 'utf8');
    const icons = [...html.matchAll(/(?:href|src)="(data:image\/svg\+xml;base64,[^"]+)"/g)].map(m => m[1]);
    assert.ok(icons.filter(value => value === uri).length >= 2, `${path}: header and favicon match`);
  }
});

test('header renders the exact SVG without a framed outer wrapper', () => {
  const html = readFileSync(new URL('src/index.template.html', root), 'utf8');
  assert.match(html, /<img class="brand-mark" id="appBrandIcon" src="__APP_ICON_DATA_URI__" alt="" aria-hidden="true">/);
  assert.doesNotMatch(html, /<div class="brand-mark"/);
  assert.match(html, /\.brand-mark \{ display:block; width:38px; height:38px; flex:0 0 auto; object-fit:contain; \}/);
  assert.doesNotMatch(html, /\.brand-mark \{[^}]*?(?:border-radius|box-shadow|overflow):/);
});
