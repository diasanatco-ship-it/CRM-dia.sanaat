// router.js — روتر ساده مبتنی بر hash، بدون رفرش صفحه، سازگار با GitHub Pages
const routes = []; // { pattern, keys, fn }
let afterNavigate = null;

function compile(pattern) {
  const keys = [];
  const regex = pattern.replace(/:[^/]+/g, m => { keys.push(m.slice(1)); return '([^/]+)'; });
  return { re: new RegExp('^' + regex + '$'), keys };
}

export function route(pattern, fn) {
  const { re, keys } = compile(pattern);
  routes.push({ re, keys, fn });
}
export function onNavigate(fn) { afterNavigate = fn; }

export function navigate(hash) { location.hash = hash; }

export function startRouter() {
  const render = () => {
    const key = location.hash || '#/dashboard';
    for (const r of routes) {
      const m = key.match(r.re);
      if (m) {
        const params = {};
        r.keys.forEach((k, i) => { params[k] = decodeURIComponent(m[i + 1]); });
        r.fn(params);
        if (afterNavigate) afterNavigate(key);
        return;
      }
    }
    // مسیر ناشناخته → داشبورد (برنامه خراب نمی‌شود، حتی بعد از Refresh با هش نامعتبر)
    location.hash = '#/dashboard';
  };
  window.addEventListener('hashchange', render);
  render();
}
