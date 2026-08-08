/**
 * Nanak iframe parent resize — paste once in WordPress footer:
 *   <script src="https://online.nanakaccountants.com.au/embeds/iframe-parent-resize.js" defer></script>
 *
 * Sizes ALL Nanak iframes like the working pay-calculator embed.
 * Rejects blank-space inflation jumps.
 */
(function () {
  if (window.__nanakIframeParentResize) return;
  window.__nanakIframeParentResize = true;

  function apply(source, height) {
    var h = Number(height);
    if (!h || h < 40) return;
    if (h > 12000) return; // hard safety cap

    document.querySelectorAll("iframe").forEach(function (frame) {
      try {
        if (frame.contentWindow !== source) return;
        var prev = parseFloat(frame.style.height) || 0;

        // Reject absurd growth (the blank white gap bug).
        if (prev > 150 && h > prev + 1800) return;
        if (prev > 150 && h > prev * 2.5) return;
        if (Math.abs(prev - h) < 3) return;

        frame.dataset.nanakSized = "1";
        frame.style.width = "100%";
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
