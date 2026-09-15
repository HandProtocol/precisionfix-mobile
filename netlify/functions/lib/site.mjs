// The bridge between the engine and the site pack. Engine code imports the
// pack ONLY through here, so a pack is exactly three files:
//   site.config.mjs   identity + theme      (via ./config.mjs)
//   site/schema.mjs   SECTIONS + DEFAULT_CONTENT + CONTENT_KEY
//   site/page.mjs     renderPage({ content, media, origin })

import { CONTENT_KEY, DEFAULT_CONTENT, SECTIONS as PACK_SECTIONS } from '../../../site/schema.mjs';
import { renderPage } from '../../../site/page.mjs';
import { assertSections, sanitizeContent } from './sanitize.mjs';
import { checklistSection } from './checklist.mjs';

// The pack's sections plus the engine's own: the Setup checklist (one toggle
// per item in config.checklist, hidden from the Content tab, ticked from the
// Setup tab). Progress lives in the content document, so it follows the
// owner across phone and desktop.
const setup = checklistSection();
export const SECTIONS = setup ? [...PACK_SECTIONS, setup] : PACK_SECTIONS;
assertSections(SECTIONS);

export { CONTENT_KEY, DEFAULT_CONTENT, renderPage };

// sanitize(input) → complete document, falling back to the defaults.
// sanitize(input, base) → falling back to `base` (the stored document).
export function sanitize(input, base = DEFAULT_CONTENT) {
  return sanitizeContent(SECTIONS, input, base);
}

// Public description of the schema for the admin UI.
export function schemaForClient() {
  return SECTIONS;
}
