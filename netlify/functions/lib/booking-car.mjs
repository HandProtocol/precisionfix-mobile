// After a request is sent, the customer may share which car (the VIN or the
// year, make, and model) and then, under a notice they must agree to, what
// they have noticed (koH, 2026-10-14; the words koordi's funnel uses). Both
// post onto the request by its manage token: POST /api/booking/manage?t=
// { action: 'share', … }. The notice is versioned and its words live here,
// so the agreement stored on the booking names what was shown. The customer
// is never asked what they think is wrong before the car, and these boxes
// are optional. Pure: no I/O.

import { siteName } from './config.mjs';

// Bumped 2026-10-14b: the notice now also says the shop is not liable for any
// repair made without its own diagnosis first (koH).
export const SELF_REPORT_VERSION = 'self-report-2026-10-14b';
// 17 characters, no I, O or Q (the standard leaves them out).
export const VIN_RE = /^[A-HJ-NPR-Z0-9]{17}$/;
export const CAR_MODEL_MAX = 80;
export const ISSUES_MAX = 2500;

// The quick picks above the free text: what the customer noticed, in their own
// words after. Picked keys are stored as their labels at the top of `issues`
// (no new column); the free text may say anything.
export const SYMPTOMS = Object.freeze([
  { key: 'light', en: 'A warning light is on', es: 'Hay una luz de advertencia encendida' },
  { key: 'noise', en: 'A noise', es: 'Un ruido' },
  { key: 'leak', en: 'A leak or a puddle', es: 'Una fuga o un charco' },
  { key: 'start', en: 'Will not start', es: 'No arranca' },
  { key: 'brakes', en: 'Brakes feel off', es: 'Los frenos se sienten raros' },
  { key: 'overheat', en: 'Running hot', es: 'Se calienta' },
  { key: 'ac', en: 'AC or heat', es: 'Aire acondicionado o calefacción' },
  { key: 'electrical', en: 'Electrical or battery', es: 'Eléctrico o batería' },
  { key: 'shake', en: 'Shakes, pulls or steers oddly', es: 'Vibra, se va de lado o la dirección está rara' },
  { key: 'power', en: 'Loses power or stalls', es: 'Pierde fuerza o se apaga' },
  { key: 'smell', en: 'A smell or smoke', es: 'Un olor o humo' },
  { key: 'service', en: 'Maintenance or service due', es: 'Toca mantenimiento o servicio' },
  { key: 'other', en: 'Something else', es: 'Otra cosa' },
]);
export const SYMPTOM_KEYS = SYMPTOMS.map((s) => s.key);
export const symptomLabels = (keys, lang = 'en') => SYMPTOMS.filter((s) => keys.includes(s.key)).map((s) => (lang === 'es' ? s.es : s.en));

const WORDS = Object.freeze({
  en: {
    car_title: 'Which car is it?',
    car_intro: 'Optional. The VIN or the year, make, and model lets us get ready before we come.',
    vin: 'VIN (17 characters, on the dash by the windshield or the door sticker)',
    model: 'Or the year, make, and model',
    share: 'Share', skip: 'No thanks', send: 'Send',
    car_thanks: 'Thank you, we have it.',
    issues_title: 'What is going on with the car? (optional)',
    symptoms: 'Tick anything that fits',
    notice: (business) => `What you write here helps us plan, and we read it. It is not a diagnosis. ${business} is not responsible for a self-diagnosis, another mechanic's opinion, or any information suggested to you, and is not liable for any repair made without a diagnosis by ${business} first. Our responsibility is for the work we diagnose ourselves first and agree with you.`,
    issues: 'Describe it in your own words',
    placeholder: 'Whatever you have noticed: what the car does, when it started, what makes it worse, what someone else told you',
    agree: 'I have read the notice above and agree',
    issues_thanks: 'Thank you. We read it before we come.',
    needs_agree: 'Tick the box to send what you noticed.',
    bad_vin: 'A VIN is 17 letters and numbers.',
    nothing: 'Nothing to share yet.',
    not_active: 'This request is closed, so nothing more can be added.',
  },
  es: {
    car_title: '¿Qué carro es?',
    car_intro: 'Opcional. El VIN o el año, la marca y el modelo nos deja prepararnos antes de ir.',
    vin: 'VIN (17 caracteres, en el tablero junto al parabrisas o en la etiqueta de la puerta)',
    model: 'O el año, la marca y el modelo',
    share: 'Compartir', skip: 'No, gracias', send: 'Enviar',
    car_thanks: 'Gracias, ya lo tenemos.',
    issues_title: '¿Qué le pasa al carro? (opcional)',
    symptoms: 'Marque lo que aplique',
    notice: (business) => `Lo que escriba aquí nos ayuda a planear, y lo leemos. No es un diagnóstico. ${business} no se hace responsable de un autodiagnóstico, de la opinión de otro mecánico ni de información que le hayan sugerido, y no es responsable de ninguna reparación hecha sin un diagnóstico previo de ${business}. Nuestra responsabilidad es por el trabajo que diagnosticamos nosotros primero y acordamos con usted.`,
    issues: 'Descríbalo con sus palabras',
    placeholder: 'Lo que haya notado: qué hace el carro, cuándo empezó, qué lo empeora, lo que alguien más le dijo',
    agree: 'He leído el aviso anterior y estoy de acuerdo',
    issues_thanks: 'Gracias. Lo leemos antes de ir.',
    needs_agree: 'Marque la casilla para enviar lo que notó.',
    bad_vin: 'Un VIN tiene 17 letras y números.',
    nothing: 'Todavía no hay nada que compartir.',
    not_active: 'Esta solicitud está cerrada, así que no se puede agregar nada más.',
  },
});
export const carWords = (lang) => WORDS[lang === 'es' ? 'es' : 'en'];
export const selfReportNotice = (lang) => carWords(lang).notice(siteName());

const clip = (v, max) => String(v == null ? '' : v).replace(/\r\n?/g, '\n').trim().slice(0, max);
const truthy = (v) => v === true || v === 'true' || v === 'on' || v === '1' || v === 1;

// The picked quick answers (`noticed`): an array or a comma list of keys; unknown ones are dropped.
function symptomKeys(v) {
  const list = Array.isArray(v) ? v : String(v == null ? '' : v).split(',');
  return SYMPTOM_KEYS.filter((k) => list.map((x) => String(x).trim()).includes(k));
}

function bad(lang, key) {
  return Object.assign(new Error(carWords(lang)[key]), { status: 400 });
}

// The share body → the columns to write, or a 400 in the customer's
// language. The car (vin / car_model) and what they noticed (issues) may
// come together or in two posts; issues are refused without the agreement,
// and the agreement is stored with the notice's version only alongside them.
export function buildShare({ body, lang = 'en' }) {
  const vin = clip(body.vin, 40).toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (vin && !VIN_RE.test(vin)) throw bad(lang, 'bad_vin');
  const carModel = clip(body.car_model, CAR_MODEL_MAX);
  const picked = symptomKeys(body.noticed);
  const typed = clip(body.issues, ISSUES_MAX);
  const issues = [picked.length ? symptomLabels(picked, lang).join(', ') : '', typed].filter(Boolean).join('\n\n').slice(0, ISSUES_MAX);
  const ack = truthy(body.self_report_ack);
  if (issues && !ack) throw bad(lang, 'needs_agree');
  if (!vin && !carModel && !issues) throw bad(lang, 'nothing');
  const patch = {};
  if (vin || carModel) Object.assign(patch, { vin, car_model: carModel });
  if (issues) Object.assign(patch, { issues, self_report_ack: true, self_report_notice: SELF_REPORT_VERSION });
  return patch;
}

// The car as one line for the owner: the VIN, else the model.
export function carText(b) {
  return (b && (b.vin || b.car_model)) || '';
}
