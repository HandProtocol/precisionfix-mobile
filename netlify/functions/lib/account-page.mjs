// /account/: where a customer asks before booking and reads the answers.
// Server-rendered frame in the site's theme; public/account/account.js fills
// it from /api/account/* and swaps EN/ES by data-i keys.

import { QUESTIONS, config, siteName } from './config.mjs';
import { escapeHtml as e } from './html.mjs';
import { siteThemeVars } from './theme.mjs';

const i = (key, en) => `data-i="${key}">${e(en)}`;

export function renderAccountPage() {
  const t = config.theme, fonts = config.fonts, v = encodeURIComponent(config.assetVersion);
  const cfg = { site: siteName(), langKey: (QUESTIONS && QUESTIONS.langKey) || '' };
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Ask before you book · ${e(siteName())}</title>
<meta name="robots" content="noindex, nofollow">
<meta name="theme-color" content="${e(t.bg)}">
<link rel="icon" type="image/svg+xml" href="${e(config.favicon)}">
${fonts.googleCss ? `<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="${e(fonts.googleCss)}" rel="stylesheet">` : ''}
<style>:root{${siteThemeVars()}}</style>
<link rel="stylesheet" href="/account/account.css?v=${v}">
<script type="application/json" id="account-config">${JSON.stringify(cfg).replace(/</g, '\\u003c')}</script>
<script src="/account/account.js?v=${v}" defer></script>
</head>
<body>
<header class="top">
  <a class="brand" href="/">${config.logo}<span>${e(siteName())}</span></a>
  <div class="top__right">
    <button class="lang" type="button" id="lang" aria-label="Ver en español">ES</button>
    <button class="btn btn--ghost btn--sm" type="button" id="logout" hidden ${i('logout', 'Sign out')}</button>
  </div>
</header>
<main class="wrap">
  <p class="msg" id="msg" role="status" aria-live="polite" hidden></p>

  <section id="view-loading" class="card"><p class="muted" ${i('loading', 'Loading…')}</p></section>

  <!-- signed out: ask, or sign in -->
  <section id="view-out" hidden>
    <div class="card">
      <h1 ${i('ask_h', 'Ask before you book')}</h1>
      <p class="muted" ${i('ask_intro', 'A noise, a price, whether we can come to you: ask here. You get the answer on this page and by email.')}</p>
      <form id="askform" class="stack" novalidate>
        <label class="field"><span ${i('f_name', 'Your name')}</span><input name="name" autocomplete="name" maxlength="80" required></label>
        <label class="field"><span ${i('f_email', 'Email')}</span><input name="email" type="email" autocomplete="email" maxlength="120" required></label>
        <div class="two">
          <label class="field"><span><span ${i('f_phone', 'Phone')}</span> <small ${i('optional', 'optional')}</small></span><input name="phone" type="tel" autocomplete="tel" maxlength="40"></label>
          <label class="field"><span><span ${i('f_car', 'Your car')}</span> <small ${i('optional', 'optional')}</small></span><input name="car" maxlength="120" data-i-ph="ph_car" placeholder="2017 Mercedes C300"></label>
        </div>
        <label class="field"><span ${i('f_question', 'Your question')}</span><textarea name="question" rows="5" maxlength="5000" required></textarea></label>
        <label class="hp" aria-hidden="true">Website<input name="website" tabindex="-1" autocomplete="off"></label>
        <button class="btn" type="submit" id="askbtn" ${i('ask_send', 'Send my question')}</button>
        <p class="tiny muted" ${i('ask_note', 'This makes you a free account with your email, so the answer has somewhere to land. No password needed.')}</p>
      </form>
    </div>

    <div class="card" id="signin">
      <h2 ${i('in_h', 'Asked before? Sign in')}</h2>
      <form id="loginform" class="stack">
        <label class="field"><span ${i('f_email', 'Email')}</span><input name="email" type="email" autocomplete="username" maxlength="120" required></label>
        <label class="field"><span ${i('f_password', 'Password')}</span><span class="pw"><input name="password" type="password" autocomplete="current-password" maxlength="200" required><button class="pw__show" type="button" data-pwshow ${i('show', 'Show')}</button></span></label>
        <button class="btn" type="submit" id="loginbtn" ${i('in_btn', 'Sign in')}</button>
      </form>
      <button class="btn btn--ghost btn--wide" type="button" id="linktoggle" aria-expanded="false" aria-controls="linkdrop" ${i('or_link', 'Or send magic link')}</button>
      <div class="drop" id="linkdrop" hidden>
        <form id="linkform" class="stack">
          <p class="tiny muted" ${i('link_note', 'No password yet, or forgot it? We email you a one-time link that signs you in.')}</p>
          <label class="field"><span ${i('f_email', 'Email')}</span><input name="email" type="email" autocomplete="email" maxlength="120" required></label>
          <button class="btn" type="submit" id="linkbtn" ${i('link_btn', 'Email me the link')}</button>
        </form>
      </div>
    </div>
  </section>

  <!-- signed in: the conversations -->
  <section id="view-in" hidden>
    <div class="card" id="list">
      <div class="head">
        <h1 id="hello"></h1>
        <button class="btn btn--sm" type="button" id="newbtn" aria-expanded="false" aria-controls="newform" ${i('new_btn', 'Ask something new')}</button>
      </div>
      <form id="newform" class="stack drop" hidden>
        <label class="field"><span ${i('f_question', 'Your question')}</span><textarea name="question" rows="4" maxlength="5000" required></textarea></label>
        <label class="field"><span><span ${i('f_car', 'Your car')}</span> <small ${i('optional', 'optional')}</small></span><input name="car" maxlength="120"></label>
        <button class="btn" type="submit" ${i('ask_send', 'Send my question')}</button>
      </form>
      <ul class="threads" id="threads"></ul>
    </div>

    <div class="card" id="thread" hidden>
      <div class="head">
        <button class="back" type="button" id="back" ${i('back', '← All questions')}</button>
        <a class="btn btn--sm" href="/#book" ${i('book', 'Book a time')}</a>
      </div>
      <h2 id="subject"></h2>
      <p class="tiny muted" id="threadmeta"></p>
      <ol class="chat" id="chat" aria-live="polite"></ol>
      <form id="replyform" class="reply">
        <label class="sr" for="replybody" ${i('reply_label', 'Your message')}</label>
        <textarea id="replybody" name="body" rows="3" maxlength="5000" required data-i-ph="ph_reply" placeholder="Write a message…"></textarea>
        <button class="btn" type="submit" id="replybtn" ${i('send', 'Send')}</button>
      </form>
    </div>

    <div class="card" id="acct">
      <h2 ${i('acct_h', 'Sign in faster')}</h2>
      <p class="muted" id="acctstatus"></p>
      <form id="pwform" class="stack" hidden>
        <input type="text" name="username" autocomplete="username" hidden>
        <label class="field" id="pwcurrent" hidden><span ${i('f_current', 'Current password')}</span><input name="current" type="password" autocomplete="current-password" maxlength="200"></label>
        <label class="field"><span ${i('f_newpw', 'New password')}</span><span class="pw"><input name="password" type="password" autocomplete="new-password" minlength="10" maxlength="200" required><button class="pw__show" type="button" data-pwshow ${i('show', 'Show')}</button></span><small class="muted" ${i('pw_help', 'At least 10 characters. A short sentence works well.')}</small></label>
        <button class="btn btn--ghost" type="submit" ${i('pw_save', 'Save password')}</button>
      </form>
    </div>
  </section>
  <p class="tiny muted foot"><a href="/" ${i('to_site', '← Back to the site')}</a></p>
</main>
</body>
</html>`;
}
