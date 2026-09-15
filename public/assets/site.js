/* PrecisionFix effects: nav state, mobile menu, EN/ES switch, reveals,
   the booking form (posts to Netlify, shows the thank-you inline), the
   lightbox, and the Diagnostic theme's typed readout. Vanilla, no deps.
   Everything degrades: no JS = the form still posts, the copy is English. */
(function () {
  'use strict';
  var d = document, w = window, body = d.body, root = d.documentElement;
  var reduce = w.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var $ = function (s, r) { return (r || d).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || d).querySelectorAll(s)); };
  var theme = root.getAttribute('data-theme') || '';

  /* ---- language: EN / ES ---- */
  var KEY = 'pf-lang', nodes = $$('[data-es]'), phs = $$('[data-es-ph]');
  function setLang(lang) {
    var es = lang === 'es';
    nodes.forEach(function (n) { if (n.dataset.en == null) n.dataset.en = n.innerHTML; n.innerHTML = es ? n.dataset.es : n.dataset.en; });
    phs.forEach(function (n) { if (n.dataset.enPh == null) n.dataset.enPh = n.getAttribute('placeholder') || ''; n.setAttribute('placeholder', es ? n.dataset.esPh : n.dataset.enPh); });
    root.lang = es ? 'es' : 'en';
    $$('.lang-toggle').forEach(function (b) { b.setAttribute('aria-pressed', es ? 'true' : 'false'); b.setAttribute('aria-label', es ? 'View in English' : 'Ver en español'); });
    $$('[data-lang-field]').forEach(function (f) { f.value = es ? 'es' : 'en'; });
  }
  var stored = null; try { stored = localStorage.getItem(KEY); } catch (_) {}
  var navLang = (navigator.language || '').toLowerCase();
  if (nodes.length) setLang(stored || (navLang.indexOf('es') === 0 ? 'es' : 'en'));
  d.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('.lang-toggle');
    if (!b) return;
    var next = root.lang === 'es' ? 'en' : 'es';
    setLang(next);
    try { localStorage.setItem(KEY, next); } catch (_) {}
  });

  /* ---- scroll: nav + call bar ---- */
  var nav = $('#nav'), callbar = $('#callbar'), hero = $('.hero'), ticking = false;
  function onScroll() {
    if (ticking) return; ticking = true;
    w.requestAnimationFrame(function () {
      var y = w.scrollY || w.pageYOffset;
      if (nav) nav.classList.toggle('is-scrolled', y > 20);
      if (callbar) {
        var bookTop = ($('#book') || {}).offsetTop || 1e9;
        var pastHero = hero ? y > hero.offsetHeight * 0.55 : y > 400;
        callbar.classList.toggle('is-visible', pastHero && y + w.innerHeight < bookTop + 120);
      }
      ticking = false;
    });
  }
  w.addEventListener('scroll', onScroll, { passive: true }); onScroll();

  /* ---- mobile menu ---- */
  var toggle = $('#navtoggle'), menu = $('#menu');
  if (toggle && menu) {
    var setMenu = function (open) { toggle.setAttribute('aria-expanded', open ? 'true' : 'false'); menu.hidden = !open; body.style.overflow = open ? 'hidden' : ''; };
    toggle.addEventListener('click', function () { setMenu(menu.hidden); });
    $$('a', menu).forEach(function (a) { a.addEventListener('click', function () { setMenu(false); }); });
    d.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !menu.hidden) setMenu(false); });
  }

  /* ---- reveal on scroll ---- */
  var reveals = $$('.reveal');
  if ('IntersectionObserver' in w && !reduce) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); } });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.06 });
    reveals.forEach(function (el) { io.observe(el); });
  } else reveals.forEach(function (el) { el.classList.add('in'); });

  /* ---- pointer glow on cards (desktop) ---- */
  if (w.matchMedia('(hover: hover) and (pointer: fine)').matches) {
    d.addEventListener('pointermove', function (e) {
      var el = e.target.closest && e.target.closest('.reason, .cred, .service, .btn--primary, .tile');
      if (!el) return;
      var r = el.getBoundingClientRect();
      el.style.setProperty('--mx', ((e.clientX - r.left) / r.width * 100).toFixed(1) + '%');
      el.style.setProperty('--my', ((e.clientY - r.top) / r.height * 100).toFixed(1) + '%');
    }, { passive: true });
  }

  /* ---- Diagnostic theme: the readout types itself ---- */
  var readout = $('.decor--readout');
  if (readout && theme === 'terminal' && !reduce) {
    var dds = $$('dd', readout).filter(function (x) { return !x.querySelector('i'); });
    var texts = dds.map(function (x) { var t = x.textContent; x.textContent = ''; return t; });
    var li = 0, ci = 0;
    (function type() {
      if (li >= dds.length) return;
      dds[li].textContent = texts[li].slice(0, ++ci);
      if (ci >= texts[li].length) { li++; ci = 0; setTimeout(type, 260); } else setTimeout(type, 22 + Math.random() * 30);
    })();
  }

  /* ---- booking form → Netlify, thank-you inline ---- */
  var form = $('#bookform');
  if (form) {
    var status = $('.form__status', form), done = $('.form__done', form);
    var vin = form.querySelector('[name=vin]');
    if (vin) vin.addEventListener('input', function () { vin.value = vin.value.toUpperCase().replace(/[^A-HJ-NPR-Z0-9]/g, ''); });
    form.addEventListener('submit', function (e) {
      if (!w.fetch || !w.URLSearchParams) return; // native post to Netlify's thank-you page
      e.preventDefault();
      if (!form.checkValidity()) { form.reportValidity(); return; }
      var es = root.lang === 'es';
      form.classList.add('is-sending');
      status.className = 'form__status'; status.textContent = es ? 'Enviando…' : 'Sending…';
      var data = new FormData(form);
      fetch(form.getAttribute('action') || '/', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(data).toString() })
        .then(function (res) { if (!res.ok) throw new Error('status ' + res.status); })
        .then(function () {
          status.textContent = '';
          $$('.form__group, .form__actions', form).forEach(function (el) { el.hidden = true; });
          done.hidden = false; done.focus();
          try { done.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' }); } catch (_) {}
        })
        .catch(function () {
          form.classList.remove('is-sending');
          status.className = 'form__status is-bad';
          status.textContent = es ? 'No se pudo enviar. Llámame o mándame un texto y lo arreglamos.' : 'That did not send. Call or text me and we will sort it out.';
        });
    });
  }

  /* ---- lightbox ---- */
  var lb = $('#lightbox'), items = [];
  try { items = JSON.parse(($('#site-media') || {}).textContent || '[]'); } catch (_) { items = []; }
  if (lb && items.length) {
    var img = $('#lbimg'), cap = $('#lbcap'), count = $('#lbcount'), bg = $('#lbbg'), idx = 0, lastFocus = null;
    function show(i) {
      idx = (i + items.length) % items.length;
      var it = items[idx];
      img.src = it.src; img.alt = it.alt || '';
      cap.textContent = [it.alt, it.caption].filter(Boolean).join(' — ');
      count.textContent = (idx + 1) + ' / ' + items.length;
      bg.style.backgroundImage = 'url("' + it.src.replace(/"/g, '%22') + '")';
      var nxt = items[(idx + 1) % items.length]; if (nxt) { var pre = new Image(); pre.src = nxt.src; }
    }
    function open(i) { lastFocus = d.activeElement; lb.hidden = false; body.style.overflow = 'hidden'; show(i); $('#lbclose').focus(); }
    function close() { lb.hidden = true; body.style.overflow = ''; if (lastFocus) lastFocus.focus(); }
    d.addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('[data-lightbox]');
      if (b) { open(parseInt(b.getAttribute('data-lightbox'), 10)); return; }
      if (e.target === lb || e.target.classList.contains('lightbox__bg')) close();
    });
    $('#lbclose').addEventListener('click', close);
    $('#lbprev').addEventListener('click', function () { show(idx - 1); });
    $('#lbnext').addEventListener('click', function () { show(idx + 1); });
    d.addEventListener('keydown', function (e) {
      if (lb.hidden) return;
      if (e.key === 'Escape') close(); else if (e.key === 'ArrowLeft') show(idx - 1); else if (e.key === 'ArrowRight') show(idx + 1);
    });
    var tx = null;
    lb.addEventListener('touchstart', function (e) { tx = e.touches[0].clientX; }, { passive: true });
    lb.addEventListener('touchend', function (e) { if (tx === null) return; var dx = e.changedTouches[0].clientX - tx; tx = null; if (Math.abs(dx) > 50) show(dx < 0 ? idx + 1 : idx - 1); });
  }
})();
