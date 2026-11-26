import { keepFocus } from './utils/dom.js';

// Minimal hash router.
// Routes look like { path: '/players/:id', view, title, nav }.
// URLs look like #/players/abc?tab=x — params and query are passed to render().

function compile(path) {
  const keys = [];
  const pattern = path
    .split('/')
    .map((seg) => {
      if (seg.startsWith(':')) { keys.push(seg.slice(1)); return '([^/]+)'; }
      return seg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    })
    .join('/');
  return { regex: new RegExp(`^${pattern}/?$`), keys };
}

export function parseHash(hash) {
  const raw = (hash || '').replace(/^#/, '') || '/';
  const [path, qs = ''] = raw.split('?');
  const query = Object.fromEntries(new URLSearchParams(qs));
  return { path: path || '/', query };
}

export function matchRoute(routes, path) {
  for (const route of routes) {
    route._c ??= compile(route.path);
    const m = route._c.regex.exec(path);
    if (m) {
      const params = {};
      try {
        route._c.keys.forEach((k, i) => { params[k] = decodeURIComponent(m[i + 1]); });
      } catch {
        return null; // malformed %-escape (e.g. a hand-edited URL): treat as no match → fallback route
      }
      return { route, params };
    }
  }
  return null;
}

/** Build a hash URL: href('/bookings', { week: '2026-11-23' }) → '#/bookings?week=2026-11-23' */
export function href(path, query) {
  const qs = query ? new URLSearchParams(
    Object.entries(query).filter(([, v]) => v !== undefined && v !== null && v !== ''),
  ).toString() : '';
  return `#${path}${qs ? `?${qs}` : ''}`;
}

export function navigate(path, query) {
  location.hash = href(path, query);
}

/**
 * Start listening to hash changes.
 * @returns {{ refresh: () => void, current: () => object }}
 */
export function startRouter({ routes, container, fallback = '/', onRoute }) {
  let current = null;

  function render({ keepScroll = false } = {}) {
    const { path, query } = parseHash(location.hash);
    const found = matchRoute(routes, path);
    if (!found) { location.replace(href(fallback)); return; }

    const changedRoute = !current || current.path !== path;
    const scrollY = window.scrollY;
    current = { ...found, path, query };

    // Same page re-rendering after a data change: keep keyboard focus on the
    // equivalent control (e.g. the register tile just toggled).
    keepFocus(container, () => {
      container.replaceChildren();
      try {
        found.route.view.render(container, found.params, query);
      } catch (err) {
        console.error('[router] view failed', err);
        const p = document.createElement('p');
        p.className = 'empty';
        p.textContent = 'Something went wrong showing this page.';
        container.append(p);
      }
    });
    onRoute?.(current);

    if (keepScroll && !changedRoute) window.scrollTo(0, scrollY);
    else if (changedRoute) { window.scrollTo(0, 0); container.focus({ preventScroll: true }); }
  }

  window.addEventListener('hashchange', () => render());
  render();

  return {
    refresh: () => render({ keepScroll: true }),
    current: () => current,
  };
}
