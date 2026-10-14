// After a request is sent, the customer may share which car (the VIN or the
// year, make, and model) and then, under a notice they must agree to, what
// they have noticed (koH, 2026-10-14; the words koordi's funnel uses). Both
// post onto the request by its manage token: POST /api/booking/manage?t=
// { action: 'share', … }. The notice is versioned and its words live here,
// so the agreement stored on the booking names what was shown. The customer
// is never asked what they think is wrong before the car, and these boxes
// are optional. Pure: no I/O.

import { siteName } from './config.mjs';

export const SELF_REPORT_VERSION = 'self-report-2026-10-14';
// 17 characters, no I, O or Q (the standard leaves them out).
export const VIN_RE = /^[A-HJ-NPR-Z0-9]{17}$/;
export const CAR_MODEL_MAX = 80;
export const ISSUES_MAX = 1500;

const WORDS = Object.freeze({
  en: {
    car_title: 'Which car is it?',
    car_intro: 'Optional. The VIN or the year, make, and model lets us get ready before we come.',
    vin: 'VIN (17 characters, on the dash by the windshield or the door sticker)',
    model: 'Or the year, make, and model',
    share: 'Share', skip: 'No thanks', send: 'Send',
    car_thanks: 'Thank you, we have it.',
    issues_title: 'Anything you have noticed? (optional)',
    notice: (business) => `What you write here helps us plan, and we read it. It is not a diagnosis. ${business} is not responsible for a self-diagnosis, another mechanic's opinion, or any information suggested to you. Our responsibility is for the work we diagnose ourselves first and agree with you.`,
    issues: 'What you noticed',
    placeholder: 'A noise, a light, a leak, when it happens, what someone else told you',
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
    issues_title: '¿Algo que haya notado? (opcional)',
    notice: (business) => `Lo que escriba aquí nos ayuda a planear, y lo leemos. No es un diagnóstico. ${business} no se hace responsable de un autodiagnóstico, de la opinión de otro mecánico ni de información que le hayan sugerido. Nuestra responsabilidad es por el trabajo que diagnosticamos nosotros primero y acordamos con usted.`,
    issues: 'Lo que notó',
    placeholder: 'Un ruido, una luz, una fuga, cuándo pasa, lo que alguien más le dijo',
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
  const issues = clip(body.issues, ISSUES_MAX);
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
