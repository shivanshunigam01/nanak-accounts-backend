/**
 * Nanak iframe parent resize bridge — add ONCE on nanakaccountants.com.au
 * (WordPress / Elementor → Custom Code / footer):
 *
 *   <script src="https://online.nanakaccountants.com.au/embeds/iframe-parent-resize.js" defer></script>
 *
 * Covers ALL Nanak iframes (pricing, checkout, newsletter, pay calculator,
 * blog sidebar, tax-check, popup, etc.). Do not set a fixed height on iframes.
 */
(function () {
  if (window.__nanakIframeParentResize) return;
  window.__nanakIframeParentResize = true;

  function isNanakFrame(frame) {
    try {
      var src = frame.getAttribute("src") || frame.src || "";
      return (
        /online\.nanakaccountants\.com\.au/i.test(src) ||
        /api\.connect\.cavaluer\.com/i.test(src) ||
        /connect\.cavaluer\.com\/embeds/i.test(src)
      );
    } catch (_) {
      return false;
    }
  }

  function prepareFrame(frame) {
    frame.style.width = "100%";
    frame.style.maxWidth = "100%";
    frame.style.border = frame.style.border || "0";
    frame.style.overflow = "visible";
    frame.setAttribute("scrolling", "no");
    // Keep a soft floor until the first resize message arrives.
    if (!frame.style.minHeight) frame.style.minHeight = "120px";
  }

  function apply(source, height) {
    var h = Number(height);
    if (!h || h < 40) return;
    document.querySelectorAll("iframe").forEach(function (frame) {
      try {
        if (frame.contentWindow === source) {
          prepareFrame(frame);
          frame.style.height = h + "px";
          frame.removeAttribute("height");
        }
      } catch (_) {}
    });
  }

  function prepareAll() {
    document.querySelectorAll("iframe").forEach(function (frame) {
      if (isNanakFrame(frame)) prepareFrame(frame);
    });
  }

  window.addEventListener("message", function (e) {
    var data = e && e.data;
    if (!data || typeof data !== "object") return;
    if (data.type === "nanak-embed-resize" || data.type === "resize-iframe") {
      apply(e.source, data.height);
    }
    if (data.type === "iframe-wheel" && typeof data.deltaY === "number") {
      window.scrollBy({ top: data.deltaY, left: data.deltaX || 0, behavior: "auto" });
    }
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", prepareAll);
  } else {
    prepareAll();
  }
  window.addEventListener("load", prepareAll);
  setInterval(prepareAll, 2000);

  // Watch for Elementor/WP injecting iframes later
  if (typeof MutationObserver !== "undefined") {
    try {
      new MutationObserver(prepareAll).observe(document.documentElement, {
        childList: true,
        subtree: true,
      });
    } catch (_) {}
  }
})();
