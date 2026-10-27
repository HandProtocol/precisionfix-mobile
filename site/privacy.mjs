// /privacy/: the privacy policy, EN + ES, in the site's chosen theme.
//
// Written from what the site actually does (audit 2026-10-27): no analytics,
// no ad or social pixels, no visitor cookies, fonts self-hosted. Sign-in
// cookies only after someone signs in; the language pick and an unsent
// booking draft stay in the visitor's own browser. If any of that changes
// (a tracker, a new processor, a new form field), change this page and
// UPDATED (site/privacy-updated.mjs) in the same commit. CalOPPA wants: what is collected, who it is
// shared with, how to review or change it, how changes are announced, the
// effective date, and how Do Not Track is handled.

import * as B from '../netlify/functions/lib/blocks.mjs';
import { config } from '../netlify/functions/lib/config.mjs';
import { pickTheme } from './themes.mjs';
import { UPDATED } from './privacy-updated.mjs';

const { e } = B;

export { UPDATED };

// <tag data-es="…">en</tag>, the same pattern as site/page.mjs
const bi = (tag, en, es, cls = '') => `<${tag}${cls ? ` class="${cls}"` : ''} data-es="${e(es)}">${e(en)}</${tag}>`;
const list = (items) => `<ul>${items.map(([en, es]) => bi('li', en, es)).join('')}</ul>`;

function sections(c) {
  const name = (c.brand && c.brand.name) || 'PrecisionFix';
  const phone = (c.contact && c.contact.phone) || '';
  const email = (c.contact && c.contact.email) || '';
  const reach = [
    phone ? [`Call or text ${phone}.`, `Llama o manda texto al ${phone}.`] : null,
    email ? [`Email ${email}.`, `Escribe a ${email}.`] : null,
    ['Or reply to any email we have sent you. It reaches us directly.', 'O responde a cualquier correo que te hayamos enviado. Nos llega directo.'],
  ].filter(Boolean);
  return [
    {
      h: ['The short version', 'En resumen'],
      p: [
        [`${name} is a mobile mechanic in Austin, Texas. We collect only what we need to book and fix your car, and to bill you for it.`, `${name} es un mecánico a domicilio en Austin, Texas. Solo pedimos lo necesario para agendar y reparar tu carro, y para cobrarte el trabajo.`],
        ['This website has no ads, no analytics, no tracking pixels and no tracking cookies. Nothing on it follows you to other sites. We do not sell or rent your information, and we never share it for advertising.', 'Este sitio no tiene anuncios, ni analíticas, ni píxeles de rastreo, ni cookies de rastreo. Nada aquí te sigue a otros sitios. No vendemos ni rentamos tu información, y nunca la compartimos para publicidad.'],
      ],
    },
    {
      h: ['What we collect', 'Qué información recopilamos'],
      p: [['Only what you type into a form:', 'Solo lo que escribes en un formulario:']],
      list: [
        ['Booking a visit: your name, phone, email, where the car is (address and city), the car (model and VIN if you give it), what you noticed, your notes, the service and time you pick, how you like to be contacted and your language.', 'Al agendar una visita: tu nombre, teléfono, correo, dónde está el carro (dirección y ciudad), el carro (modelo y VIN si lo das), lo que notaste, tus notas, el servicio y horario que eliges, cómo prefieres que te contactemos y tu idioma.'],
        ['Asking a question: your name, email, your question, and your phone and car if you add them. This makes a free account with your email so the answer has somewhere to land.', 'Al hacer una pregunta: tu nombre, correo, tu pregunta, y tu teléfono y carro si los agregas. Esto crea una cuenta gratis con tu correo para que la respuesta tenga dónde llegar.'],
        ['Paying a deposit or an invoice: the amount and whether it was paid. You type your card into Stripe\'s own payment page; we never see or store your card number.', 'Al pagar un depósito o una factura: el monto y si se pagó. Tu tarjeta la escribes en la página de pago de Stripe; nosotros nunca vemos ni guardamos el número de tu tarjeta.'],
        ['When you send a form, the internet (IP) address it came from, to stop spam and abuse. Our host also keeps short-lived technical logs, as every website host does.', 'Cuando envías un formulario, la dirección de internet (IP) desde la que llegó, para frenar el spam y el abuso. Nuestro proveedor de hosting también guarda registros técnicos por poco tiempo, como cualquier sitio web.'],
      ],
    },
    {
      h: ['Cookies and your browser', 'Cookies y tu navegador'],
      p: [
        ['Just visiting sets no cookies. If you sign in (to your account, or the owner to the editor), one cookie keeps you signed in. It is needed for signing in to work and is used for nothing else.', 'Solo visitar el sitio no pone ninguna cookie. Si inicias sesión (en tu cuenta, o el dueño en el editor), una cookie mantiene tu sesión abierta. Es necesaria para iniciar sesión y no se usa para nada más.'],
        ['Your browser itself remembers two things on your device, and they are not sent to us: the language you pick (EN / ES), and a booking you started but have not sent, so you do not lose it. Clearing your browser data removes both.', 'Tu propio navegador recuerda dos cosas en tu dispositivo, y no nos las envía: el idioma que eliges (EN / ES), y una reserva que empezaste pero no enviaste, para que no la pierdas. Al borrar los datos de tu navegador se borran las dos.'],
        ['Because nothing here tracks you, there is nothing to accept or decline, so there is no cookie banner. If that ever changes, we will ask first and nothing will load until you say yes.', 'Como aquí nada te rastrea, no hay nada que aceptar o rechazar, por eso no hay aviso de cookies. Si eso cambia algún día, te preguntaremos primero y nada se cargará hasta que digas que sí.'],
      ],
    },
    {
      h: ['How we use it', 'Cómo la usamos'],
      list: [
        ['To schedule your visit, get to you and do the work.', 'Para agendar tu visita, llegar a ti y hacer el trabajo.'],
        ['To contact you about your booking: confirmations, reminders, changes, answers to your questions.', 'Para contactarte sobre tu reserva: confirmaciones, recordatorios, cambios y respuestas a tus preguntas.'],
        ['To send invoices and receipts, and keep the records a business must keep.', 'Para enviar facturas y recibos, y guardar los registros que un negocio debe guardar.'],
        ['To keep the site safe from spam and abuse.', 'Para proteger el sitio del spam y el abuso.'],
      ],
      p2: [['We do not send marketing emails, and we do not use your information to build profiles or target ads.', 'No enviamos correos de publicidad, y no usamos tu información para crear perfiles ni para dirigir anuncios.']],
    },
    {
      h: ['Who else handles it', 'Quién más la maneja'],
      p: [['A few companies run parts of this site for us. Each gets only what its job needs and may use it only to do that job:', 'Algunas empresas operan partes de este sitio por nosotros. Cada una recibe solo lo que su tarea necesita y solo puede usarlo para esa tarea:']],
      list: [
        ['Netlify hosts the website.', 'Netlify aloja el sitio web.'],
        ['Supabase stores bookings, questions and invoices in its database.', 'Supabase guarda las reservas, preguntas y facturas en su base de datos.'],
        ['Resend delivers our emails to you.', 'Resend entrega nuestros correos.'],
        ['Stripe takes card payments. Its payment page follows Stripe\'s own privacy policy.', 'Stripe procesa los pagos con tarjeta. Su página de pago sigue la política de privacidad de Stripe.'],
        ['HAND Protocol, the Austin nonprofit that built this site, keeps it running and can see this information only to do that.', 'HAND Protocol, la organización sin fines de lucro de Austin que hizo este sitio, lo mantiene funcionando y solo puede ver esta información para hacer eso.'],
      ],
      p2: [['We share information beyond that only if the law requires it.', 'Solo compartimos información fuera de eso si la ley lo exige.']],
    },
    {
      h: ['Do Not Track and Global Privacy Control', 'Do Not Track y Global Privacy Control'],
      p: [['This site does not track you across other sites, with or without these signals. If your browser sends Do Not Track or Global Privacy Control, nothing changes, because there is no tracking or selling to switch off.', 'Este sitio no te rastrea en otros sitios, con o sin estas señales. Si tu navegador envía Do Not Track o Global Privacy Control, nada cambia, porque no hay rastreo ni venta de datos que apagar.']],
    },
    {
      h: ['How long we keep it', 'Cuánto tiempo la guardamos'],
      p: [['Bookings, questions and invoices are kept as long as we need them to serve you and for our business and tax records. Spam-protection records are short-lived. Ask us and we will delete what we are not required to keep.', 'Las reservas, preguntas y facturas se guardan mientras las necesitemos para atenderte y para nuestros registros de negocio e impuestos. Los registros contra el spam duran poco. Pídenoslo y borraremos lo que no estemos obligados a guardar.']],
    },
    {
      h: ['Your choices', 'Tus opciones'],
      p: [['You can ask to see the information we have about you, to correct it, or to delete it, wherever you live. We will answer within 45 days, usually much sooner. To ask:', 'Puedes pedir ver la información que tenemos sobre ti, corregirla o borrarla, vivas donde vivas. Te responderemos en un máximo de 45 días, normalmente mucho antes. Para pedirlo:']],
      list: reach,
    },
    {
      h: ['Children', 'Menores'],
      p: [['This site is for car owners. It is not meant for children under 13, and we do not knowingly collect their information.', 'Este sitio es para dueños de carros. No está dirigido a menores de 13 años, y no recopilamos su información a sabiendas.']],
    },
    {
      h: ['Changes', 'Cambios'],
      p: [['If we change how we handle your information, we will update this page and the date at the top. A change that collects more, or shares more, will be explained here before it takes effect.', 'Si cambiamos cómo manejamos tu información, actualizaremos esta página y la fecha de arriba. Un cambio que recopile o comparta más se explicará aquí antes de que entre en vigor.']],
    },
  ];
}

const block = (s) =>
  `<section class="pp__sec">
  ${bi('h2', s.h[0], s.h[1])}
  ${(s.p || []).map(([en, es]) => bi('p', en, es)).join('\n  ')}
  ${s.list ? list(s.list) : ''}
  ${(s.p2 || []).map(([en, es]) => bi('p', en, es)).join('\n  ')}
</section>`;

export function renderPrivacyPage({ content, url }) {
  const c = content;
  const T = pickTheme({ url, content: c });
  const v = e(config.assetVersion);
  const name = (c.brand && c.brand.name) || config.name;
  const canonical = `${B.canonicalBase()}/privacy/`;
  const title = `Privacy policy · ${name}`;
  const desc = `How ${name} handles your information: no tracking, no ads, no selling. What the booking form collects and who helps run the site.`;
  const langToggle = c.site && c.site.lang_toggle
    ? `<button class="lang-toggle" type="button" aria-pressed="false" aria-label="EN ES: ver en español"><span class="lang-toggle__a">EN</span> <span class="lang-toggle__b">ES</span></button>`
    : '';
  return `<!DOCTYPE html>
<html lang="en" data-theme="${e(T.id)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${e(title)}</title>
<meta name="description" content="${e(desc)}">
<link rel="canonical" href="${e(canonical)}">
<meta property="og:title" content="${e(title)}">
<meta property="og:description" content="${e(desc)}">
<meta property="og:type" content="website">
<meta property="og:url" content="${e(canonical)}">
<meta property="og:site_name" content="${e(name)}">
<meta name="twitter:card" content="summary">
<meta name="theme-color" content="${e(T.palette.bg)}">
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
${B.fontLinks(T.fonts)}
${B.themeStyle(T.palette, T.fonts)}
<link rel="stylesheet" href="/assets/site.css?v=${v}">
<link rel="stylesheet" href="/assets/themes/${e(T.id)}.css?v=${v}">
<style>
.pp{max-width:46rem;margin:0 auto;padding:clamp(5.5rem,12vw,8rem) 16px 4rem}
.pp__top{display:flex;align-items:center;justify-content:space-between;gap:1rem;max-width:46rem;margin:0 auto;padding:1.25rem 16px 0;position:absolute;inset:0 0 auto 0}
.pp__brand{display:inline-flex;align-items:center;gap:.6rem;color:var(--ink);text-decoration:none;font-weight:600}
.pp__brand .mark{width:28px;height:28px;color:var(--accent)}
.pp h1{font-family:var(--font-display);font-size:clamp(2.4rem,7vw,3.6rem);line-height:1;margin:0 0 .6rem;color:var(--ink)}
.pp__date{color:var(--ink-3);font-size:.9rem;margin:0 0 2.5rem}
.pp__sec{border-top:1px solid var(--line);padding:1.6rem 0}
.pp h2{font-family:var(--font-display);font-size:clamp(1.4rem,4vw,1.8rem);line-height:1.15;margin:0 0 .8rem;color:var(--ink)}
.pp p,.pp li{color:var(--ink-2);line-height:1.65;font-size:1rem}
.pp p+p,.pp ul+p{margin-top:.8rem}
.pp ul{margin:.7rem 0 0;padding-left:1.2rem;display:grid;gap:.55rem}
.pp a{color:var(--accent)}
.pp__back{display:inline-block;margin-top:2rem}
</style>
</head>
<body>
<header class="pp__top">
  <a class="pp__brand" href="/">${B.logo()}<span>${e(name)}</span></a>
  ${langToggle}
</header>
<main class="pp" id="main">
  ${bi('h1', 'Privacy policy', 'Política de privacidad')}
  ${bi('p', `Last updated ${UPDATED.en}`, `Actualizada el ${UPDATED.es}`, 'pp__date')}
  ${sections(c).map(block).join('\n  ')}
  <a class="pp__back" href="/" data-es="← Volver al inicio">← Back to the home page</a>
</main>
${B.siteScript()}
</body>
</html>`;
}
