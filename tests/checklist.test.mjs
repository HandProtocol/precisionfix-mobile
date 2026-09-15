import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checklistHtml, checklistItems, checklistSection, inline } from '../netlify/functions/lib/checklist.mjs';
import { sanitizeContent } from '../netlify/functions/lib/sanitize.mjs';
import { SECTIONS } from '../netlify/functions/lib/site.mjs';
import { config } from '../netlify/functions/lib/config.mjs';

const ITEMS = [
  { id: 'domain', title: 'Point <b>your</b> domain', why: 'So **people** find you', phone: ['Open the `Namecheap` app', 'Tap **Manage**'], links: [{ label: 'Namecheap', href: 'https://namecheap.com' }], ask: 'Send us the login', done: 'The site loads on your domain' },
  { id: 'domain', title: 'duplicate id is dropped' },
  { id: 'Bad Id', title: 'bad id is dropped' },
  { id: 'payments', title: 'Take deposits', later: true },
];

test('items are validated: bad ids and duplicates dropped, fields normalized', () => {
  const items = checklistItems(ITEMS);
  assert.deepEqual(items.map((i) => i.id), ['domain', 'payments']);
  assert.equal(items[1].later, true);
  assert.deepEqual(items[0].phone.length, 2);
});

test('the hidden setup section has one toggle per item and sanitizes as booleans', () => {
  const section = checklistSection(ITEMS);
  assert.equal(section.key, 'setup');
  assert.equal(section.hidden, true);
  assert.deepEqual(section.fields.map((f) => f.key), ['domain', 'payments']);
  const out = sanitizeContent([section], { setup: { domain: 'yes', bogus: true } }, {});
  assert.deepEqual(out.setup, { domain: true, payments: false });
  assert.equal(checklistSection([]), null);
});

test('the setup section exists exactly when the config has a checklist', () => {
  const setup = SECTIONS.find((s) => s.key === 'setup');
  if (config.checklist.length) {
    assert.ok(setup && setup.hidden);
    assert.deepEqual(setup.fields.map((f) => f.key), checklistItems().map((i) => i.id));
  } else assert.equal(setup, undefined);
});

test('checklist html escapes text, keeps only bold/code marks, links open in a new tab', () => {
  const html = checklistHtml(ITEMS);
  assert.equal(html.includes('<b>your</b>'), false);
  assert.match(html, /&lt;b&gt;your&lt;\/b&gt;/);
  assert.match(html, /<strong>people<\/strong>/);
  assert.match(html, /<code>Namecheap<\/code>/);
  assert.match(html, /data-setup="domain"/);
  assert.match(html, /href="https:\/\/namecheap\.com" target="_blank" rel="noopener"/);
  assert.match(html, /data-task="payments" data-later/);
  assert.match(html, /Done when:/);
  assert.equal(inline('a <x> **b** `c`'), 'a &lt;x&gt; <strong>b</strong> <code>c</code>');
});
