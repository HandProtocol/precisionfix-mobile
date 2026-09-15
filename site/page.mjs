// PrecisionFix renderer: (content, media, origin, url) → full HTML.
//
// One semantic structure, five themes: the markup below is identical for
// every theme; <html data-theme="…"> plus /assets/themes/<id>.css turns it
// into Redline, Blueprint, Chrome & Carbon, Sunset Garage or Diagnostic.
// Small decoration slots (class "decor decor--…") are rendered always and
// switched on by the theme that uses them.
//
// Bilingual: any element with data-es swaps to Spanish when the visitor's
// browser prefers it or they tap EN / ES (site.js). Owner text goes through
// e() every time, English and Spanish alike.

import * as B from '../netlify/functions/lib/blocks.mjs';
import { toView } from '../netlify/functions/lib/content.mjs';
import { config } from '../netlify/functions/lib/config.mjs';
import { pickTheme } from './themes.mjs';

const { e } = B;

// Text with line breaks, escaped.
const brs = (s) => e(s).replace(/\n/g, '<br>');
// <tag data-es="…">en</tag> — the Spanish twin rides along as an attribute.
const bi = (tag, en, es, cls = '', attrs = '') =>
  `<${tag}${cls ? ` class="${cls}"` : ''}${es ? ` data-es="${brs(es)}"` : ''}${attrs ? ` ${attrs}` : ''}>${brs(en)}</${tag}>`;

const MAKES = ['Mercedes-Benz', 'BMW', 'Audi', 'Volkswagen', 'Porsche', 'Tesla', 'Toyota', 'Lexus', 'Honda', 'Acura', 'Ford', 'Chevrolet', 'GMC', 'Ram', 'Jeep', 'Nissan', 'Infiniti', 'Hyundai', 'Kia', 'Subaru', 'Mazda', 'Land Rover', 'Mini', 'Volvo'];
const TIMES = [
  ['Morning (8–11)', 'Mañana (8–11)'],
  ['Midday (11–2)', 'Mediodía (11–2)'],
  ['Afternoon (2–5)', 'Tarde (2–5)'],
  ['Evening (5–8)', 'Noche (5–8)'],
  ['Flexible', 'Flexible'],
];

function httpsUrl(value) {
  try {
    const u = new URL(String(value || ''));
    return u.protocol === 'https:' && !u.username && !u.password ? u.href : '';
  } catch (_) {
    return '';
  }
}

function heroTitle(headline) {
  const lines = String(headline || '').split('\n').map((l) => l.trim()).filter(Boolean);
  return lines.map((l, i) => `<span class="hero__line${i ? ' hero__line--alt' : ''}">${e(l)}</span>`).join('');
}

function credentials(c) {
  return c.credentials.items
    .map(
      (it, i) => `<li class="cred reveal" style="--d:${i * 70}ms">
  ${it.icon ? `<span class="cred__icon" aria-hidden="true">${e(it.icon)}</span>` : ''}
  ${bi('h3', it.title, it.title_es, 'cred__title')}
  ${it.body ? bi('p', it.body, it.body_es, 'cred__body') : ''}
</li>`
    )
    .join('\n');
}

function services(c) {
  return c.services.items
    .map(
      (s, i) => `<li class="service reveal" style="--d:${i * 50}ms">
  <span class="service__n" aria-hidden="true">${String(i + 1).padStart(2, '0')}</span>
  <div class="service__text">
    ${bi('h3', s.title, s.title_es, 'service__title')}
    ${s.detail ? bi('p', s.detail, s.detail_es, 'service__detail') : ''}
  </div>
  <span class="service__arrow" aria-hidden="true"></span>
</li>`
    )
    .join('\n');
}

function reasons(c) {
  return c.why.items
    .map(
      (r, i) => `<article class="reason reveal" style="--d:${i * 90}ms">
  <span class="reason__n" aria-hidden="true">${String(i + 1).padStart(2, '0')}</span>
  ${bi('h3', r.title, r.title_es, 'reason__title')}
  ${bi('p', r.body, r.body_es, 'reason__body')}
</article>`
    )
    .join('\n');
}

function tile(m, i) {
  const cap = m.caption ? `<span class="tile__cap">${e(m.caption)}</span>` : '';
  return `<figure class="tile reveal" style="--w:${m.width};--h:${m.height};--d:${(i % 5) * 60}ms" data-i="${i}">
  <button class="tile__btn" type="button" data-lightbox="${i}" aria-label="Open photo${m.alt ? `: ${e(m.alt)}` : ''}">
    ${B.img(m, { sizes: '(min-width: 1000px) 33vw, (min-width: 640px) 50vw, 100vw' })}
  </button>
  <figcaption class="tile__meta"><span class="tile__n">${String(i + 1).padStart(2, '0')}</span>${m.alt ? `<b class="tile__title">${e(m.alt)}</b>` : ''}${cap}</figcaption>
</figure>`;
}

function readout(c, cities) {
  const rows = [
    ['STATUS', 'MOBILE · SAME-DAY'],
    ['CERT', c.hero.badge || c.brand.name],
    ['AREA', cities.slice(0, 3).map((x) => x.name).join(' · ') || c.contact.location],
    ['LANG', 'EN · ES'],
  ];
  return `<dl class="decor decor--readout" aria-hidden="true">${rows.map(([k, v]) => `<div><dt>${e(k)}</dt><dd>${e(v)}</dd></div>`).join('')}<div class="readout__cursor"><dt>&gt;</dt><dd><i></i></dd></div></dl>`;
}

function bookingForm(c, themeId, cities) {
  const opts = c.services.items
    .map((s) => `<option value="${e(s.title)}"${s.title_es ? ` data-es="${e(s.title_es)}"` : ''}>${e(s.title)}</option>`)
    .join('');
  const cityOpts = cities.map((x) => `<option value="${e(x.name)}">${e(x.name)}</option>`).join('');
  const timeOpts = TIMES.map(([en, es]) => `<option value="${e(en)}" data-es="${e(es)}">${e(en)}</option>`).join('');
  const tel = B.telHref(c.contact.phone);
  return `<form class="form" id="bookform" name="booking" method="POST" action="/forms/booking.html" data-netlify="true" netlify-honeypot="bot-field">
  <input type="hidden" name="form-name" value="booking">
  <input type="hidden" name="lang" value="en" data-lang-field>
  <input type="hidden" name="theme" value="${e(themeId)}">
  <p class="form__hp" hidden aria-hidden="true"><label>Leave this empty <input name="bot-field" tabindex="-1" autocomplete="off"></label></p>

  <fieldset class="form__group">
    <legend><span class="form__step">01</span>${bi('span', 'You', 'Tú')}</legend>
    <div class="form__row">
      <label class="field">${bi('span', 'Name', 'Nombre')}<input name="name" type="text" required autocomplete="name" maxlength="80"></label>
      <label class="field">${bi('span', 'Phone', 'Teléfono')}<input name="phone" type="tel" required autocomplete="tel" inputmode="tel" maxlength="24" placeholder="(512) 000-0000"></label>
    </div>
    <div class="form__row">
      <label class="field">${bi('span', 'Email (for your confirmation)', 'Correo (para tu confirmación)')}<input name="email" type="email" autocomplete="email" inputmode="email" maxlength="120"></label>
      <fieldset class="field field--choice">
        <legend>${bi('span', 'How should I reach you?', '¿Cómo te contacto?')}</legend>
        <label class="choice"><input type="radio" name="contact_pref" value="Text" checked>${bi('span', 'Text', 'Texto')}</label>
        <label class="choice"><input type="radio" name="contact_pref" value="Call">${bi('span', 'Call', 'Llamada')}</label>
      </fieldset>
    </div>
  </fieldset>

  <fieldset class="form__group">
    <legend><span class="form__step">02</span>${bi('span', 'Your car', 'Tu auto')}</legend>
    <div class="form__row form__row--3">
      <label class="field">${bi('span', 'Year', 'Año')}<input name="vehicle_year" type="text" inputmode="numeric" pattern="(19|20)[0-9]{2}" required maxlength="4" placeholder="2019"></label>
      <label class="field">${bi('span', 'Make', 'Marca')}<input name="vehicle_make" type="text" list="makes" required maxlength="40" placeholder="Mercedes-Benz"></label>
      <label class="field">${bi('span', 'Model', 'Modelo')}<input name="vehicle_model" type="text" required maxlength="40" placeholder="GLE 350"></label>
    </div>
    <div class="form__row">
      <label class="field">${bi('span', 'Mileage (optional)', 'Millaje (opcional)')}<input name="mileage" type="text" inputmode="numeric" maxlength="9" placeholder="84,000"></label>
      <label class="field">${bi('span', 'VIN (optional, 17 characters)', 'VIN (opcional, 17 caracteres)')}<input name="vin" type="text" maxlength="17" autocapitalize="characters" spellcheck="false" placeholder="WDC…"></label>
    </div>
    <datalist id="makes">${MAKES.map((m) => `<option value="${e(m)}">`).join('')}</datalist>
  </fieldset>

  <fieldset class="form__group">
    <legend><span class="form__step">03</span>${bi('span', 'The problem', 'El problema')}</legend>
    <label class="field">${bi('span', 'What do you need?', '¿Qué necesitas?')}<select name="service" required><option value="" data-es="Elige…">Choose…</option>${opts}<option value="Something else" data-es="Otra cosa">Something else</option></select></label>
    <label class="field">${bi('span', 'What is the car doing?', '¿Qué está haciendo el auto?')}<textarea name="issue" rows="4" required maxlength="1500" placeholder="Noises, warning lights, when it happens…" data-es-ph="Ruidos, luces de advertencia, cuándo pasa…"></textarea></label>
  </fieldset>

  <fieldset class="form__group">
    <legend><span class="form__step">04</span>${bi('span', 'Where and when', 'Dónde y cuándo')}</legend>
    <div class="form__row">
      <label class="field">${bi('span', 'Where is the car?', '¿Dónde está el auto?')}<input name="address" type="text" required maxlength="160" autocomplete="street-address" placeholder="Street address or business name" data-es-ph="Dirección o nombre del negocio"></label>
      <label class="field">${bi('span', 'City', 'Ciudad')}<select name="city" required>${cityOpts}<option value="Other" data-es="Otra">Other</option></select></label>
    </div>
    <div class="form__row">
      <label class="field">${bi('span', 'Preferred date', 'Fecha preferida')}<input name="preferred_date" type="date"></label>
      <label class="field">${bi('span', 'Preferred time', 'Hora preferida')}<select name="preferred_time">${timeOpts}</select></label>
    </div>
  </fieldset>

  <div class="form__actions">
    <button class="btn btn--primary btn--lg form__submit" type="submit">${bi('span', 'Send booking request', 'Enviar solicitud')}</button>
    ${c.booking.note ? bi('p', c.booking.note, c.booking.note_es, 'form__note') : ''}
  </div>
  <p class="form__status" role="status" aria-live="polite"></p>
  <div class="form__done" hidden tabindex="-1">
    <span class="form__check" aria-hidden="true"></span>
    ${bi('h3', c.booking.success, c.booking.success_es)}
    ${tel ? `<p>${bi('span', 'In a hurry?', '¿Tienes prisa?')} <a href="${e(tel)}">${e(c.contact.phone)}</a></p>` : ''}
  </div>
</form>`;
}

function navLinks(nav) {
  const ES = { services: 'Servicios', why: 'Por qué yo', work: 'Trabajos', area: 'Zona', book: 'Reservar', creds: 'Credenciales' };
  return nav.map((n) => `<a href="#${e(n.id)}"${ES[n.id] ? ` data-es="${e(ES[n.id])}"` : ''}>${e(n.label)}</a>`).join('');
}

export function renderPage({ content, media, origin = '', url }) {
  const c = content;
  const T = pickTheme({ url, content: c });
  const views = media.map(toView);
  const featured = views.find((m) => m.featured) || views[0] || null;
  const tel = B.telHref(c.contact.phone);
  const sms = c.contact.sms ? B.smsHref(c.contact.phone) : '';
  const mail = c.contact.email ? `mailto:${c.contact.email}` : '';
  const ig = B.instagramUrl(c.contact.instagram);
  const fb = httpsUrl(c.contact.facebook_url);
  const review = httpsUrl(c.contact.google_review_url);
  const cities = c.area.cities.filter((x) => x.name);
  const v = e(config.assetVersion);

  const has = {
    creds: c.credentials.items.length > 0,
    services: c.services.items.length > 0,
    why: c.why.items.length > 0,
    area: Boolean(c.area.heading || cities.length),
    work: views.length > 0,
    book: true,
  };
  const nav = config.nav.filter((n) => has[n.id] !== false);
  let n = 0;
  const num = () => String(++n).padStart(2, '0');

  const bookBtn = (cls) => `<a class="btn btn--primary ${cls}" href="#book">${bi('span', c.hero.cta_primary || 'Book a visit', c.hero.cta_primary_es)}</a>`;
  const callBtn = (cls) => (tel ? `<a class="btn btn--ghost ${cls}" href="${e(tel)}">${B.ICONS.phone}${bi('span', c.hero.cta_secondary || 'Call / Text', c.hero.cta_secondary_es)}</a>` : '');
  const langToggle = c.site.lang_toggle
    ? `<button class="lang-toggle" type="button" aria-pressed="false" aria-label="Ver en español"><span class="lang-toggle__a">EN</span><span class="lang-toggle__b">ES</span></button>`
    : '';

  const jsonLd = B.jsonLd(c, origin, featured, {
    '@type': 'AutoRepair',
    areaServed: cities.map((x) => ({ '@type': 'City', name: x.name })),
    sameAs: [ig, fb].filter(Boolean),
    knowsLanguage: ['en', 'es'],
    priceRange: '$$',
  });

  return `<!DOCTYPE html>
<html lang="en" data-theme="${e(T.id)}">
<head>
${B.headTags({ content: c, featured, origin, theme: T.palette, fonts: T.fonts, extra: `<link rel="stylesheet" href="/assets/themes/${e(T.id)}.css?v=${v}">` })}
${jsonLd}
</head>
<body>
<a class="skip" href="#main">Skip to content</a>

<header class="nav" id="nav">
  <div class="wrap nav__row">
    <a class="nav__brand" href="#top" aria-label="${e(c.brand.name)}, home">${B.logo()}<span class="nav__name">${e(c.brand.name)}</span></a>
    <nav class="nav__links" aria-label="Sections">${navLinks(nav)}</nav>
    <div class="nav__tools">
      ${langToggle}
      ${bookBtn('btn--sm nav__cta')}
      <button class="nav__toggle" id="navtoggle" type="button" aria-expanded="false" aria-controls="menu"><span></span><span></span><span class="sr">Menu</span></button>
    </div>
  </div>
</header>
<div class="menu" id="menu" hidden>
  <nav aria-label="Sections">${navLinks(nav)}</nav>
  <div class="menu__cta">${bookBtn('btn--lg')}${callBtn('btn--lg')}</div>
</div>

<main id="main">
<section class="hero" id="top">
  <div class="hero__bg" aria-hidden="true">
    ${featured ? B.img(featured, { cls: 'hero__img', sizes: '100vw', eager: true, alt: '' }) : ''}
    <div class="hero__veil"></div>
    <div class="hero__fx"><i></i><i></i><i></i></div>
  </div>
  <div class="wrap hero__grid">
    <div class="hero__copy">
      ${c.hero.eyebrow ? bi('p', c.hero.eyebrow, c.hero.eyebrow_es, 'eyebrow hero__eyebrow') : ''}
      <h1 class="hero__title">${heroTitle(c.hero.headline || c.brand.name)}</h1>
      ${c.hero.subhead ? bi('p', c.hero.subhead, c.hero.subhead_es, 'hero__sub') : ''}
      <div class="hero__cta">${bookBtn('btn--lg')}${callBtn('btn--lg')}</div>
      ${c.hero.badge ? bi('p', c.hero.badge, c.hero.badge_es, 'hero__badge') : ''}
      <ul class="decor decor--stickers" aria-hidden="true"><li>${e(c.contact.location || 'Austin, TX')}</li><li>EN · ES</li><li data-es="Voy a ti">I come to you</li></ul>
    </div>
    ${
      featured
        ? `<figure class="hero__media reveal">
      ${B.img(featured, { cls: 'hero__photo', sizes: '(min-width: 900px) 50vw, 100vw', eager: true })}
      <figcaption class="hero__cap"><span class="decor decor--plate">FIG. 01</span>${e(featured.caption || featured.alt)}</figcaption>
    </figure>`
        : ''
    }
    ${readout(c, cities)}
  </div>
  <p class="hero__scroll" aria-hidden="true"><span data-es="Desliza">Scroll</span><i></i></p>
</section>

${
  has.creds
    ? `<section class="section creds" id="creds">
  <div class="wrap">
    <header class="section__head reveal"><p class="eyebrow">${num()}</p>${bi('h2', c.credentials.heading, c.credentials.heading_es)}</header>
    <ul class="creds__grid">${credentials(c)}</ul>
  </div>
</section>`
    : ''
}

${
  has.services
    ? `<section class="section services" id="services">
  <div class="wrap">
    <header class="section__head reveal">
      <p class="eyebrow">${num()}</p>
      ${bi('h2', c.services.heading, c.services.heading_es)}
      ${c.services.subhead ? bi('p', c.services.subhead, c.services.subhead_es, 'lede') : ''}
    </header>
    <ol class="services__list">${services(c)}</ol>
  </div>
</section>`
    : ''
}

${
  has.why
    ? `<section class="section why" id="why">
  <div class="wrap why__inner">
    <header class="section__head reveal"><p class="eyebrow">${num()}</p>${bi('h2', c.why.heading, c.why.heading_es)}</header>
    <div class="why__grid">${reasons(c)}</div>
  </div>
</section>`
    : ''
}

${
  has.work
    ? `<section class="section work" id="work">
  <div class="wrap">
    <header class="section__head reveal">
      <p class="eyebrow">${num()}</p>
      ${bi('h2', c.work.heading, c.work.heading_es)}
      ${c.work.subhead ? bi('p', c.work.subhead, c.work.subhead_es, 'lede') : ''}
    </header>
    <div class="gallery" id="gallery">${views.map(tile).join('\n')}</div>
  </div>
</section>`
    : ''
}

${
  has.area
    ? `<section class="section area" id="area">
  <div class="wrap area__inner">
    <header class="section__head reveal">
      <p class="eyebrow">${num()}</p>
      ${bi('h2', c.area.heading, c.area.heading_es)}
      ${c.area.body ? bi('p', c.area.body, c.area.body_es, 'lede') : ''}
    </header>
    ${cities.length ? `<ul class="area__tags reveal">${cities.map((x, i) => `<li style="--d:${i * 40}ms">${e(x.name)}</li>`).join('')}</ul>` : ''}
    <div class="decor decor--radar" aria-hidden="true"><i></i><i></i><i></i><b></b></div>
  </div>
</section>`
    : ''
}

<section class="section book" id="book">
  <div class="wrap book__grid">
    <div class="book__copy">
      <header class="section__head reveal">
        <p class="eyebrow">${num()}</p>
        ${bi('h2', c.booking.heading, c.booking.heading_es)}
        ${c.booking.intro ? bi('p', c.booking.intro, c.booking.intro_es, 'lede') : ''}
      </header>
      <div class="contact reveal">
        ${bi('h3', c.contact.heading, c.contact.heading_es, 'contact__title')}
        ${c.contact.body ? bi('p', c.contact.body, c.contact.body_es, 'contact__body') : ''}
        ${tel ? `<a class="contact__phone" href="${e(tel)}">${e(c.contact.phone)}</a>` : ''}
        <div class="contact__actions">
          ${tel ? `<a class="btn btn--ghost" href="${e(tel)}">${B.ICONS.phone}${bi('span', 'Call', 'Llamar')}</a>` : ''}
          ${sms ? `<a class="btn btn--ghost" href="${e(sms)}">${B.ICONS.message}${bi('span', 'Text', 'Texto')}</a>` : ''}
          ${mail ? `<a class="btn btn--ghost" href="${e(mail)}">${B.ICONS.mail}<span>Email</span></a>` : ''}
        </div>
        <dl class="contact__meta">
          ${c.contact.hours ? `<div><dt data-es="Horario">Hours</dt>${bi('dd', c.contact.hours, c.contact.hours_es)}</div>` : ''}
          ${c.contact.location ? `<div><dt data-es="Base">Based in</dt><dd>${e(c.contact.location)}</dd></div>` : ''}
          ${ig ? `<div><dt>Instagram</dt><dd><a href="${e(ig)}" rel="noopener" target="_blank">@${e(c.contact.instagram.replace(/^@/, ''))}</a></dd></div>` : ''}
          ${fb ? `<div><dt>Facebook</dt><dd><a href="${e(fb)}" rel="noopener" target="_blank" data-es="Página">Page</a></dd></div>` : ''}
          ${review ? `<div><dt>Google</dt><dd><a href="${e(review)}" rel="noopener" target="_blank" data-es="Deja una reseña">Leave a review</a></dd></div>` : ''}
        </dl>
      </div>
    </div>
    <div class="book__form reveal">${bookingForm(c, T.id, cities)}</div>
  </div>
</section>
</main>

<footer class="foot">
  <div class="wrap foot__inner">
    <a class="foot__brand" href="#top">${B.logo()}<span>${e(c.brand.name)}</span></a>
    ${c.brand.tagline ? bi('p', c.brand.tagline, c.brand.tagline_es, 'foot__tag') : ''}
    <p class="foot__note">${e(c.footer.note.replace('{year}', B.year()))}</p>
    ${B.footerLinks()}
  </div>
</footer>

<div class="callbar" id="callbar">${bookBtn('')}${tel ? `<a class="btn btn--ghost" href="${e(tel)}">${B.ICONS.phone}${bi('span', 'Call', 'Llamar')}</a>` : ''}</div>
${has.work ? B.lightboxHtml() : ''}
${B.mediaJson(views)}
${B.siteScript()}
</body>
</html>`;
}
