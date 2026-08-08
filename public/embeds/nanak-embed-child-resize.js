/**
 * Child-side embed resize — included by every Nanak embed HTML.
 * Posts true content height to parent. Measures content root only
 * (never document scrollHeight) to avoid blank-space inflation loops.
 */
(function () {
  if (window.__nanakEmbedChildResize) return;
  window.__nanakEmbedChildResize = true;

  var lastHeight = 0;
  var settleTimers = [];

  if (window.parent && window.parent !== window) {
    document.documentElement.classList.add("framed");
    document.documentElement.style.height = "auto";
    document.documentElement.style.minHeight = "0";
    document.documentElement.style.overflow = "hidden";
    if (document.body) {
      document.body.style.height = "auto";
      document.body.style.minHeight = "0";
      document.body.style.overflow = "hidden";
    } else {
      document.addEventListener("DOMContentLoaded", function () {
        document.body.style.height = "auto";
        document.body.style.minHeight = "0";
        document.body.style.overflow = "hidden";
      });
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
      document.getElementById("root") ||
      document.querySelector("main") ||
      document.querySelector(".wrap") ||
      document.body
    );
  }

  function measure() {
    var el = rootEl();
    if (!el) return 0;
    // Content root only — never documentElement.scrollHeight (inflation loop).
    var h = Math.max(
      el.getBoundingClientRect().height || 0,
      el.offsetHeight || 0,
      el.scrollHeight || 0
    );
    return Math.ceil(h) + 8;
  }

  function applyParent(h) {
    try {
      var frames = window.parent.document.querySelectorAll("iframe");
      frames.forEach(function (frame) {
        try {
          if (frame.contentWindow === window) {
            if (Math.abs((parseFloat(frame.style.height) || 0) - h) < 4) return;
            frame.style.height = h + "px";
            frame.style.width = "100%";
            frame.style.maxWidth = "100%";
            frame.style.minHeight = "0";
            frame.style.overflow = "hidden";
            frame.removeAttribute("height");
            frame.setAttribute("scrolling", "no");
          }
        } catch (_) {}
      });
    } catch (_) {}
  }

  function post() {
    try {
      var h = measure();
      if (!h || h < 40) return;
      if (Math.abs(h - lastHeight) < 4) return;
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

  window.nanakPostEmbedHeight = post;

  function scheduleSettle() {
    settleTimers.forEach(clearTimeout);
    settleTimers = [50, 250, 800, 1600].map(function (ms) {
      return setTimeout(post, ms);
    });
  }

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
  window.addEventListener("resize", post);
  requestAnimationFrame(post);

  if (typeof ResizeObserver !== "undefined") {
    try {
      var ro = new ResizeObserver(function () {
        post();
      });
      var attach = function () {
        var r = rootEl();
        if (r) ro.observe(r);
      };
      if (document.body) attach();
      else document.addEventListener("DOMContentLoaded", attach);
    } catch (_) {}
  }
})();
