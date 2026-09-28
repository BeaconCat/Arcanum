// Apply saved theme before first paint to avoid a light→dark flash.
// Kept as an external file so the default helmet CSP (script-src 'self') allows it.
(function () {
  try {
    var t = localStorage.getItem('theme');
    if (t === 'dark' || (!t && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
      document.documentElement.setAttribute('data-theme', 'dark');
    }
  } catch (e) {}
})();
