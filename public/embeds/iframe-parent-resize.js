/**
 * WordPress footer (once) — sizes ALL Nanak iframes to full content height
 * so the page scrolls normally with no half-cut embeds:
 *
 *   <script src="https://online.nanakaccountants.com.au/embeds/iframe-parent-resize.js" defer></script>
 */
(function () {
  if (window.__nanakIframeParentResize) return;
  window.__nanakIframeParentResize = true;

  function apply(source, height) {
    var h = Number(height);
    if (!h || h < 40) return;
    if (h > 10000) h = 10000;

    document.querySelectorAll("iframe").forEach(function (frame) {
      try {
        if (frame.contentWindow !== source) return;
        var prev = parseFloat(frame.style.height) || 0;
        if (Math.abs(prev - h) < 4) return;

        frame.dataset.nanakSized = "1";
        frame.style.setProperty("width", "100%", "important");
        frame.style.setProperty("max-width", "100%", "important");
        frame.style.setProperty("min-width", "0", "important");
        frame.style.setProperty("display", "block", "important");
        frame.style.setProperty("overflow", "hidden", "important");
        frame.style.setProperty("min-height", "0", "important");
        frame.style.setProperty("max-height", "none", "important");
        frame.style.setProperty("height", h + "px", "important");
        frame.removeAttribute("height");
        frame.setAttribute("scrolling", "no");
      } catch (_) {}
    });
  }

  window.addEventListener("message", function (e) {
    var data = e && e.data;
    if (!data || typeof data !== "object") return;
    if (data.type === "nanak-embed-resize" || data.type === "resize-iframe") {
      apply(e.source, data.height);
    }
  });
})();
