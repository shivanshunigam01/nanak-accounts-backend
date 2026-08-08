/**
 * Parent bridge kept for pages that already loaded it.
 * Embeds no longer post resize heights (avoids blank-space loops without WP access).
 * This file intentionally does nothing harmful if still referenced.
 */
(function () {
  if (window.__nanakIframeParentResize) return;
  window.__nanakIframeParentResize = true;
  // No-op: child embeds no longer drive parent height changes.
})();
