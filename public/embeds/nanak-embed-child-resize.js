/**
 * Child-side embed resize — same behaviour as working pay-calculator iframe:
 * size once to full content, no blank-space inflation, no internal scroll.
 */
(function () {
  if (window.__nanakEmbedChildResize) return;
  window.__nanakEmbedChildResize = true;

  var lastHeight = 0;
  var stableHits = 0;
  var stopped = false;
  var settleTimers = [];
  var ro = null;
  var debounceTimer = 0;

  function applyFramedStyles() {
    if (!(window.parent && window.parent !== window)) return;
    document.documentElement.classList.add("framed");
    document.documentElement.style.height = "auto";
    document.documentElement.style.minHeight = "0";
    document.documentElement.style.maxHeight = "none";
    document.documentElement.style.width = "100%";
    document.documentElement.style.overflow = "hidden";
    if (document.body) {
      document.body.classList.add("framed");
      document.body.style.height = "auto";
      document.body.style.minHeight = "0";
      document.body.style.maxHeight = "none";
      document.body.style.width = "100%";
      document.body.style.overflow = "hidden";
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
    el.style.height = "auto";
    el.style.minHeight = "0";
    el.style.maxHeight = "none";
    // Content only — never document/body scrollHeight (blank growth).
    var h = Math.max(
      el.scrollHeight || 0,
      el.offsetHeight || 0,
      Math.ceil(el.getBoundingClientRect().height || 0)
    );
    return Math.max(Math.ceil(h) + 20, 80);
  }

  function applyParent(h) {
    try {
      window.parent.document.querySelectorAll("iframe").forEach(function (frame) {
        try {
          if (frame.contentWindow !== window) return;
          var prev = parseFloat(frame.style.height) || 0;
          if (Math.abs(prev - h) < 3) return;
          frame.style.height = h + "px";
          frame.style.width = "100%";
          frame.style.maxWidth = "100%";
          frame.style.minHeight = "0";
          frame.style.overflow = "hidden";
          frame.removeAttribute("height");
          frame.setAttribute("scrolling", "no");
          frame.dataset.nanakSized = "1";
        } catch (_) {}
      });
    } catch (_) {}
  }

  function post() {
    if (stopped) return;
    try {
      applyFramedStyles();
      var h = measure();
      if (!h || h < 40) return;
      if (lastHeight > 150 && h > lastHeight + 1800) return;
      if (lastHeight > 150 && h > lastHeight * 2.5) return;

      if (Math.abs(h - lastHeight) < 3) {
        stableHits += 1;
        if (stableHits >= 4) {
          stopped = true;
          settleTimers.forEach(clearTimeout);
          if (ro) try { ro.disconnect(); } catch (_) {}
          clearTimeout(debounceTimer);
        }
        return;
      }

      stableHits = 0;
      lastHeight = h;
      applyParent(h);
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
    if (stopped) return;
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(post, 120);
  }

  window.nanakPostEmbedHeight = function () {
    stopped = false;
    stableHits = 0;
    post();
  };

  function scheduleSettle() {
    settleTimers.forEach(clearTimeout);
    settleTimers = [80, 300, 800, 1500, 2500].map(function (ms) {
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
      ro = new ResizeObserver(schedulePost);
      var attach = function () {
        var r = rootEl();
        if (r) ro.observe(r);
      };
      if (document.body) attach();
      else document.addEventListener("DOMContentLoaded", attach);
    } catch (_) {}
  }
})();
