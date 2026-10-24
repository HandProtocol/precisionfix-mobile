/* Booking funnel widget. Progressive: the server-rendered form works with
   a date input + a time dropdown; this turns it into a rail of steps beside
   one panel (day and time → your details → sent → your car), a month
   calendar and time pills fed by /api/booking/days, a JSON submit, and the
   optional car / what-you-noticed posts onto the request by its token.
   Bilingual through <html lang> (the site's EN / ES switch sets it). No deps. */
(function () {
  'use strict';

  /* ---- month helpers: pure, also read by the engine tests (window.HandBookingCal) ---- */
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function ymd(y, m, day) { return y + '-' + pad(m) + '-' + pad(day); }
  function shiftMonth(ym, n) {
    var y = Number(ym.slice(0, 4)), m = Number(ym.slice(5, 7)) - 1 + n;
    var dt = new Date(Date.UTC(y, m, 1));
    return dt.getUTCFullYear() + '-' + pad(dt.getUTCMonth() + 1);
  }
  function addDays(date, n) {
    var dt = new Date(Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8)) + n));
    return dt.toISOString().slice(0, 10);
  }
  function lastOfMonth(ym) { var y = Number(ym.slice(0, 4)), m = Number(ym.slice(5, 7)); return ymd(y, m, new Date(Date.UTC(y, m, 0)).getUTCDate()); }
  // The month of the first open day (days come sorted, open days only), else `fallback`.
  function firstOpenMonth(days, fallback) {
    for (var i = 0; i < (days || []).length; i++) if (days[i] && days[i].date) return days[i].date.slice(0, 7);
    return fallback;
  }
  // The months, from today's on, that a call answered through `fetchedEnd` covers whole
  // (up to the horizon `last`); a month cut off by the server's range cap is left out.
  function coveredMonths(today, last, fetchedEnd) {
    var out = [];
    for (var ym = today.slice(0, 7); ym <= last.slice(0, 7); ym = shiftMonth(ym, 1)) {
      var need = lastOfMonth(ym) < last ? lastOfMonth(ym) : last;
      if (need > fetchedEnd) break;
      out.push(ym);
    }
    return out;
  }
  // A loaded month with no open day: { key, next } for "Nothing open in <month>" (+ "See <next>").
  function emptyNote(open, view, canNext) {
    if (!open) return null;
    for (var k in open) if (k.slice(0, 7) === view && open[k] && open[k].length) return null;
    return { key: canNext ? 'none_month' : 'none_left', next: canNext ? shiftMonth(view, 1) : '' };
  }
  function fill(tpl, month) { return String(tpl || '').replace('{month}', month); }
  // Where the rail stands: 0 day and time, 1 details, 2 sent, 3 the car, 4 all done.
  function railPlace(step, shared) { return step === 'sent' ? (shared === 'done' ? 4 : 3) : step === 'details' ? 1 : 0; }
  // A saved draft or sent request is worth restoring while it is younger than `maxAge`.
  function isFresh(saved, now, maxAge) { return !!(saved && saved.ts && now - saved.ts >= 0 && now - saved.ts < maxAge); }
  window.HandBookingCal = { firstOpenMonth: firstOpenMonth, coveredMonths: coveredMonths, emptyNote: emptyNote, fill: fill, shiftMonth: shiftMonth, railPlace: railPlace, isFresh: isFresh };

  /* ---- memory across a refresh: the draft (a day) and the sent request (a week) ---- */
  var DRAFT_KEY = 'hand-booking-draft', SENT_KEY = 'hand-booking-sent', DAY = 86400000;
  function readStore(key) { try { return JSON.parse(window.localStorage.getItem(key) || 'null'); } catch (_) { return null; }
  }
  function writeStore(key, value) { try { if (value) window.localStorage.setItem(key, JSON.stringify(value)); else window.localStorage.removeItem(key); } catch (_) {} }

  var MAX_RANGE_DAYS = 62; // the days API answers at most this many days per call
  var d = document, root = d.documentElement;
  var form = d.querySelector('[data-booking]');
  if (!form || !window.fetch) return;
  var cfg = {};
  try { cfg = JSON.parse((d.getElementById('booking-config') || {}).textContent || '{}'); } catch (_) { return; }
  var $ = function (s, r) { return (r || form).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || form).querySelectorAll(s)); };
  var dateInput = $('[name=date]'), slotInput = $('[name=slot]'), cal = $('[data-booking-cal]'), times = $('[data-booking-times]'), hint = $('[data-booking-hint]');
  var status = $('.form__status'), done = $('.form__done'), submitBtn = $('.form__submit');
  var rail = $('[data-booking-rail]'), panel = $('[data-booking-panel]');
  var carStep = $('[data-step=car]'), issuesStep = $('[data-step=issues]'), shareStatus = $('[data-booking-share-status]'), thanks = $('[data-booking-thanks]');
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var months = {}, pending = {};
  var view = cfg.today.slice(0, 7), selected = '', selectedSlot = '', selectedLabel = '';
  // the funnel: which view is up, what is done, the request's token once sent
  var state = { step: 'time', name: '', shared: null, token: '' }, lastStep = null;

  function lang() { return root.lang === 'es' ? 'es' : 'en'; }
  function str(k) { return (cfg.strings[lang()] || cfg.strings.en)[k] || ''; }
  function locale() { return lang() === 'es' ? 'es-MX' : 'en-US'; }
  function monthName(ym) { return new Intl.DateTimeFormat(locale(), { month: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)) - 1, 1))); }
  function dayShort(date) { return new Intl.DateTimeFormat(locale(), { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' }).format(new Date(date + 'T12:00:00Z')); }
  function el(tag, attrs, kids) {
    var n = d.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === 'class') n.className = attrs[k];
      else if (k === 'text') n.textContent = attrs[k];
      else if (k.slice(0, 2) === 'on') n.addEventListener(k.slice(2), attrs[k]);
      else if (attrs[k] === true) n.setAttribute(k, '');
      else if (attrs[k] != null && attrs[k] !== false) n.setAttribute(k, attrs[k]);
    });
    (kids || []).forEach(function (c) { if (c != null) n.appendChild(typeof c === 'string' ? d.createTextNode(c) : c); });
    return n;
  }
  function scrollTo(node) { if (!node) return; try { node.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' }); } catch (_) {} }

  /* hide the fallbacks, show the widgets */
  $$('.booking__fallback').forEach(function (f) { f.hidden = true; });
  dateInput.required = false; slotInput.required = false;
  cal.hidden = false; times.hidden = false;
  form.classList.add('is-funnel'); rail.hidden = false;
  $$('[data-booking-back]').forEach(function (b) { b.hidden = false; });

  /* ---- the rail and the panel ---- */
  function timeLabel() {
    var list = selected && months[selected.slice(0, 7)] ? months[selected.slice(0, 7)][selected] || [] : [];
    var t = list.filter(function (x) { return x.id === selectedSlot; })[0];
    return t ? (lang() === 'es' && t.label_es) || t.label : selectedLabel;
  }
  function renderRail() {
    var p = railPlace(state.step, state.shared), names = str('rail') || [];
    var subs = [selectedSlot ? dayShort(selected) + ' · ' + timeLabel() : '', state.step === 'sent' ? state.name : '', '', state.shared === 'done' ? state.car || '' : ''];
    rail.innerHTML = '';
    names.forEach(function (name, i) {
      var st = i < p ? 'done' : i === p ? 'current' : 'next';
      var inner = [el('span', { class: 'booking__dot', 'aria-hidden': 'true', text: st === 'done' ? '✓' : String(i + 1) }), el('span', { class: 'text' }, [el('span', { class: 'name', text: name }), subs[i] ? el('span', { class: 'sub', text: subs[i] }) : null])];
      var canBack = st === 'done' && i === 0 && state.step === 'details';
      var li = el('li', { class: 'is-' + st, 'aria-current': st === 'current' ? 'step' : null }, [canBack ? el('button', { type: 'button', 'aria-label': str('change') + ': ' + name, onclick: function () { goBack(); } }, inner) : el('span', { class: 'booking__railitem' }, inner)]);
      rail.appendChild(li);
    });
  }
  // One view at a time; only a new step slides in (a repaint stays still).
  function show(step) {
    state.step = step;
    $$('[data-view]').forEach(function (n) { n.hidden = n.getAttribute('data-view') !== step; });
    renderRail();
    if (lastStep !== null && lastStep !== step) {
      panel.classList.remove('is-enter');
      if (!reduce) { void panel.offsetWidth; panel.classList.add('is-enter'); }
      scrollTo(form); panel.focus({ preventScroll: true });
    }
    lastStep = step;
  }

  /* ---- going back: the Back buttons, the rail's Change, and the browser's
     (or phone's) back button all step back one view: details → day and time,
     what they noticed → which car. Each forward step pushes one history entry;
     one that is no longer needed (the request went, the notice was sent) is
     popped quietly so Back then leaves the form as usual. ---- */
  var pushed = { details: false, issues: false }, quietPops = 0;
  function push(tag) { if (pushed[tag]) return; try { window.history.pushState({ handBooking: tag }, ''); pushed[tag] = true; } catch (_) {} }
  function drop(tag) { if (!pushed[tag]) return; pushed[tag] = false; quietPops++; try { window.history.back(); } catch (_) { quietPops--; } }
  function stepBack() {
    if (state.step === 'details') { pushed.details = false; show('time'); scrollTo($('[data-step=time]')); return true; }
    if (state.step === 'sent' && issuesStep && !issuesStep.hidden) { pushed.issues = false; issuesStep.hidden = true; if (thanks) thanks.hidden = true; if (carStep) carStep.hidden = false; scrollTo(carStep); return true; }
    return false;
  }
  function goBack() {
    var tag = state.step === 'details' ? 'details' : 'issues';
    if (pushed[tag]) { try { window.history.back(); return; } catch (_) {} } // popstate does the step
    stepBack();
  }
  window.addEventListener('popstate', function () { if (quietPops > 0) { quietPops--; return; } stepBack(); });
  form.addEventListener('click', function (e) { if (e.target.closest && e.target.closest('[data-booking-back]')) goBack(); });

  /* ---- month data ---- */
  function monthRange(ym) {
    var y = Number(ym.slice(0, 4)), m = Number(ym.slice(5, 7));
    var last = new Date(Date.UTC(y, m, 0)).getUTCDate();
    return { y: y, m: m, first: ymd(y, m, 1), last: ymd(y, m, last), days: last };
  }
  function load(ym) {
    if (months[ym]) return Promise.resolve(months[ym]);
    if (pending[ym]) return pending[ym];
    var r = monthRange(ym);
    pending[ym] = fetch('/api/booking/days?from=' + r.first + '&to=' + r.last, { credentials: 'same-origin' })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        var map = {};
        (data && data.days || []).forEach(function (day) { map[day.date] = day.times; });
        months[ym] = map; delete pending[ym];
        return map;
      })
      .catch(function () { delete pending[ym]; return {}; });
    return pending[ym];
  }
  // First paint: one call from today to the horizon (capped by the API), then open
  // on the first month that has an open day, not on a dead end-of-month.
  function start() {
    renderCal();
    var from = cfg.today, to = cfg.last;
    fetch('/api/booking/days?from=' + from + '&to=' + to, { credentials: 'same-origin' })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (data && data.today) { cfg.today = data.today; if (data.last) cfg.last = data.last; } // the page itself may be a cached copy
        var days = (data && data.days) || [];
        var end = addDays(cfg.today, MAX_RANGE_DAYS);
        if (end > cfg.last) end = cfg.last;
        coveredMonths(cfg.today, cfg.last, end).forEach(function (ym) { months[ym] = {}; });
        days.forEach(function (day) { var ym = day.date.slice(0, 7); if (months[ym]) months[ym][day.date] = day.times; });
        view = firstOpenMonth(days, cfg.today.slice(0, 7));
        refresh();
        if (state.step !== 'sent') restoreDraft();
      })
      .catch(function () { refresh(); });
  }

  /* ---- calendar ---- */
  function renderCal() {
    var r = monthRange(view), open = months[view] || null;
    cal.innerHTML = '';
    var title = new Intl.DateTimeFormat(locale(), { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(r.y, r.m - 1, 1)));
    var canPrev = view > cfg.today.slice(0, 7), canNext = view < cfg.last.slice(0, 7);
    cal.appendChild(el('div', { class: 'cal__head' }, [
      el('button', { type: 'button', class: 'cal__nav', 'aria-label': str('prev'), disabled: !canPrev, onclick: function () { view = shiftMonth(view, -1); refresh(); } }, ['‹']),
      el('strong', { class: 'cal__title', text: title.charAt(0).toUpperCase() + title.slice(1) }),
      el('button', { type: 'button', class: 'cal__nav', 'aria-label': str('next'), disabled: !canNext, onclick: function () { view = shiftMonth(view, 1); refresh(); } }, ['›']),
    ]));
    var grid = el('div', { class: 'cal__grid', role: 'grid' });
    var wd = new Intl.DateTimeFormat(locale(), { weekday: 'narrow', timeZone: 'UTC' });
    for (var i = 0; i < 7; i++) grid.appendChild(el('span', { class: 'cal__wd', text: wd.format(new Date(Date.UTC(2023, 0, 1 + i))) })); // 2023-01-01 is a Sunday
    var firstDow = new Date(Date.UTC(r.y, r.m - 1, 1)).getUTCDay();
    for (var b = 0; b < firstDow; b++) grid.appendChild(el('span', { class: 'cal__blank' }));
    for (var day = 1; day <= r.days; day++) {
      (function (date) {
        var isOpen = open && open[date] && open[date].length > 0;
        var cls = 'cal__day' + (isOpen ? ' is-open' : '') + (date === selected ? ' is-selected' : '') + (date === cfg.today ? ' is-today' : '') + (!open ? ' is-loading' : '');
        grid.appendChild(el('button', { type: 'button', class: cls, disabled: !isOpen, 'aria-pressed': date === selected ? 'true' : 'false', 'aria-label': new Intl.DateTimeFormat(locale(), { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' }).format(new Date(date + 'T12:00:00Z')), onclick: function () { pick(date); } }, [String(Number(date.slice(8)))]));
      })(ymd(r.y, r.m, day));
    }
    cal.appendChild(grid);
    if (!open) cal.appendChild(el('p', { class: 'booking__hint', text: str('loading') }));
    var note = emptyNote(open, view, canNext);
    if (note) cal.appendChild(el('div', { class: 'booking__empty', role: 'status' }, [
      el('p', { class: 'booking__hint', text: fill(str(note.key), monthName(view)) }),
      note.next ? el('button', { type: 'button', class: 'booking__see', onclick: function () { view = note.next; refresh(); } }, [fill(str('see_month'), monthName(note.next))]) : null,
    ]));
  }
  function refresh() { renderCal(); load(view).then(renderCal); }

  /* ---- times ---- */
  function renderTimes() {
    times.innerHTML = '';
    var list = selected && months[selected.slice(0, 7)] ? months[selected.slice(0, 7)][selected] || [] : [];
    if (!selected) { hint.hidden = false; hint.textContent = str('pick_day'); return; }
    if (!list.length) { hint.hidden = false; hint.textContent = str('none'); return; }
    hint.hidden = true;
    list.forEach(function (t) {
      var label = (lang() === 'es' && t.label_es) || t.label;
      times.appendChild(el('button', { type: 'button', class: 'booking__time' + (t.id === selectedSlot ? ' is-selected' : ''), 'aria-pressed': t.id === selectedSlot ? 'true' : 'false', onclick: function () { pickSlot(t.id, label); } }, [label]));
    });
  }
  function pick(date) {
    selected = date; selectedSlot = ''; selectedLabel = ''; dateInput.value = date; slotInput.value = '';
    renderCal(); renderTimes(); renderRail(); saveDraft();
    scrollTo($('[data-step=time]'));
  }
  // A time picked is the step done: the details slide in.
  function pickSlot(id, label) {
    selectedSlot = id; selectedLabel = label; slotInput.value = id; renderTimes(); saveDraft();
    var service = $('[name=service]');
    if (service && service.type === 'radio' && !$('[name=service]:checked')) { fail(str('choose_service')); scrollTo($('[data-step=service]')); return; }
    show('details'); push('details');
  }

  $$('[data-upper]').forEach(function (i) { i.addEventListener('input', function () { i.value = i.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); }); });

  /* ---- language changes re-render the dynamic parts ---- */
  if (window.MutationObserver) new MutationObserver(function () { renderCal(); renderTimes(); renderRail(); }).observe(root, { attributes: true, attributeFilter: ['lang'] });

  /* ---- the draft: what is typed and picked, saved as it changes ---- */
  var DRAFT_FIELDS = ['name', 'phone', 'email', 'contact_pref', 'address', 'city', 'notes'];
  function fieldValue(k) { var i = $('[name=' + k + ']'); if (!i) return ''; if (i.type === 'radio') { var c = $('[name=' + k + ']:checked'); return c ? c.value : ''; } return i.value; }
  function setField(k, v) { var i = $('[name=' + k + ']'); if (!i || v == null) return; if (i.type === 'radio') { var r = $('[name=' + k + '][value="' + String(v).replace(/"/g, '') + '"]'); if (r) r.checked = true; } else i.value = v; }
  function saveDraft() {
    var fields = {}; DRAFT_FIELDS.forEach(function (k) { fields[k] = fieldValue(k); });
    writeStore(DRAFT_KEY, { date: selected, slot: selectedSlot, label: selectedLabel, fields: fields, ts: Date.now() });
  }
  // After the first days answer: a fresh draft whose day and time are still open comes back on the details step.
  function restoreDraft() {
    var draft = readStore(DRAFT_KEY);
    if (!isFresh(draft, Date.now(), DAY)) { writeStore(DRAFT_KEY, null); return; }
    DRAFT_FIELDS.forEach(function (k) { setField(k, (draft.fields || {})[k]); });
    var ym = (draft.date || '').slice(0, 7), list = draft.date && months[ym] ? months[ym][draft.date] || [] : [];
    var ok = list.filter(function (x) { return x.id === draft.slot; })[0];
    if (!ok) return;
    view = ym; selected = draft.date; selectedSlot = draft.slot; selectedLabel = draft.label || ''; dateInput.value = selected; slotInput.value = selectedSlot;
    renderCal(); renderTimes(); lastStep = null; show('details'); lastStep = 'details';
  }
  form.addEventListener('input', function (e) { if (e.target && DRAFT_FIELDS.indexOf(e.target.name) !== -1) saveDraft(); });
  form.addEventListener('change', function (e) { if (e.target && DRAFT_FIELDS.indexOf(e.target.name) !== -1) saveDraft(); });

  /* ---- the sent request: its token and summary, so a refresh keeps the car and notice steps ---- */
  function paintSent(sent) {
    var sum = $('[data-booking-summary]');
    if (sum && sent.when) sum.textContent = str('asked') + ': ' + (sent.when[lang()] || sent.when.en) + ' · ' + (sent.service || '');
    var manage = $('[data-booking-manage]');
    if (manage && sent.manage_url) manage.href = sent.manage_url; else if (manage) manage.hidden = true;
    var again = $('[data-booking-again]'); if (again) again.hidden = false;
  }
  function restoreSent() {
    var sent = readStore(SENT_KEY);
    if (!isFresh(sent, Date.now(), 7 * DAY) || !sent.token) { writeStore(SENT_KEY, null); return false; }
    state.name = sent.name || ''; state.token = sent.token; state.shared = sent.shared || null; state.car = sent.car || '';
    paintSent(sent);
    restoreCarDraft(sent.draft);
    if (carStep) carStep.hidden = state.shared !== null;
    if (issuesStep) issuesStep.hidden = !(state.shared === 'done' && !sent.issues);
    show('sent'); lastStep = 'sent';
    return true;
  }
  // what is typed into the car and notice steps rides along with the sent request
  var CAR_FIELDS = ['vin', 'car_model', 'issues'];
  function carDraft() {
    var f = {}; CAR_FIELDS.forEach(function (k) { var i = $('[name=' + k + ']'); f[k] = i ? i.value : ''; });
    f.noticed = $$('[name=noticed]:checked').map(function (c) { return c.value; });
    var ack = $('[name=self_report_ack]'); f.ack = !!(ack && ack.checked);
    return f;
  }
  function restoreCarDraft(f) {
    if (!f) return;
    CAR_FIELDS.forEach(function (k) { var i = $('[name=' + k + ']'); if (i && f[k] != null) i.value = f[k]; });
    $$('[name=noticed]').forEach(function (c) { c.checked = (f.noticed || []).indexOf(c.value) !== -1; });
    var ack = $('[name=self_report_ack]'); if (ack) ack.checked = !!f.ack;
  }
  function onCarInput(e) { var n = e.target && e.target.name; if (state.token && (CAR_FIELDS.indexOf(n) !== -1 || n === 'noticed' || n === 'self_report_ack')) updateSent({ draft: carDraft() }); }
  form.addEventListener('input', onCarInput);
  form.addEventListener('change', onCarInput);
  function updateSent(patch) { var sent = readStore(SENT_KEY) || {}; Object.keys(patch).forEach(function (k) { sent[k] = patch[k]; }); writeStore(SENT_KEY, sent); }
  form.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-booking-again]');
    if (!b) return;
    writeStore(SENT_KEY, null); writeStore(DRAFT_KEY, null);
    state = { step: 'time', name: '', shared: null, token: '' }; selected = ''; selectedSlot = ''; selectedLabel = ''; dateInput.value = ''; slotInput.value = '';
    form.reset(); if (carStep) carStep.hidden = true; if (issuesStep) issuesStep.hidden = true; if (thanks) thanks.hidden = true; b.hidden = true;
    renderCal(); renderTimes(); show('time');
  });

  /* ---- submit ---- */
  function fail(msg) { form.classList.remove('is-sending'); status.className = 'form__status is-bad'; status.textContent = msg; submitBtn.disabled = false; }
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var service = $('[name=service]');
    if (service && service.type === 'radio' && !$('[name=service]:checked')) { fail(str('choose_service')); show('time'); return; }
    if (!selected) { fail(str('pick_day')); show('time'); return; }
    if (!selectedSlot) { fail(str('choose_time')); show('time'); return; }
    if (!form.checkValidity()) { form.reportValidity(); return; }
    var phone = $('[name=phone]'), email = $('[name=email]');
    if (!phone.value.trim() && !email.value.trim()) { fail(str('need_contact')); phone.focus(); return; }
    if (phone.value.trim() && phone.value.replace(/\D/g, '').length < 7) { fail(str('bad_phone')); phone.focus(); return; }
    var body = {};
    new FormData(form).forEach(function (v, k) { body[k] = v; });
    ['vin', 'car_model', 'issues', 'self_report_ack'].forEach(function (k) { delete body[k]; }); // those go with the share, after
    body.lang = lang();
    form.classList.add('is-sending'); submitBtn.disabled = true;
    status.className = 'form__status'; status.textContent = str('sending');
    fetch('/api/booking', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(body) })
      .then(function (res) { return res.json().then(function (data) { return { res: res, data: data }; }); })
      .then(function (r) {
        if (!r.res.ok || !r.data || r.data.ok === false) throw new Error((r.data && r.data.error) || str('failed'));
        status.textContent = ''; form.classList.remove('is-sending');
        state.name = $('[name=name]').value.trim();
        var sum = $('[data-booking-summary]');
        if (sum && r.data.when) sum.textContent = str('asked') + ': ' + (r.data.when[lang()] || r.data.when.en) + ' · ' + r.data.service;
        var manage = $('[data-booking-manage]');
        if (manage && r.data.manage_url) manage.href = r.data.manage_url;
        else if (manage) manage.hidden = true;
        var m = /[?&]t=([A-Za-z0-9_-]+)/.exec(r.data.manage_url || '');
        state.token = m ? m[1] : '';
        if (state.token && carStep) carStep.hidden = false;
        writeStore(DRAFT_KEY, null);
        writeStore(SENT_KEY, state.token ? { token: state.token, name: state.name, when: r.data.when || null, service: r.data.service || '', manage_url: r.data.manage_url || '', shared: null, car: '', issues: false, ts: Date.now() } : null);
        var again = $('[data-booking-again]'); if (again) again.hidden = !state.token;
        show('sent'); drop('details'); done.focus();
      })
      .catch(function (err) { fail(err.message || str('failed')); });
  });

  /* ---- after the request: the car, then what they noticed ---- */
  function shareFail(msg) { shareStatus.className = 'form__status booking__share-status is-bad'; shareStatus.textContent = msg; }
  function share(payload, onOk) {
    payload.lang = lang();
    shareStatus.className = 'form__status booking__share-status'; shareStatus.textContent = str('sending');
    fetch('/api/booking/manage?t=' + encodeURIComponent(state.token), { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(payload) })
      .then(function (res) { return res.json().then(function (data) { return { res: res, data: data }; }); })
      .then(function (r) {
        if (!r.res.ok || !r.data || r.data.ok === false) throw new Error((r.data && r.data.error) || str('failed'));
        shareStatus.textContent = ''; onOk(r.data);
      })
      .catch(function (err) { shareFail(err.message || str('failed')); });
  }
  function thank(key) { if (!thanks) return; thanks.textContent = str(key); thanks.hidden = false; }
  form.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-share],[data-skip]');
    if (!b) return;
    var which = b.getAttribute('data-share') || b.getAttribute('data-skip'), skip = b.hasAttribute('data-skip');
    if (which === 'car') {
      var vin = $('[name=vin]').value.trim(), model = $('[name=car_model]').value.trim();
      if (skip || (!vin && !model)) { state.shared = 'skipped'; carStep.hidden = true; updateSent({ shared: 'skipped' }); renderRail(); return; }
      share({ action: 'share', vin: vin, car_model: model }, function (data) {
        state.shared = 'done'; state.car = data.vin || data.car_model || vin || model;
        updateSent({ shared: 'done', car: state.car });
        carStep.hidden = true; if (issuesStep) { issuesStep.hidden = false; push('issues'); } thank('car_thanks'); renderRail();
      });
    }
    if (which === 'issues') {
      var typed = $('[name=issues]').value.trim(), agree = $('[name=self_report_ack]');
      var picked = $$('[name=noticed]:checked').map(function (c) { return c.value; });
      if (skip || (!typed && !picked.length)) { issuesStep.hidden = true; updateSent({ issues: true }); drop('issues'); return; }
      if (!agree.checked) { shareFail(str('needs_agree')); agree.focus(); return; }
      share({ action: 'share', issues: typed, noticed: picked, self_report_ack: true }, function () { issuesStep.hidden = true; updateSent({ issues: true, draft: null }); drop('issues'); thank('issues_thanks'); });
    }
  });

  if (!restoreSent()) show('time');
  start(); renderTimes();
})();
