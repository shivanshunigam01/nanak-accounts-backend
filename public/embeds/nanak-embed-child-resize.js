/**
 * Child-side embed mode — included by every Nanak embed HTML.
 * No WordPress parent script required.
 *
 * When framed: behave like a normal page (full width, scroll inside iframe).
 * Does NOT post heights or touch parent iframe.style — that caused blank-space jumps.
 */
(function () {
  if (window.__nanakEmbedChildResize) return;
  window.__nanakEmbedChildResize = true;

  function applyFramed() {
    if (!(window.parent && window.parent !== window)) return;
    document.documentElement.classList.add("framed");
    document.documentElement.style.height = "auto";
    document.documentElement.style.minHeight = "0";
    document.documentElement.style.width = "100%";
    document.documentElement.style.overflow = "auto";
    if (document.body) {
      document.body.classList.add("framed");
      document.body.style.height = "auto";
      document.body.style.minHeight = "0";
      document.body.style.width = "100%";
      document.body.style.overflow = "auto";
    }
  }

  applyFramed();
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", applyFramed);
  }
  window.addEventListener("load", applyFramed);

  // Kept so older inline callers do not throw; intentionally a no-op.
  window.nanakPostEmbedHeight = function () {};
})();
