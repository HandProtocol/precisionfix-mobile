// The owner's Setup checklist: config.checklist items rendered as a Setup
// tab in /admin/ (lib/admin-page.mjs) with progress stored in the content
// document under the hidden `setup` section (one toggle per item).
//
// Item shape (site.config.mjs):
//   { id: 'domain', title: 'Point your domain at the site', why: '…',
//     phone: ['step', …],          // what to do from a phone (primary)
//     desktop: ['step', …],        // optional: the same job from a computer
//     links: [{ label, href }],    // optional: where to go
//     ask: 'What HAND needs from you if you would rather we do it',
//     done: 'How you know it is done', later: false }
//
// Steps are plain text; `**bold**` and `` `code` `` are the only inline marks.

import { config } from './config.mjs';
import { escapeHtml as e } from './html.mjs';

const ID_RE = /^[a-z][a-z0-9_]*$/;

export function checklistItems(source = config.checklist) {
  const seen = new Set();
  return (Array.isArray(source) ? source : [])
    .filter((it) => it && ID_RE.test(String(it.id || '')) && it.title)
    .filter((it) => (seen.has(it.id) ? false : seen.add(it.id)))
    .map((it) => ({
      id: it.id,
      title: String(it.title),
      why: String(it.why || ''),
      phone: Array.isArray(it.phone) ? it.phone.map(String) : [],
      desktop: Array.isArray(it.desktop) ? it.desktop.map(String) : [],
      links: Array.isArray(it.links) ? it.links.filter((l) => l && l.href && l.label) : [],
      ask: String(it.ask || ''),
      done: String(it.done || ''),
      later: Boolean(it.later),
    }));
}

// The hidden schema section the sanitizer and admin bind to. null when the
// site has no checklist, so packs without one are untouched.
export function checklistSection(source) {
  const items = checklistItems(source);
  if (!items.length) return null;
  return {
    key: 'setup',
    label: 'Setup checklist',
    hidden: true,
    fields: items.map((it) => ({ key: it.id, type: 'toggle', label: it.title })),
  };
}

// Inline marks only: **bold**, `code`. Everything else is escaped text.
export function inline(text) {
  return e(text)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code>$1</code>');
}

function steps(list, label) {
  if (!list.length) return '';
  return `<div class="task__how"><h4>${e(label)}</h4><ol>${list.map((s) => `<li>${inline(s)}</li>`).join('')}</ol></div>`;
}

export function checklistHtml(source) {
  const items = checklistItems(source);
  if (!items.length) return '';
  return items
    .map(
      (it, i) => `<article class="task" data-task="${e(it.id)}"${it.later ? ' data-later' : ''}>
  <label class="task__check">
    <input type="checkbox" data-setup="${e(it.id)}" aria-label="Mark “${e(it.title)}” done">
    <i></i>
  </label>
  <div class="task__body">
    <header class="task__head">
      <span class="task__n">${String(i + 1).padStart(2, '0')}</span>
      <h3>${e(it.title)}</h3>
      ${it.later ? '<span class="task__later">Later</span>' : ''}
    </header>
    ${it.why ? `<p class="task__why">${inline(it.why)}</p>` : ''}
    ${steps(it.phone, 'On your phone')}
    ${steps(it.desktop, 'On a computer')}
    ${it.links.length ? `<p class="task__links">${it.links.map((l) => `<a href="${e(l.href)}" target="_blank" rel="noopener">${e(l.label)} ↗</a>`).join('')}</p>` : ''}
    ${it.ask ? `<p class="task__ask"><strong>Rather have HAND do it?</strong> ${inline(it.ask)}</p>` : ''}
    ${it.done ? `<p class="task__done"><strong>Done when:</strong> ${inline(it.done)}</p>` : ''}
  </div>
</article>`
    )
    .join('\n');
}
