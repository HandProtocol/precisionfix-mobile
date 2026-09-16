// PrecisionFix site pack config. Mobile mechanic, Austin TX, Mercedes-Benz
// factory certified, bilingual. Five switchable themes (site/themes.mjs);
// the editor, emails, and meta theme-color use the default one.
import { CHECKLIST } from './site/checklist.mjs';
import { DEFAULT_THEME, THEMES, themePickerOptions } from './site/themes.mjs';

const base = THEMES[DEFAULT_THEME];

export default {
  slug: 'precisionfix',
  name: 'PrecisionFix',

  // The owner's Namecheap domain replaces this once it is attached (Phase 5).
  productionUrl: 'https://precisionfix-austin.netlify.app',
  netlifySiteId: '9f248232-981f-4a15-a891-a62f949f92fa',

  supabase: { projectRef: 'vconmgerblqbworcqkvr', schema: 'command' },

  // Bump whenever public/assets/** change (site + admin assets both carry it).
  assetVersion: '20260916b',

  fonts: base.fonts,

  theme: { ...base.palette, admin: base.admin },

  // The Looks picker in /admin/: one card per theme, live preview, one-tap
  // publish. `field` is where the pick is stored (site/schema.mjs).
  themes: { field: 'site.theme', options: themePickerOptions() },

  // Hex bolt head with a wrench. Inline SVG on currentColor.
  logo:
    '<svg class="mark" viewBox="0 0 32 32" aria-hidden="true"><path d="M16 2.6 27.6 9.3v13.4L16 29.4 4.4 22.7V9.3Z" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/><path d="M9.6 22.4 16.4 15.6" stroke="currentColor" stroke-width="2.8" stroke-linecap="round"/><path d="M15.2 14.4a4.2 4.2 0 0 1 5.9-5.2l-2.4 2.4 1.7 1.7 2.4-2.4a4.2 4.2 0 0 1-5.2 5.9Z" fill="currentColor"/></svg>',

  nav: [
    { id: 'services', label: 'Services' },
    { id: 'why', label: 'Why me' },
    { id: 'work', label: 'Work' },
    { id: 'area', label: 'Area' },
    { id: 'book', label: 'Book' },
  ],
  labels: {},

  media: {
    // The five photos from the previous site, shipped with this one. Featured
    // leads the hero; the rest fill the gallery in order (reorder in /admin/).
    seed: [
      photo('porsche-911-gt3-rs', 1000, 577, 'Porsche 911 GT3 RS in the shop', 'In the shop, track-ready and flawless', 'Porsche', true),
      photo('engine-rebuild', 752, 1000, 'An engine mid tear-down on the bench', 'Deep in a full engine tear-down and rebuild', 'Engine'),
      photo('mercedes-amg-sl63', 1000, 539, 'Mercedes-AMG SL63 with the hood open on the lift', 'SL63 open on the lift, hood-deep diagnostics', 'Mercedes-AMG'),
      photo('ferrari-laferrari', 764, 1000, 'Ferrari LaFerrari with the engine out', 'Ferrari hypercar, full engine-out service', 'Ferrari'),
      photo('mercedes-amg-gle', 1200, 2602, 'Mercedes-AMG GLE connected to XENTRY diagnostics', 'AMG GLE hooked up for a XENTRY diagnostic session', 'Mercedes-AMG'),
    ],
    placeholderPalette: ['#e8311a', '#c42a15', '#f5a623', '#161819', '#252729'],
  },

  // Netlify Forms → Resend. The booking form in site/page.mjs posts to
  // Netlify (definition in public/forms/booking.html); Netlify fires
  // netlify/functions/submission-created.mjs, which emails the owner and
  // confirms the customer. Recipients: PRECISIONFIX_FORM_NOTIFY env (comma
  // list) → this `notify` list → PRECISIONFIX_OWNER_EMAILS.
  forms: {
    booking: {
      label: 'Booking request',
      notify: [], // set on the Netlify site as PRECISIONFIX_FORM_NOTIFY once the owner's inbox is known
      replyField: 'email',
      nameField: 'name',
      fields: [
        { key: 'name', label: 'Name' },
        { key: 'phone', label: 'Phone' },
        { key: 'email', label: 'Email' },
        { key: 'contact_pref', label: 'Prefers' },
        { key: 'vehicle_year', label: 'Year' },
        { key: 'vehicle_make', label: 'Make' },
        { key: 'vehicle_model', label: 'Model' },
        { key: 'mileage', label: 'Mileage' },
        { key: 'vin', label: 'VIN' },
        { key: 'service', label: 'Service' },
        { key: 'issue', label: 'What it is doing' },
        { key: 'address', label: 'Where the car is' },
        { key: 'city', label: 'City' },
        { key: 'preferred_date', label: 'Preferred date' },
        { key: 'preferred_time', label: 'Preferred time' },
        { key: 'lang', label: 'Language' },
      ],
      confirm: {
        subject: 'PrecisionFix got your booking request, {name}',
        body:
          'Thanks, {name}. Your request is in and I will text or call you shortly to confirm a time and give you a clear quote.\n\nIf anything changes with the car in the meantime, just reply to this email.\n\n— PrecisionFix, Mobile Mechanic, Austin TX',
      },
    },
  },

  checklist: CHECKLIST,

  madeBy: { label: 'Made by HAND', href: 'https://handprotocol.org' },
};

function photo(file, width, height, alt, caption, category, featured = false) {
  return { path: `/img/photos/${file}.jpg`, width, height, alt, caption, category, featured, placeholder: false };
}
