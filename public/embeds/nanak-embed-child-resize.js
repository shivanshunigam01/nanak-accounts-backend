/**
 * Child embed resize — post full content height to WordPress parent.
 * No growth caps that left pricing cards half-visible.
 */
(function () {
  if (window.__nanakEmbedChildResize) return;
  window.__nanakEmbedChildResize = true;

  var lastHeight = 0;
  var debounceTimer = 0;
  var settleTimers = [];

  function applyFramedStyles() {
    if (!(window.parent && window.parent !== window)) return;
    var html = document.documentElement;
    var body = document.body;
    html.classList.add("framed");
    html.style.setProperty("height", "auto", "important");
    html.style.setProperty("min-height", "0", "important");
    html.style.setProperty("max-height", "none", "important");
    html.style.setProperty("overflow", "hidden", "important");
    html.style.setProperty("width", "100%", "important");
    if (body) {
      body.classList.add("framed");
      body.style.setProperty("height", "auto", "important");
      body.style.setProperty("min-height", "0", "important");
      body.style.setProperty("max-height", "none", "important");
      body.style.setProperty("overflow", "hidden", "important");
      body.style.setProperty("width", "100%", "important");
    }
  }

  function rootEl() {
    var id = document.body && document.body.getAttribute("data-embed-root");
    if (id) {
      var el = document.getElementById(id);
      if (el) return el;
    }
    return (
      document.getElementById("pay-embed") ||
      document.getElementById("nnl") ||
      document.getElementById("cu") ||
      document.getElementById("bsb") ||
      document.getElementById("npc") ||
      document.getElementById("nbc") ||
      document.getElementById("ntc") ||
      document.getElementById("nbl-root") ||
      document.querySelector("main") ||
      document.body
    );
  }

  function measure() {
    var el = rootEl();
    if (!el) return 0;
    el.style.setProperty("height", "auto", "important");
    el.style.setProperty("min-height", "0", "important");
    el.style.setProperty("max-height", "none", "important");

    // Compact footer widgets (newsletter, tax-check) — hug content, no extra blank gap.
    var compact =
      el.id === "nnl" ||
      el.id === "ntc" ||
      el.id === "bsb" ||
      el.id === "cu" ||
      (el.getAttribute && el.getAttribute("data-embed-tight") === "1");

    if (compact) {
      var r = el.getBoundingClientRect();
      var tight = Math.max(r.height || 0, el.offsetHeight || 0, el.scrollHeight || 0);
      var pad = el.id === "cu" || el.id === "bsb" ? 8 : 2;
      return Math.min(Math.max(Math.ceil(tight) + pad, 40), 10000);
    }

    var fromKids = 0;
    var kids = el.children;
    for (var i = 0; i < kids.length; i++) {
      var child = kids[i];
      if (!child || child.tagName === "SCRIPT" || child.tagName === "STYLE") continue;
      fromKids = Math.max(fromKids, (child.offsetTop || 0) + (child.offsetHeight || 0));
    }

    var h = Math.max(fromKids, el.scrollHeight || 0, el.offsetHeight || 0);
    return Math.min(Math.max(Math.ceil(h) + 24, 80), 10000);
  }

  function post() {
    try {
      applyFramedStyles();
      var el = rootEl();
      var h = measure();
      if (!h || h < 40) return;
      if (Math.abs(h - lastHeight) < 4) return;
      lastHeight = h;
      if (window.parent && window.parent !== window) {
        var compact =
          el &&
          (el.id === "nnl" ||
            el.id === "ntc" ||
            el.id === "bsb" ||
            (el.getAttribute && el.getAttribute("data-embed-tight") === "1"));
        var payload = {
          type: "nanak-embed-resize",
          height: h,
          source: "embed-child",
        };
        if (compact) {
          payload.compact = true;
          payload.maxHeight =
            el.id === "bsb" ? 720 : el.id === "cu" ? 900 : 260;
          if (h > payload.maxHeight) {
            h = payload.maxHeight;
            payload.height = h;
            lastHeight = h;
          }
        }
        window.parent.postMessage(payload, "*");
        // Avoid generic resize-iframe for compact widgets — other page scripts
        // may apply that height to EVERY iframe on multi-embed pages.
        if (!compact) {
          window.parent.postMessage({ type: "resize-iframe", height: h }, "*");
        }
      }
    } catch (_) {}
  }

  function schedulePost() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(post, 100);
  }

  window.nanakPostEmbedHeight = post;

  function scheduleSettle() {
    settleTimers.forEach(clearTimeout);
    settleTimers = [80, 300, 700, 1200, 2000, 3500, 5000].map(function (ms) {
      return setTimeout(post, ms);
    });
  }

  applyFramedStyles();
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      post();
      scheduleSettle();
    });
  } else {
    post();
    scheduleSettle();
  }
  window.addEventListener("load", function () {
    post();
    scheduleSettle();
  });
  requestAnimationFrame(post);

  if (typeof ResizeObserver !== "undefined") {
    try {
      var ro = new ResizeObserver(schedulePost);
      var attach = function () {
        var r = rootEl();
        if (r) ro.observe(r);
      };
      if (document.body) attach();
      else document.addEventListener("DOMContentLoaded", attach);
    } catch (_) {}
  }
})();
