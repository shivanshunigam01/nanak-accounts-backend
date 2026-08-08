/**
 * Child-side embed resize — include in every Nanak embed HTML:
 *   <script src="/embeds/nanak-embed-child-resize.js" defer></script>
 * Or absolute:
 *   <script src="https://online.nanakaccountants.com.au/embeds/nanak-embed-child-resize.js" defer></script>
 *
 * Optional: <body data-embed-root="nnl"> to measure a specific element id.
 */
(function () {
  if (window.__nanakEmbedChildResize) return;
  window.__nanakEmbedChildResize = true;

  if (window.parent && window.parent !== window) {
    document.documentElement.classList.add("framed");
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
      document.getElementById("root") ||
      document.querySelector("main") ||
      document.body
    );
  }

  function measure() {
    var el = rootEl();
    var h = Math.max(
      el ? el.getBoundingClientRect().height : 0,
      el ? el.scrollHeight : 0,
      el ? el.offsetHeight : 0,
      document.body ? document.body.scrollHeight : 0,
      document.documentElement ? document.documentElement.scrollHeight : 0
    );
    return Math.ceil(h) + 12;
  }

  function applyParent(h) {
    try {
      var frames = window.parent.document.querySelectorAll("iframe");
      frames.forEach(function (frame) {
        try {
          if (frame.contentWindow === window) {
            frame.style.height = h + "px";
            frame.style.width = "100%";
            frame.style.maxWidth = "100%";
            frame.style.overflow = "visible";
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
      applyParent(h);
      if (window.parent && window.parent !== window) {
        window.parent.postMessage({ type: "nanak-embed-resize", height: h, source: "embed-child" }, "*");
        window.parent.postMessage({ type: "resize-iframe", height: h }, "*");
      }
    } catch (_) {}
  }

  window.nanakPostEmbedHeight = post;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", post);
  } else {
    post();
  }
  window.addEventListener("load", post);
  window.addEventListener("resize", post);
  requestAnimationFrame(post);
  setTimeout(post, 50);
  setTimeout(post, 250);
  setTimeout(post, 800);
  setTimeout(post, 1600);

  if (typeof ResizeObserver !== "undefined") {
    try {
      var ro = new ResizeObserver(function () {
        post();
      });
      ro.observe(document.body);
      var r = rootEl();
      if (r && r !== document.body) ro.observe(r);
    } catch (_) {}
  }

  setInterval(post, 1200);
})();
