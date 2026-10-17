// Applies the saved (or system) theme before the first paint; ThemeProvider takes over after.
// A separate file (not an inline script) so the Content-Security-Policy can forbid inline scripts.
(function () {
  var theme = null;
  try {
    theme = localStorage.getItem('umk-theme');
  } catch (e) {
    // storage unavailable: use the system preference
  }
  if (theme !== 'light' && theme !== 'dark') {
    theme = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  document.documentElement.setAttribute('data-theme', theme);
})();
