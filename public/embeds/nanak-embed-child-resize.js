/**
 * Child-side embed resize — posts FULL content height to WordPress parent.
 * Uses 1px scrollHeight trick so short iframes don't report half-height.
 */
(function () {
  if (window.__nanakEmbedChildResize) return;
  window.__nanakEmbedChildResize = true;

  var lastHeight = 0;
  var settleTimers = [];

  function applyFramedStyles() {
    if (!(window.parent && window.parent !== window)) return;
    document.documentElement.classList.add("framed");
    document.documentElement.style.width = "100%";
    document.documentElement.style.overflow = "visible";
    document.documentElement.style.maxHeight = "none";
    if (document.body) {
      document.body.classList.add("framed");
      document.body.style.width = "100%";
      document.body.style.overflow = "visible";
      document.body.style.maxHeight = "none";
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
      document.getElementById("root") ||
      document.querySelector("main") ||
      document.querySelector(".wrap") ||
      document.body
    );
  }

  function measure() {
    var html = document.documentElement;
    var body = document.body;
    var el = rootEl();
    if (!el || !body) return 0;

    var prevHtmlH = html.style.height;
    var prevBodyH = body.style.height;
    var prevElH = el.style.height;
    html.style.height = "auto";
    html.style.minHeight = "0";
    body.style.height = "1px";
    body.style.minHeight = "0";
    el.style.height = "auto";
    el.style.minHeight = "0";

    var top = el.getBoundingClientRect().top + window.scrollY;
    var bottom = 0;
    var nodes = el.querySelectorAll("*");
    for (var i = 0; i < nodes.length; i++) {
      var r = nodes[i].getBoundingClientRect();
      if (r.width < 1 && r.height < 1) continue;
      bottom = Math.max(bottom, r.bottom + window.scrollY - top);
    }
    bottom = Math.max(
      bottom,
      el.scrollHeight || 0,
      el.offsetHeight || 0,
      el.getBoundingClientRect().height || 0,
      body.scrollHeight || 0
    );

    body.style.height = prevBodyH;
    html.style.height = prevHtmlH;
    el.style.height = prevElH;

    return Math.max(Math.ceil(bottom) + 24, 80);
  }

  function applyParent(h) {
    try {
      var frames = window.parent.document.querySelectorAll("iframe");
      frames.forEach(function (frame) {
        try {
          if (frame.contentWindow === window) {
            var prev = parseFloat(frame.style.height) || 0;
            if (h > prev || Math.abs(prev - h) >= 2) {
              frame.style.height = h + "px";
              frame.style.width = "100%";
              frame.style.maxWidth = "100%";
              frame.style.minHeight = "0";
              frame.style.overflow = "hidden";
              frame.removeAttribute("height");
              frame.setAttribute("scrolling", "no");
            }
          }
        } catch (_) {}
      });
    } catch (_) {}
  }

  function post() {
    try {
      applyFramedStyles();
      var h = measure();
      if (!h || h < 40) return;
      if (h < lastHeight && lastHeight - h < 80) return;
      if (Math.abs(h - lastHeight) < 2) return;
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
    settleTimers = [50, 250, 600, 1200, 2000, 3500, 5000].map(function (ms) {
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
