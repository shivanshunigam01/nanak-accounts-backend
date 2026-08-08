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
      document.getElementById("nnl") ||
      document.getElementById("bsb") ||
      document.getElementById("npc") ||
      document.getElementById("nbc") ||
      document.getElementById("ntc") ||
      document.getElementById("nbl-root") ||
      document.querySelector(".wrap") ||
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

    var fromKids = 0;
    var kids = el.children;
    for (var i = 0; i < kids.length; i++) {
      var child = kids[i];
      fromKids = Math.max(fromKids, child.offsetTop + child.offsetHeight);
    }

    var h = Math.max(fromKids, el.scrollHeight || 0, el.offsetHeight || 0);
    return Math.min(Math.max(Math.ceil(h) + 24, 80), 10000);
  }

  function post() {
    try {
      applyFramedStyles();
      var h = measure();
      if (!h || h < 40) return;
      if (Math.abs(h - lastHeight) < 4) return;
      lastHeight = h;
      if (window.parent && window.parent !== window) {
        window.parent.postMessage(
          { type: "nanak-embed-resize", height: h, source: "embed-child" },
          "*"
        );
        window.parent.postMessage({ type: "resize-iframe", height: h }, "*");
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
