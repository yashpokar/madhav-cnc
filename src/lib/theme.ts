export type ThemeMode = 'light' | 'dark' | 'system'

export const THEME_KEY = 'theme'

/** Light is the default; dark or match-device only when the user chooses it. Runs before first paint so there is no flash of the wrong theme. */
export const THEME_SCRIPT = `
(function () {
  var root = document.documentElement;
  function resolve() {
    var saved = null;
    try { saved = localStorage.getItem('${THEME_KEY}'); } catch (e) {}
    if (saved === 'dark') return 'dark';
    if (saved === 'system') return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    return 'light';
  }
  var current = resolve();
  root.setAttribute('data-theme', current);
  window.addEventListener('beforeprint', function () { root.setAttribute('data-theme', 'light'); });
  window.addEventListener('afterprint', function () { root.setAttribute('data-theme', current); });
  window.__setTheme = function (mode) {
    try {
      localStorage.setItem('${THEME_KEY}', mode);
    } catch (e) {}
    current = resolve();
    root.setAttribute('data-theme', current);
  };
})();
`

export function setTheme(mode: ThemeMode) {
  ;(window as unknown as { __setTheme?: (mode: ThemeMode) => void }).__setTheme?.(mode)
}
