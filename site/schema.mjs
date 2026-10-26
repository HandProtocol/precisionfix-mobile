// Content schema for PrecisionFix: what the owner can edit, in English and
// Spanish (every visible line has an `_es` twin; the site auto-detects the
// visitor's language and shows an EN / ES switch). Keys stay stable once the
// site is live. Lists that are emptied hide their sections.

import { DEFAULT_THEME, themeOptions } from './themes.mjs';

export const CONTENT_KEY = 'site';

const t = (key, label, max, help) => ({ key, type: 'text', label, max, ...(help ? { help } : {}) });
const ta = (key, label, max, help) => ({ key, type: 'textarea', label, max, ...(help ? { help } : {}) });
// An English field followed by its Spanish twin.
const pair = (key, label, max, kind = 'text') => [
  (kind === 'textarea' ? ta : t)(key, label, max),
  (kind === 'textarea' ? ta : t)(`${key}_es`, `${label} (ES)`, max),
];

export const SECTIONS = [
  {
    key: 'site',
    label: 'Site',
    help: 'The look of the whole site and the language switch.',
    fields: [
      { key: 'theme', type: 'select', ui: 'looks', label: 'Theme', options: themeOptions(), help: 'Tap Preview to see your real site in that look. Use this look makes it live right away.' },
      { key: 'lang_toggle', type: 'toggle', label: 'Show the EN / ES language switch' },
    ],
  },
  {
    key: 'brand',
    label: 'Brand',
    help: 'The name and one-liner in the header, footer, and browser tab.',
    fields: [t('name', 'Business name', 40), ...pair('tagline', 'Tagline', 90)],
  },
  {
    key: 'hero',
    label: 'Hero',
    help: 'The first screen. The featured photo from Media sits behind or beside it, depending on the theme.',
    fields: [
      ...pair('eyebrow', 'Eyebrow (small line above the name)', 60),
      ta('headline', 'Headline', 40, 'One word per line for the stacked wordmark, e.g. “Precision” then “Fix”.'),
      ...pair('subhead', 'Subhead', 260, 'textarea'),
      ...pair('cta_primary', 'Main button (opens the booking form)', 30),
      ...pair('cta_secondary', 'Second button (calls or texts your number)', 30),
      ...pair('trust', 'Reassurance line under the buttons', 90, 'text'),
      ...pair('badge', 'Certification badge', 60),
    ],
  },
  {
    key: 'cta',
    label: 'Booking prompts',
    help: 'A one-line nudge toward the booking form after the photos.',
    fields: [
      ...pair('strip', 'Strip line (after the photos)', 60, 'textarea'),
      ...pair('strip_button', 'Strip button', 24),
    ],
  },
  {
    key: 'credentials',
    label: 'Credentials',
    help: 'Short proof points. The first one is highlighted. Leave the list empty to hide the section.',
    fields: [
      ...pair('heading', 'Heading', 40),
      {
        key: 'items',
        type: 'list',
        label: 'Credentials',
        max: 6,
        item: [t('icon', 'Icon (an emoji)', 4), t('title', 'Title', 60), t('title_es', 'Title (ES)', 60), ta('body', 'Detail', 160), ta('body_es', 'Detail (ES)', 160)],
      },
    ],
  },
  {
    key: 'services',
    label: 'Services',
    help: 'What you fix. These also become the choices in the booking form.',
    fields: [
      ...pair('heading', 'Heading', 40),
      ...pair('subhead', 'Subhead', 180),
      {
        key: 'items',
        type: 'list',
        label: 'Services',
        max: 10,
        item: [t('title', 'Service', 60), t('title_es', 'Service (ES)', 60), ta('detail', 'One line of detail', 140), ta('detail_es', 'One line of detail (ES)', 140)],
      },
    ],
  },
  {
    key: 'why',
    label: 'Why me',
    fields: [
      ...pair('heading', 'Heading', 60, 'textarea'),
      {
        key: 'items',
        type: 'list',
        label: 'Reasons',
        max: 4,
        item: [t('title', 'Title', 40), t('title_es', 'Title (ES)', 40), ta('body', 'Body', 200), ta('body_es', 'Body (ES)', 200)],
      },
    ],
  },
  {
    key: 'area',
    label: 'Service area',
    help: 'The cities also appear as choices in the booking form.',
    fields: [
      ...pair('heading', 'Heading', 40),
      ...pair('body', 'Body', 180, 'textarea'),
      { key: 'cities', type: 'list', label: 'Cities', max: 12, item: [t('name', 'City', 30)] },
    ],
  },
  {
    key: 'work',
    label: 'Work (gallery)',
    help: 'Photos and captions are managed in the Media tab.',
    fields: [...pair('heading', 'Heading', 40), ...pair('subhead', 'Subhead', 140)],
  },
  {
    key: 'faq',
    label: 'Questions',
    help: 'Short answers to what people ask before they book. Google can show these under your listing. Leave the list empty to hide the section.',
    fields: [
      ...pair('heading', 'Heading', 40),
      {
        key: 'items',
        type: 'list',
        label: 'Questions',
        max: 8,
        item: [t('q', 'Question', 90), t('q_es', 'Question (ES)', 90), ta('a', 'Answer', 320), ta('a_es', 'Answer (ES)', 320)],
      },
    ],
  },
  {
    key: 'booking',
    label: 'Booking form',
    help: 'The words around the booking calendar. Hours, days off and time windows live under Booking calendar; requests land in the Bookings tab and you confirm them there.',
    fields: [
      ...pair('heading', 'Heading', 40),
      ...pair('intro', 'Intro', 240, 'textarea'),
      ...pair('success', 'Thank-you message after a request is sent', 200, 'textarea'),
      ...pair('note', 'Small print under the button', 160),
      ...pair('steps_heading', 'Heading of the “what happens next” list', 40),
      {
        key: 'steps',
        type: 'list',
        label: 'What happens next',
        max: 4,
        item: [t('title', 'Step', 40), t('title_es', 'Step (ES)', 40), ta('body', 'Detail', 140), ta('body_es', 'Detail (ES)', 140)],
      },
    ],
  },
  {
    key: 'contact',
    label: 'Contact',
    help: 'The phone number drives every Call and Text button. Booking requests are emailed to the address set on the site, not to this one; this one is shown to visitors.',
    fields: [
      t('phone', 'Phone number', 24, 'Confirm every digit before the site goes on your domain.'),
      { key: 'sms', type: 'toggle', label: 'Show a Text button (same number)' },
      t('email', 'Public email (optional)', 80, 'Shown on the page. Leave empty to hide.'),
      ...pair('heading', 'Heading', 40),
      ...pair('body', 'Body', 220, 'textarea'),
      ...pair('hours', 'Hours (optional)', 60),
      t('location', 'Based in', 60),
      t('instagram', 'Instagram handle (optional)', 40),
      t('facebook_url', 'Facebook page link (optional)', 200),
      t('google_review_url', 'Google review link (optional)', 200, 'From your Google Business Profile: “Ask for reviews”.'),
    ],
  },
  {
    key: 'seo',
    label: 'Search & sharing',
    help: 'What Google and link previews show. The featured photo is used for previews.',
    fields: [
      t('title', 'Page title', 70),
      ta('description', 'Description', 160),
      t('google_verification', 'Google verification code', 120, 'From Search Console → HTML tag. Paste only the code between the quotes after content=.'),
      t('bing_verification', 'Bing verification code', 120, 'From Bing Webmaster Tools → HTML Meta Tag. Paste only the code between the quotes after content=. Not needed if you import from Search Console.'),
    ],
  },
  {
    key: 'footer',
    label: 'Footer',
    fields: [t('note', 'Footer note', 120, '{year} becomes the current year.')],
  },
];

export const DEFAULT_CONTENT = {
  site: { theme: DEFAULT_THEME, lang_toggle: true },
  brand: {
    name: 'PrecisionFix',
    tagline: 'Mobile Mechanic · Austin, TX · Mercedes-Benz Certified',
    tagline_es: 'Mecánico a domicilio · Austin, TX · Certificado Mercedes-Benz',
  },
  hero: {
    eyebrow: 'Austin, TX · Mobile Mechanic',
    eyebrow_es: 'Austin, TX · Mecánico a domicilio',
    headline: 'Precision\nFix',
    subhead: 'Factory-certified Mercedes-Benz technician bringing dealership-level diagnostics straight to your driveway. No shop overhead. No waiting rooms.',
    subhead_es: 'Técnico certificado de fábrica por Mercedes-Benz que lleva diagnóstico de nivel concesionario hasta tu cochera. Sin gastos de taller. Sin salas de espera.',
    cta_primary: 'Book a visit',
    cta_primary_es: 'Reservar visita',
    cta_secondary: 'Call / Text',
    cta_secondary_es: 'Llamar / Texto',
    trust: 'Clear quote first · Nothing to pay until I confirm · Same-day when I can',
    trust_es: 'Cotización clara primero · No pagas hasta que confirme · El mismo día cuando se puede',
    badge: 'Mercedes-Benz MB Drive Certified',
    badge_es: 'Certificado Mercedes-Benz MB Drive',
  },
  cta: {
    strip: 'Your car next?\nBook a visit.',
    strip_es: '¿Tu auto es el siguiente?\nReserva una visita.',
    strip_button: 'Pick a time',
    strip_button_es: 'Elegir un horario',
  },
  credentials: {
    heading: 'Credentials',
    heading_es: 'Credenciales',
    items: [
      { icon: '🏆', title: 'Mercedes-Benz Factory Certified (MB Drive)', title_es: 'Certificado de fábrica Mercedes-Benz (MB Drive)', body: 'Trained and certified directly through Mercedes-Benz, the same standard as dealership technicians.', body_es: 'Entrenado y certificado directamente por Mercedes-Benz, el mismo estándar que los técnicos de concesionario.' },
      { icon: '🔬', title: 'XENTRY / DAS Diagnostics', title_es: 'Diagnóstico XENTRY / DAS', body: 'Factory-level diagnostic tools most independent shops do not have.', body_es: 'Herramientas de diagnóstico de fábrica que la mayoría de los talleres independientes no tienen.' },
      { icon: '⚡', title: 'CAN Bus & Electrical', title_es: 'CAN Bus y sistema eléctrico', body: 'Complex European electrical fault isolation.', body_es: 'Localización de fallas eléctricas complejas en autos europeos.' },
      { icon: '🎓', title: 'UTI Graduate, 3.92 GPA', title_es: 'Graduado de UTI, promedio 3.92', body: 'Universal Technical Institute with academic honors.', body_es: 'Universal Technical Institute con honores académicos.' },
      { icon: '🚗', title: 'Multi-Brand Experience', title_es: 'Experiencia multimarca', body: 'Mercedes-Benz · BMW · Tesla · Acura · Toyota', body_es: 'Mercedes-Benz · BMW · Tesla · Acura · Toyota' },
    ],
  },
  services: {
    heading: 'What I fix',
    heading_es: 'Lo que arreglo',
    subhead: 'Most jobs are done in your driveway the same day. If it needs a lift, I tell you up front.',
    subhead_es: 'La mayoría de los trabajos se hacen en tu cochera el mismo día. Si necesita elevador, te lo digo desde el principio.',
    items: [
      { title: 'Diagnostics & Check Engine Light', title_es: 'Diagnóstico y luz de check engine', detail: 'Factory software reads the real fault, not a generic code.', detail_es: 'El software de fábrica lee la falla real, no un código genérico.' },
      { title: 'Brake Service', title_es: 'Frenos', detail: 'Pads, rotors, calipers, fluid.', detail_es: 'Pastillas, discos, cálipers, líquido.' },
      { title: 'Starter & Alternator Replacement', title_es: 'Marcha y alternador', detail: 'Car will not crank, or the battery light is on.', detail_es: 'El auto no arranca o la luz de batería está encendida.' },
      { title: 'Battery Service & Electrical Faults', title_es: 'Batería y fallas eléctricas', detail: 'Testing, replacement, parasitic drains, wiring.', detail_es: 'Pruebas, reemplazo, consumos parásitos, cableado.' },
      { title: 'Oil & Fluid Services', title_es: 'Aceite y fluidos', detail: 'OEM-spec oil, filters, coolant, brake fluid.', detail_es: 'Aceite con especificación OEM, filtros, anticongelante, líquido de frenos.' },
      { title: 'Suspension & Steering', title_es: 'Suspensión y dirección', detail: 'Shocks, struts, control arms, tie rods.', detail_es: 'Amortiguadores, brazos de control, terminales.' },
      { title: 'Pre-Purchase Inspections', title_es: 'Inspección antes de comprar', detail: 'Before you buy, know exactly what you are getting.', detail_es: 'Antes de comprar, sabe exactamente qué te estás llevando.' },
      { title: 'European Vehicles', title_es: 'Autos europeos', detail: 'Mercedes-Benz, BMW, Audi, VW: the tools and the training.', detail_es: 'Mercedes-Benz, BMW, Audi, VW: las herramientas y el entrenamiento.' },
    ],
  },
  why: {
    heading: 'Dealer quality.\nWithout the bill.',
    heading_es: 'Calidad de concesionario.\nSin la cuenta.',
    items: [
      { title: 'I come to you', title_es: 'Voy a ti', body: 'Your driveway, your job site, your parking lot. No towing, no waiting rooms, no rental car needed.', body_es: 'Tu cochera, tu obra, tu estacionamiento. Sin grúa, sin sala de espera, sin auto de renta.' },
      { title: 'Honest pricing', title_es: 'Precios honestos', body: 'You get a clear quote before I touch anything. No surprise labor charges or upsells.', body_es: 'Recibes una cotización clara antes de que toque nada. Sin cargos sorpresa ni ventas extra.' },
      { title: 'Dealer-level diagnostics', title_es: 'Diagnóstico de nivel concesionario', body: 'I run the same factory software dealerships use, catching what generic scanners miss.', body_es: 'Uso el mismo software de fábrica que los concesionarios y detecto lo que los escáneres genéricos no ven.' },
      { title: 'Bilingual, English & Spanish', title_es: 'Bilingüe, inglés y español', body: 'Comfortable explaining the repair clearly in either language. No confusion, no miscommunication.', body_es: 'Te explico la reparación con claridad en el idioma que prefieras. Sin confusiones.' },
    ],
  },
  area: {
    heading: 'Austin & surrounding',
    heading_es: 'Austin y alrededores',
    body: 'Serving most of the greater Austin metro. Message me to confirm your location.',
    body_es: 'Atiendo la mayor parte del área metropolitana de Austin. Escríbeme para confirmar tu ubicación.',
    cities: ['Austin', 'Cedar Park', 'Leander', 'Round Rock', 'Georgetown', 'Pflugerville', 'Kyle', 'Buda'].map((name) => ({ name })),
  },
  work: {
    heading: 'Cars I have worked on',
    heading_es: 'Autos en los que he trabajado',
    subhead: 'Real vehicles from the shop floor, not stock photos.',
    subhead_es: 'Vehículos reales del taller, no fotos de archivo.',
  },
  faq: {
    heading: 'Questions people ask',
    heading_es: 'Preguntas frecuentes',
    items: [
      { q: 'Do you really come to me?', q_es: '¿De verdad vienes a mí?', a: 'Yes. Your driveway, your office parking lot, your job site: anywhere the car can sit with room to open the hood and get underneath.', a_es: 'Sí. Tu cochera, el estacionamiento de tu oficina, tu obra: donde el auto pueda estar con espacio para abrir el cofre y meterme debajo.' },
      { q: 'Which cars do you work on?', q_es: '¿Qué autos atiendes?', a: 'Mercedes-Benz is my specialty: factory certified, with the same XENTRY diagnostics the dealership uses. I also work on BMW, Audi, VW, Porsche, Tesla, Toyota, Acura and most other makes.', a_es: 'Mercedes-Benz es mi especialidad: certificado de fábrica, con el mismo diagnóstico XENTRY que usa el concesionario. También atiendo BMW, Audi, VW, Porsche, Tesla, Toyota, Acura y casi cualquier otra marca.' },
      { q: 'How does pricing work?', q_es: '¿Cómo funcionan los precios?', a: 'You get a clear quote before I touch anything. No surprise labor charges, no upsells. You pay when the job is done.', a_es: 'Recibes una cotización clara antes de que toque nada. Sin cargos sorpresa ni ventas extra. Pagas cuando el trabajo está terminado.' },
      { q: 'Do I need to pay to book?', q_es: '¿Tengo que pagar para reservar?', a: 'Not to request a time. Once I confirm, a $50 deposit locks it in: it comes off your bill, and it is refunded in full if I have to cancel. If you cancel or miss the visit, the deposit is kept.', a_es: 'No para pedir un horario. Cuando confirmo, un depósito de $50 lo asegura: se descuenta de tu cuenta y se reembolsa completo si yo tengo que cancelar. Si tú cancelas o no estás para la visita, el depósito no se reembolsa.' },
      { q: 'What areas do you cover?', q_es: '¿Qué zonas cubres?', a: 'Austin and the surrounding cities: Cedar Park, Leander, Round Rock, Georgetown, Pflugerville, Kyle and Buda. Somewhere else nearby? Message me and I will tell you.', a_es: 'Austin y las ciudades de alrededor: Cedar Park, Leander, Round Rock, Georgetown, Pflugerville, Kyle y Buda. ¿Otro lugar cerca? Escríbeme y te digo.' },
      { q: 'What if the job needs a lift?', q_es: '¿Y si el trabajo necesita elevador?', a: 'Some jobs cannot be done in a driveway. I tell you up front, before any work starts, and help you plan the next step.', a_es: 'Algunos trabajos no se pueden hacer en una cochera. Te lo digo desde el principio, antes de empezar, y te ayudo a planear el siguiente paso.' },
      { q: 'Do you speak Spanish?', q_es: '¿Hablas español?', a: 'Yes. Everything from the quote to the repair, in English or Spanish, whichever you prefer.', a_es: 'Sí. Todo, desde la cotización hasta la reparación, en inglés o en español, como prefieras.' },
    ],
  },
  booking: {
    heading: 'Book a visit',
    heading_es: 'Reserva una visita',
    intro: 'Pick a day and a time, leave your details, and I confirm by text or call. The car comes after.',
    intro_es: 'Elige un día y una hora, deja tus datos y te confirmo por texto o llamada. El carro viene después.',
    success: 'Got it. I will text or call you shortly to confirm a time.',
    success_es: 'Recibido. Te escribo o te llamo en breve para confirmar la hora.',
    note: 'Nothing to pay to request a time. A $50 deposit locks in your confirmed visit and comes off your bill. Pay the rest online or in person.',
    note_es: 'No pagas nada para pedir un horario. Un depósito de $50 asegura tu visita confirmada y se descuenta de tu cuenta. El resto, en línea o en persona.',
    steps_heading: 'What happens next',
    steps_heading_es: 'Qué sigue',
    steps: [
      { title: 'Pick a time', title_es: 'Elige un horario', body: 'A day and a window, then your details. Nothing to pay yet.', body_es: 'Un día y una ventana de horario, luego tus datos. Todavía no pagas nada.' },
      { title: 'I confirm by text or call', title_es: 'Te confirmo por texto o llamada', body: 'Usually within a couple of hours, with a clear quote.', body_es: 'Normalmente en un par de horas, con una cotización clara.' },
      { title: 'Lock it in with a $50 deposit', title_es: 'Asegúralo con un depósito de $50', body: 'It comes off your bill. Refunded in full if I have to cancel.', body_es: 'Se descuenta de tu cuenta. Reembolso completo si yo tengo que cancelar.' },
      { title: 'I come to you', title_es: 'Voy a ti', body: 'Your driveway, job site or parking lot. Most jobs done the same day.', body_es: 'Tu cochera, obra o estacionamiento. La mayoría de los trabajos, el mismo día.' },
    ],
  },
  contact: {
    phone: '(512) 571-3425',
    sms: true,
    email: '',
    heading: 'Ready to book?',
    heading_es: '¿Listo para reservar?',
    body: 'Call or text with your vehicle, the issue, and your location. I get back to you fast.',
    body_es: 'Llama o manda texto con tu vehículo, el problema y tu ubicación. Te respondo rápido.',
    hours: '',
    hours_es: '',
    location: 'Austin, TX',
    instagram: '',
    facebook_url: '',
    google_review_url: '',
  },
  seo: {
    title: 'PrecisionFix – Mobile Mechanic | Austin, TX',
    // Under the field's 160 (the old 167-character default was clipped to "…English").
    description: 'Factory-certified Mercedes-Benz mobile mechanic in Austin, TX: dealer-level diagnostics, brakes, batteries and electrical in your driveway. English & Spanish.',
    google_verification: '',
    bing_verification: '',
  },
  footer: {
    note: '© {year} PrecisionFix · Mobile Mechanic · Austin, TX',
  },
};
