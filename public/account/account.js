/* /account/: ask before booking, read the answers. Vanilla JS, no inline
   script (the page's CSP allows only this file). Talks to /api/account/*. */
(function () {
  'use strict';
  var d = document;
  var $ = function (s, r) { return (r || d).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || d).querySelectorAll(s)); };
  var cfg = {}; try { cfg = JSON.parse($('#account-config').textContent || '{}'); } catch (_) {}
  var SITE = cfg.site || '';
  var POLL_MS = 15000;

  var STR = {
    en: {
      logout: 'Sign out', loading: 'Loading…', ask_h: 'Ask before you book',
      ask_intro: 'A noise, a price, whether we can come to you: ask here. You get the answer on this page and by email.',
      f_name: 'Your name', f_email: 'Email', f_phone: 'Phone', f_car: 'Your car', optional: 'optional', f_question: 'Your question',
      ask_send: 'Send my question', ask_note: 'This makes you a free account with your email, so the answer has somewhere to land. No password needed.',
      in_h: 'Asked before? Sign in', f_password: 'Password', show: 'Show', hide: 'Hide', in_btn: 'Sign in', or_link: 'Or send magic link',
      link_note: 'No password yet, or forgot it? We email you a one-time link that signs you in.', link_btn: 'Email me the link',
      new_btn: 'Ask something new', back: '← All questions', book: 'Book a time', reply_label: 'Your message', ph_reply: 'Write a message…', ph_car: '2017 Mercedes C300', send: 'Send',
      acct_h: 'Sign in faster', f_current: 'Current password', f_newpw: 'New password', pw_help: 'At least 10 characters. A short sentence works well.', pw_save: 'Save password',
      to_site: '← Back to the site',
      hello: function (n) { return n ? 'Hi, ' + n : 'Your questions'; },
      none: 'No questions yet. Ask one above.',
      you: 'You', closed: 'closed',
      waiting: 'Waiting for an answer', answered: 'Answered',
      sending: 'Sending…', signing: 'Signing in…',
      asked_in: function (s) { return 'Sent. ' + s + ' answers here, and we email you when there is a reply.'; },
      asked_known: 'Sent. You already have an account with this email, so we emailed you a link: open it to see the answer here.',
      link_sent: 'If that email has an account, a sign-in link is on its way. It works once and expires in 20 minutes.',
      opening: 'Signing you in…',
      pw_none: 'You sign in with email links. Add a password to skip the inbox next time.',
      pw_set: function (when) { return 'Password set' + (when ? ' on ' + when : '') + '. Change it below.'; },
      pw_verify: 'Open the link we emailed you first. Then you can add a password here.',
      pw_saved: 'Password saved. Other devices are signed out.',
      thread_meta: function (when, car) { return 'Asked ' + when + (car ? ' · ' + car : ''); },
    },
    es: {
      logout: 'Salir', loading: 'Cargando…', ask_h: 'Pregunta antes de reservar',
      ask_intro: 'Un ruido, un precio, si podemos ir a ti: pregunta aquí. Recibes la respuesta en esta página y por correo.',
      f_name: 'Tu nombre', f_email: 'Correo', f_phone: 'Teléfono', f_car: 'Tu carro', optional: 'opcional', f_question: 'Tu pregunta',
      ask_send: 'Enviar mi pregunta', ask_note: 'Esto te crea una cuenta gratis con tu correo, para que la respuesta tenga dónde llegar. Sin contraseña.',
      in_h: '¿Ya preguntaste? Entra', f_password: 'Contraseña', show: 'Ver', hide: 'Ocultar', in_btn: 'Entrar', or_link: 'O envíame un enlace',
      link_note: '¿Aún sin contraseña, o la olvidaste? Te enviamos un enlace de un solo uso para entrar.', link_btn: 'Enviarme el enlace',
      new_btn: 'Preguntar algo nuevo', back: '← Todas las preguntas', book: 'Reservar una hora', reply_label: 'Tu mensaje', ph_reply: 'Escribe un mensaje…', ph_car: '2017 Mercedes C300', send: 'Enviar',
      acct_h: 'Entra más rápido', f_current: 'Contraseña actual', f_newpw: 'Nueva contraseña', pw_help: 'Al menos 10 caracteres. Una frase corta funciona bien.', pw_save: 'Guardar contraseña',
      to_site: '← Volver al sitio',
      hello: function (n) { return n ? 'Hola, ' + n : 'Tus preguntas'; },
      none: 'Aún no hay preguntas. Haz una arriba.',
      you: 'Tú', closed: 'cerrada',
      waiting: 'Esperando respuesta', answered: 'Respondida',
      sending: 'Enviando…', signing: 'Entrando…',
      asked_in: function (s) { return 'Enviada. ' + s + ' responde aquí y te avisamos por correo.'; },
      asked_known: 'Enviada. Ya tienes una cuenta con este correo, así que te enviamos un enlace: ábrelo para ver la respuesta aquí.',
      link_sent: 'Si ese correo tiene cuenta, va en camino un enlace para entrar. Sirve una vez y vence en 20 minutos.',
      opening: 'Entrando…',
      pw_none: 'Entras con enlaces por correo. Pon una contraseña para no abrir el correo la próxima vez.',
      pw_set: function (when) { return 'Contraseña puesta' + (when ? ' el ' + when : '') + '. Cámbiala abajo.'; },
      pw_verify: 'Primero abre el enlace que te enviamos. Luego puedes poner una contraseña aquí.',
      pw_saved: 'Contraseña guardada. Se cerró la sesión en otros dispositivos.',
      thread_meta: function (when, car) { return 'Preguntaste ' + when + (car ? ' · ' + car : ''); },
    },
  };

  var state = { lang: 'en', customer: null, threads: [], open: null, messages: [], timer: 0 };

  // ---------------------------------------------------------------- lang --
  function storedLang() { try { return cfg.langKey ? localStorage.getItem(cfg.langKey) : null; } catch (_) { return null; } }
  function S(k) { return STR[state.lang][k]; }
  function setLang(lang) {
    state.lang = lang === 'es' ? 'es' : 'en';
    d.documentElement.lang = state.lang;
    $$('[data-i]').forEach(function (el) { var v = S(el.getAttribute('data-i')); if (typeof v === 'string') el.textContent = v; });
    $$('[data-i-ph]').forEach(function (el) { var v = S(el.getAttribute('data-i-ph')); if (typeof v === 'string') el.placeholder = v; });
    var b = $('#lang'); b.textContent = state.lang === 'es' ? 'EN' : 'ES'; b.setAttribute('aria-label', state.lang === 'es' ? 'View in English' : 'Ver en español');
    if (state.customer) { renderList(); renderAcct(); if (state.open) renderChat(); }
  }
  $('#lang').addEventListener('click', function () {
    var next = state.lang === 'es' ? 'en' : 'es';
    try { if (cfg.langKey) localStorage.setItem(cfg.langKey, next); } catch (_) {}
    setLang(next);
  });

  // --------------------------------------------------------------- utils --
  async function api(method, path, body) {
    var res = await fetch(path, { method: method, credentials: 'same-origin', headers: body !== undefined ? { 'Content-Type': 'application/json' } : {}, body: body !== undefined ? JSON.stringify(body) : undefined });
    var data = null; try { data = await res.json(); } catch (_) {}
    if (!res.ok || !data || data.ok === false) { var err = new Error((data && data.error) || ('Request failed (' + res.status + ')')); err.status = res.status; err.data = data; throw err; }
    return data;
  }
  function say(text, ok) { var m = $('#msg'); m.textContent = text || ''; m.className = 'msg' + (ok ? ' ok' : ''); m.hidden = !text; if (text) m.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
  function busy(btn, on, label) { if (!btn) return; if (on) { btn.dataset.label = btn.textContent; btn.textContent = label || S('sending'); } else if (btn.dataset.label) btn.textContent = btn.dataset.label; btn.disabled = on; }
  function show(view) { ['loading', 'out', 'in'].forEach(function (v) { $('#view-' + v).hidden = v !== view; }); $('#logout').hidden = view !== 'in'; }
  function when(iso, long) {
    try {
      var dt = new Date(iso), now = new Date(), loc = state.lang === 'es' ? 'es' : 'en';
      var sameDay = dt.toDateString() === now.toDateString();
      return sameDay && !long ? dt.toLocaleTimeString(loc, { hour: 'numeric', minute: '2-digit' }) : dt.toLocaleString(loc, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
    } catch (_) { return iso; }
  }
  function li(cls, kids) { var el = d.createElement('li'); if (cls) el.className = cls; kids.forEach(function (k) { el.appendChild(k); }); return el; }
  function el(tag, cls, text) { var x = d.createElement(tag); if (cls) x.className = cls; if (text != null) x.textContent = text; return x; }

  // ---------------------------------------------------------- signed out --
  $('#askform').addEventListener('submit', async function (e) {
    e.preventDefault();
    var f = e.target, btn = $('#askbtn');
    var bad = ['name', 'email', 'question'].filter(function (n) { return !f[n].checkValidity(); })[0];
    if (bad) { f[bad].reportValidity(); return; }
    busy(btn, true); say('');
    try {
      var r = await api('POST', '/api/account/ask', { name: f.name.value, email: f.email.value, phone: f.phone.value, car: f.car.value, question: f.question.value, website: f.website.value, lang: state.lang });
      if (r.signedIn) { f.reset(); await boot(r.thread && r.thread.id); say(S('asked_in')(SITE), true); }
      else { f.question.value = ''; say(S('asked_known'), true); }
    } catch (err) { say(err.message); if (err.data && err.data.field && f[err.data.field]) f[err.data.field].focus(); }
    busy(btn, false);
  });

  $('#loginform').addEventListener('submit', async function (e) {
    e.preventDefault();
    var f = e.target, btn = $('#loginbtn');
    busy(btn, true, S('signing')); say('');
    try { await api('POST', '/api/account/password', { email: f.email.value, password: f.password.value, lang: state.lang }); f.password.value = ''; await boot(); }
    catch (err) { say(err.message); f.password.select(); }
    busy(btn, false);
  });
  $('#linktoggle').addEventListener('click', function () {
    var drop = $('#linkdrop'), open = drop.hidden;
    drop.hidden = !open; this.setAttribute('aria-expanded', String(open));
    if (!open) return;
    var lf = $('#linkform'), typed = $('#loginform').email.value || $('#askform').email.value;
    if (typed && !lf.email.value) lf.email.value = typed;
    lf.email.focus();
  });
  $('#linkform').addEventListener('submit', async function (e) {
    e.preventDefault();
    var f = e.target, btn = $('#linkbtn');
    busy(btn, true); say('');
    var hash = (location.hash || '').replace(/^#/, '');
    try { await api('POST', '/api/account/request', { email: f.email.value, lang: state.lang, hash: /^t\//.test(hash) ? hash : '' }); say(S('link_sent'), true); }
    catch (err) { say(err.message); }
    busy(btn, false);
  });
  $$('[data-pwshow]').forEach(function (b) { b.addEventListener('click', function () {
    var inp = b.parentNode.querySelector('input'), on = inp.type === 'password';
    inp.type = on ? 'text' : 'password'; b.textContent = on ? S('hide') : S('show'); b.setAttribute('aria-pressed', String(on));
  }); });

  // ----------------------------------------------------------- signed in --
  function renderList() {
    var c = state.customer, ul = $('#threads');
    $('#hello').textContent = S('hello')(c.name);
    ul.innerHTML = '';
    if (!state.threads.length) { ul.appendChild(li('empty', [d.createTextNode(S('none'))])); return; }
    state.threads.forEach(function (t) {
      var b = el('button'); b.type = 'button';
      b.appendChild(el('span', 'dot'));
      b.appendChild(el('strong', '', t.subject || '…'));
      var tm = el('time', '', when(t.lastMessageAt)); tm.dateTime = t.lastMessageAt; b.appendChild(tm);
      b.appendChild(el('small', '', (t.lastAuthor === 'owner' ? S('answered') : S('waiting')) + (t.status === 'closed' ? ' · ' + S('closed') : '') + (t.car ? ' · ' + t.car : '')));
      b.addEventListener('click', function () { location.hash = 't/' + t.id; });
      ul.appendChild(li(t.unread ? 'is-unread' : '', [b]));
    });
  }
  function renderAcct() {
    var c = state.customer, f = $('#pwform');
    f.username.value = c.email;
    if (!c.verified) { $('#acctstatus').textContent = S('pw_verify'); f.hidden = true; return; }
    $('#acctstatus').textContent = c.hasPassword ? S('pw_set')('') : S('pw_none');
    f.hidden = false;
    $('#pwcurrent').hidden = !(c.hasPassword && !c.fresh);
  }
  function renderChat() {
    var t = state.open, ol = $('#chat');
    $('#subject').textContent = t.subject;
    $('#threadmeta').textContent = S('thread_meta')(when(t.createdAt, true), t.car);
    var atBottom = ol.scrollHeight - ol.scrollTop - ol.clientHeight < 40;
    ol.innerHTML = '';
    state.messages.forEach(function (m) {
      var mine = m.author === 'customer';
      var item = li(mine ? 'me' : 'them', [d.createTextNode(m.body), el('span', 'meta', (mine ? S('you') : SITE) + ' · ' + when(m.createdAt))]);
      ol.appendChild(item);
    });
    if (atBottom || !ol.dataset.seen) { ol.scrollTop = ol.scrollHeight; ol.dataset.seen = '1'; }
  }
  async function loadMe() {
    var r = await api('GET', '/api/account/me');
    state.customer = r.customer; state.threads = r.threads;
    if (r.site) SITE = r.site;
  }
  async function openThread(id, quiet) {
    try {
      var r = await api('GET', '/api/account/threads/' + id);
      var fresh = !state.open || state.open.id !== id;
      state.open = r.thread; state.messages = r.messages;
      if (fresh) $('#chat').dataset.seen = '';
      $('#list').hidden = true; $('#thread').hidden = false;
      renderChat();
      if (fresh && !quiet) { window.scrollTo(0, 0); }
    } catch (err) {
      if (err.status === 401) return boot();
      if (!quiet) { say(err.message); location.hash = ''; }
    }
  }
  function closeThread() {
    state.open = null; state.messages = [];
    $('#thread').hidden = true; $('#list').hidden = false;
    renderList();
  }
  function route() {
    if (!state.customer) return;
    var m = (location.hash || '').match(/^#t\/([0-9a-f-]{36})$/);
    if (m) openThread(m[1]); else closeThread();
  }
  window.addEventListener('hashchange', route);
  $('#back').addEventListener('click', function () { location.hash = ''; });

  $('#newbtn').addEventListener('click', function () {
    var f = $('#newform'), open = f.hidden;
    f.hidden = !open; this.setAttribute('aria-expanded', String(open));
    if (open) f.question.focus();
  });
  $('#newform').addEventListener('submit', async function (e) {
    e.preventDefault();
    var f = e.target, btn = $('button[type=submit]', f);
    if (!f.question.checkValidity()) { f.question.reportValidity(); return; }
    busy(btn, true); say('');
    try {
      var r = await api('POST', '/api/account/threads', { question: f.question.value, car: f.car.value });
      f.reset(); f.hidden = true; $('#newbtn').setAttribute('aria-expanded', 'false');
      await loadMe(); location.hash = 't/' + r.thread.id;
    } catch (err) { say(err.message); }
    busy(btn, false);
  });
  $('#replyform').addEventListener('submit', async function (e) {
    e.preventDefault();
    var f = e.target, btn = $('#replybtn'), text = f.body.value.trim();
    if (!text || !state.open) return;
    busy(btn, true); say('');
    try {
      var r = await api('POST', '/api/account/threads/' + state.open.id, { body: text });
      f.body.value = '';
      state.messages.push(r.message); $('#chat').dataset.seen = ''; renderChat();
    } catch (err) { say(err.message); if (err.status === 401) boot(); }
    busy(btn, false);
  });
  // Enter sends on a computer; Shift+Enter is a new line. A phone keeps Enter for new lines.
  $('#replybody').addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey && !('ontouchstart' in window)) { e.preventDefault(); $('#replyform').requestSubmit(); }
  });
  $('#pwform').addEventListener('submit', async function (e) {
    e.preventDefault();
    var f = e.target, btn = $('button[type=submit]', f);
    busy(btn, true); say('');
    try {
      var r = await api('POST', '/api/account/set-password', { password: f.password.value, current: f.current.value });
      state.customer = Object.assign({}, state.customer, r.customer, { fresh: true });
      f.password.value = ''; f.current.value = ''; renderAcct(); say(S('pw_saved'), true);
    } catch (err) {
      say(err.message);
      if (err.data && err.data.needCurrent) { $('#pwcurrent').hidden = false; f.current.focus(); }
    }
    busy(btn, false);
  });
  $('#logout').addEventListener('click', async function () {
    try { await api('POST', '/api/account/logout', {}); } catch (_) {}
    state.customer = null; state.open = null; location.hash = ''; show('out'); say('');
  });

  // While the page is visible, new answers show up on their own.
  async function poll() {
    if (d.hidden || !state.customer) return;
    try {
      if (state.open) await openThread(state.open.id, true);
      else { await loadMe(); renderList(); }
    } catch (_) {}
  }
  function startPolling() { clearInterval(state.timer); state.timer = setInterval(poll, POLL_MS); }
  d.addEventListener('visibilitychange', function () { if (!d.hidden) poll(); });

  // ---------------------------------------------------------------- boot --
  async function boot(openId) {
    try { await loadMe(); }
    catch (_) { state.customer = null; show('out'); return; }
    show('in'); renderList(); renderAcct(); startPolling();
    if (openId) { if (location.hash !== '#t/' + openId) location.hash = 't/' + openId; else route(); }
    else route();
  }
  async function start() {
    var lang = storedLang() || ((navigator.language || '').slice(0, 2) === 'es' ? 'es' : 'en');
    setLang(lang);
    var params = new URLSearchParams(location.search), token = params.get('t');
    if (token) {
      history.replaceState(null, '', '/account/' + location.hash);
      say(S('opening'), true);
      try { await api('POST', '/api/account/verify', { token: token, lang: state.lang }); say(''); }
      catch (err) { say(err.message); }
    }
    await boot();
  }
  start();
})();
