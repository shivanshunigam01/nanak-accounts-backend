/**
 * Nanak iframe parent resize bridge.
 *
 * Paste once with any Nanak iframe (idempotent — safe on every embed block):
 *
 *   <iframe src="https://online.nanakaccountants.com.au/embeds/….html"
 *     style="width:100%;border:0;display:block;overflow:hidden"
 *     scrolling="no" loading="lazy" title="Nanak embed"></iframe>
 *   <script src="https://online.nanakaccountants.com.au/embeds/iframe-parent-resize.js" defer></script>
 *
 * Sizes Nanak iframes to content height. No wheel hijacking.
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

  function apply(source, height) {
    var h = Number(height);
    if (!h || h < 40) return;
    document.querySelectorAll("iframe").forEach(function (frame) {
      try {
        if (frame.contentWindow !== source) return;
        if (!isNanakFrame(frame) && !frame.dataset.nanakSized) {
          // Still allow if message came from this frame's contentWindow.
        }
        var prev = parseFloat(frame.style.height) || 0;
        if (Math.abs(prev - h) < 4) return;
        frame.dataset.nanakSized = "1";
        frame.style.width = "100%";
        frame.style.maxWidth = "100%";
        frame.style.border = frame.style.border || "0";
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
