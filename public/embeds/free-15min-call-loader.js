/**
 * Nanak Free 15-min Call popup loader
 *
 * Install on the public site (once, before </body>):
 *   <script src="https://YOUR-API-HOST/embeds/free-15min-call-loader.js" defer></script>
 *
 * After 20s, injects a fullscreen iframe overlay pointing at free-15min-call.html.
 * Listens for postMessage { type: 'npc-close' | 'npc-captured', source: 'nanak-free-15min' }.
 */
(function () {
  if (window.__nanakNpcLoader) return;
  window.__nanakNpcLoader = true;

  var KEY = 'npc_seen';
  var DELAY_MS = 20000;
  var DISMISS_DAYS = 14;
  var OVERLAY_ID = 'nanak-npc-overlay';

  function scriptOrigin() {
    var scripts = document.getElementsByTagName('script');
    for (var i = scripts.length - 1; i >= 0; i--) {
      var src = scripts[i].src || '';
      if (src.indexOf('free-15min-call-loader') !== -1) {
        try {
          return new URL(src).origin;
        } catch (e) {}
      }
    }
    return '';
  }

  var BASE = scriptOrigin();
  if (!BASE) return;

  function shouldSkip() {
    try {
      var seen = localStorage.getItem(KEY);
      if (seen === 'captured') return true;
      if (seen && Date.now() - Number(seen) < DISMISS_DAYS * 24 * 3600 * 1000) return true;
    } catch (e) {}
    return false;
  }

  var booked = false;

  function markSeen(captured) {
    try {
      localStorage.setItem(KEY, captured ? 'captured' : String(Date.now()));
    } catch (e) {}
  }

  function tearDown(captured) {
    var el = document.getElementById(OVERLAY_ID);
    if (el && el.parentNode) el.parentNode.removeChild(el);
    document.documentElement.style.overflow = '';
    document.body.style.overflow = '';
    markSeen(captured || booked);
  }

  function openPopup() {
    if (document.getElementById(OVERLAY_ID)) return;

    var wrap = document.createElement('div');
    wrap.id = OVERLAY_ID;
    wrap.setAttribute('role', 'presentation');
    wrap.style.cssText =
      'position:fixed;inset:0;z-index:2147483000;margin:0;padding:0;border:0;' +
      'width:100%;height:100%;background:transparent;';

    var iframe = document.createElement('iframe');
    /* overlay=1 keeps the dimmed backdrop inside the embed (host has no modal chrome) */
    iframe.src = BASE + '/embeds/free-15min-call.html?overlay=1';
    iframe.title = 'Free 15 minute call with an accountant';
    iframe.setAttribute('allow', 'clipboard-write');
    iframe.style.cssText =
      'position:absolute;inset:0;width:100%;height:100%;border:0;background:transparent;';

    wrap.appendChild(iframe);
    document.body.appendChild(wrap);
    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
  }

  window.addEventListener('message', function (ev) {
    var data = ev && ev.data;
    if (!data || data.source !== 'nanak-free-15min') return;
    if (BASE && ev.origin && ev.origin !== BASE) return;

    if (data.type === 'npc-captured') {
      booked = true;
      markSeen(true);
      /* embed already delays ~2.8s so visitor sees success, then we remove */
      tearDown(true);
    } else if (data.type === 'npc-close') {
      tearDown(booked);
    }
  });

  function start() {
    if (shouldSkip()) return;
    setTimeout(function () {
      if (shouldSkip()) return;
      if (document.getElementById(OVERLAY_ID)) return;
      openPopup();
    }, DELAY_MS);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
