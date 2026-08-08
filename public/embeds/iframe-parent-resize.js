/**
 * Nanak iframe parent resize bridge.
 *
 * Required on WordPress once (footer or with the iframe HTML block) so embeds
 * with no height + scrolling="no" become visible:
 *
 *   <script src="https://online.nanakaccountants.com.au/embeds/iframe-parent-resize.js" defer></script>
 *
 * Listens for nanak-embed-resize / resize-iframe. No wheel hijacking.
 */
(function () {
  if (window.__nanakIframeParentResize) return;
  window.__nanakIframeParentResize = true;

  function apply(source, height) {
    var h = Number(height);
    if (!h || h < 40) return;
    document.querySelectorAll("iframe").forEach(function (frame) {
      try {
        if (frame.contentWindow !== source) return;
        var prev = parseFloat(frame.style.height) || 0;
        if (Math.abs(prev - h) < 4) return;
        frame.dataset.nanakSized = "1";
        frame.style.width = frame.style.width || "100%";
        frame.style.maxWidth = "100%";
        frame.style.display = "block";
        frame.style.overflow = "hidden";
        frame.style.minHeight = "0";
        frame.style.height = h + "px";
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
