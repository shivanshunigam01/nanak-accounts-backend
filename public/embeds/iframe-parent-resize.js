/**
 * WordPress footer (once) — sizes Nanak iframes to content height.
 * Safe with MULTIPLE iframes on one page (e.g. pricing + footer newsletter):
 * never lets a tall embed's height leak onto compact footer widgets.
 *
 *   <script src="https://online.nanakaccountants.com.au/embeds/iframe-parent-resize.js" defer></script>
 */
(function () {
  if (window.__nanakIframeParentResizeV2) return;
  window.__nanakIframeParentResizeV2 = true;
  window.__nanakIframeParentResize = true;

  function frameSrc(frame) {
    try {
      return frame.getAttribute("src") || frame.src || "";
    } catch (_) {
      return "";
    }
  }

  /** Compact embeds must never inherit a tall calculator/pricing height. */
  function compactCap(src) {
    if (/newsletter/i.test(src)) return 260;
    if (/tax-check\.html|\/tax-check/i.test(src)) return 320;
    if (/blog-sidebar/i.test(src)) return 720;
    if (/contact-us|\/contact\b/i.test(src)) return 900;
    return 0;
  }

  function isNanakFrame(src) {
    return (
      /online\.nanakaccountants\.com\.au/i.test(src) ||
      /api\.connect\.cavaluer\.com/i.test(src) ||
      /\/embeds\//i.test(src)
    );
  }

  function applyToFrame(frame, height, meta) {
    var src = frameSrc(frame);
    var h = Number(height);
    if (!h || h < 40) return;

    var cap = compactCap(src);
    if (meta && meta.compact && meta.maxHeight) {
      cap = Math.min(cap || meta.maxHeight, Number(meta.maxHeight) || cap);
    }
    if (cap && h > cap) h = cap;
    if (!cap && h > 10000) h = 10000;

    var prev = parseFloat(frame.style.height) || 0;
    if (Math.abs(prev - h) < 2) return;

    frame.dataset.nanakSized = "1";
    frame.style.setProperty("width", "100%", "important");
    frame.style.setProperty("max-width", "100%", "important");
    frame.style.setProperty("min-width", "0", "important");
    frame.style.setProperty("display", "block", "important");
    frame.style.setProperty("overflow", "hidden", "important");
    frame.style.setProperty("min-height", "0", "important");
    frame.style.setProperty("max-height", cap ? cap + "px" : "none", "important");
    frame.style.setProperty("height", h + "px", "important");
    frame.removeAttribute("height");
    frame.setAttribute("scrolling", "no");
  }

  /** If another script blasted a tall height onto the newsletter, pull it back. */
  function clampCompactFrames() {
    document.querySelectorAll("iframe").forEach(function (frame) {
      try {
        var src = frameSrc(frame);
        if (!isNanakFrame(src)) return;
        var cap = compactCap(src);
        if (!cap) return;
        var prev = parseFloat(frame.style.height) || frame.offsetHeight || 0;
        if (prev > cap) {
          frame.style.setProperty("max-height", cap + "px", "important");
          frame.style.setProperty("height", cap + "px", "important");
        }
      } catch (_) {}
    });
  }

  function apply(source, height, meta) {
    var matched = false;
    document.querySelectorAll("iframe").forEach(function (frame) {
      try {
        if (frame.contentWindow !== source) return;
        matched = true;
        applyToFrame(frame, height, meta || {});
      } catch (_) {}
    });
    // Always re-clamp compact embeds after any resize message (multi-iframe pages).
    clampCompactFrames();
    return matched;
  }

  window.addEventListener("message", function (e) {
    var data = e && e.data;
    if (!data || typeof data !== "object") return;
    if (data.type === "nanak-embed-resize" || data.type === "resize-iframe") {
      apply(e.source, data.height, data);
    }
  });

  // Catch late height leaks from other scripts on the page.
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", clampCompactFrames);
  } else {
    clampCompactFrames();
  }
  window.addEventListener("load", clampCompactFrames);
  setTimeout(clampCompactFrames, 500);
  setTimeout(clampCompactFrames, 1500);
  setTimeout(clampCompactFrames, 3000);
  setInterval(clampCompactFrames, 2000);
})();
