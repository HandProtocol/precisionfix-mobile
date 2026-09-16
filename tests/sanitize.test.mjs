import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assertSections, sanitizeContent } from '../netlify/functions/lib/sanitize.mjs';
import { DEFAULT_CONTENT, SECTIONS } from '../site/schema.mjs';

// A fixture schema so these tests do not depend on the site pack's fields.
const FIX = [
  { key: 'brand', label: 'Brand', fields: [{ key: 'name', type: 'text', label: 'Name', max: 10 }, { key: 'on', type: 'toggle', label: 'On' }] },
  { key: 'list', label: 'List', fields: [{ key: 'items', type: 'list', label: 'Items', max: 2, item: [{ key: 'a', type: 'text', label: 'A', max: 5 }, { key: 'b', type: 'textarea', label: 'B', max: 5 }] }] },
];
const BASE = { brand: { name: 'Base', on: false }, list: { items: [{ a: 'x', b: 'y' }] } };

test('the shipped schema validates and its defaults survive a sanitize round-trip', () => {
  assert.doesNotThrow(() => assertSections(SECTIONS));
  const out = sanitizeContent(SECTIONS, DEFAULT_CONTENT, DEFAULT_CONTENT);
  for (const s of SECTIONS) for (const f of s.fields) assert.ok(f.key in out[s.key], `${s.key}.${f.key}`);
});

test('rejects nested lists and text fields without max', () => {
  assert.throws(() => assertSections([{ key: 'a', fields: [{ key: 'x', type: 'text' }] }]), /max/);
  assert.throws(() => assertSections([{ key: 'a', fields: [{ key: 'l', type: 'list', max: 2, item: [{ key: 'n', type: 'list', max: 1, item: [] }] }] }]), /nest/);
});

test('clips text, drops unknown keys, caps lists, coerces toggles', () => {
  const out = sanitizeContent(FIX, {
    brand: { name: 'x'.repeat(100), evil: 'dropped', on: 'yes' },
    list: { items: [{ a: '1' }, { a: '2' }, { a: '3' }] },
    bogus: { a: 1 },
  }, BASE);
  assert.equal(out.brand.name.length, 10);
  assert.equal('evil' in out.brand, false);
  assert.equal('bogus' in out, false);
  assert.equal(out.brand.on, true);
  assert.equal(out.list.items.length, 2);
  assert.deepEqual(out.list.items[0], { a: '1', b: '' });
});

test('missing keys fall back to base, empty list rows are dropped', () => {
  const out = sanitizeContent(FIX, { list: { items: [{ a: '', b: '' }, { a: '9', b: 'z' }] } }, BASE);
  assert.equal(out.brand.name, 'Base');
  assert.deepEqual(out.list.items, [{ a: '9', b: 'z' }]);
});

test('select fields clamp to their options and fall back to base, then the first option', () => {
  const S = [{ key: 'site', label: 'Site', fields: [{ key: 'theme', type: 'select', label: 'Theme', options: [{ value: 'a', label: 'A' }, 'b'] }] }];
  assert.doesNotThrow(() => assertSections(S));
  assert.equal(sanitizeContent(S, { site: { theme: 'b' } }, {}).site.theme, 'b');
  assert.equal(sanitizeContent(S, { site: { theme: 'zzz' } }, { site: { theme: 'b' } }).site.theme, 'b');
  assert.equal(sanitizeContent(S, {}, {}).site.theme, 'a');
  assert.throws(() => assertSections([{ key: 'x', fields: [{ key: 'y', type: 'select', label: 'Y' }] }]), /options/);
});

// --- applyPaths (PATCH /api/admin/content) ---------------------------------
import { applyPaths } from '../netlify/functions/lib/sanitize.mjs';

test('applyPaths sets only known section.field paths and never mutates the base', () => {
  const sections = [
    { key: 'site', fields: [{ key: 'theme', type: 'select', options: ['a', 'b'] }, { key: 'items', type: 'list', max: 2, item: [{ key: 'x', type: 'text', max: 5 }] }] },
    { key: 'setup', hidden: true, fields: [{ key: 'domain', type: 'toggle' }] },
  ];
  const base = { site: { theme: 'a', items: [] }, setup: { domain: false } };
  const out = applyPaths(sections, base, { 'site.theme': 'b', 'setup.domain': true });
  assert.deepEqual(out, { site: { theme: 'b', items: [] }, setup: { domain: true } });
  assert.deepEqual(base, { site: { theme: 'a', items: [] }, setup: { domain: false } });
  for (const bad of [{ 'nope.theme': 'b' }, { 'site.nope': 'b' }, { 'site.items': [] }, { 'site.theme.deep': 'b' }, {}, [], null]) {
    assert.throws(() => applyPaths(sections, base, bad), (err) => err.status === 400, JSON.stringify(bad));
  }
});
