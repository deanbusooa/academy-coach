// Tiny DOM builder. Strings become text nodes, so user data is never parsed
// as HTML. Never use innerHTML with user-supplied values.

const SVG_NS = 'http://www.w3.org/2000/svg';
const SVG_TAGS = new Set(['svg', 'g', 'path', 'circle', 'line', 'polyline', 'polygon', 'rect', 'text', 'title', 'defs', 'clipPath']);

/**
 * h('button', { class: 'btn', onclick: fn, 'aria-label': 'Save' }, 'Save')
 * Props:
 *   class / className   → className (string, or array with falsy entries skipped)
 *   on<event>           → addEventListener
 *   dataset             → object of data-* values
 *   style               → object of style properties
 *   value / checked / selected / disabled / hidden → set as properties
 *   anything else       → setAttribute (skipped when null/false)
 */
export function h(tag, props = {}, ...children) {
  const isSvg = SVG_TAGS.has(tag);
  const el = isSvg ? document.createElementNS(SVG_NS, tag) : document.createElement(tag);

  for (const [key, val] of Object.entries(props || {})) {
    if (val === undefined || val === null || val === false) continue;
    if (key === 'class' || key === 'className') {
      const cls = Array.isArray(val) ? val.filter(Boolean).join(' ') : val;
      if (isSvg) el.setAttribute('class', cls); else el.className = cls;
    } else if (key.startsWith('on') && typeof val === 'function') {
      el.addEventListener(key.slice(2).toLowerCase(), val);
    } else if (key === 'dataset') {
      Object.assign(el.dataset, val);
    } else if (key === 'style' && typeof val === 'object') {
      for (const [prop, v] of Object.entries(val)) {
        if (prop.startsWith('--')) el.style.setProperty(prop, v); else el.style[prop] = v;
      }
    } else if (!isSvg && ['value', 'checked', 'selected', 'disabled', 'hidden', 'multiple'].includes(key)) {
      el[key] = val;
    } else {
      el.setAttribute(key, val === true ? '' : String(val));
    }
  }

  append(el, children);
  return el;
}

function append(el, children) {
  for (const child of children) {
    if (child === null || child === undefined || child === false || child === true) continue;
    if (Array.isArray(child)) append(el, child);
    else if (child instanceof Node) el.append(child);
    else el.append(document.createTextNode(String(child)));
  }
}

/** Like el.append(), but skips null/false (native append would insert "null"). */
export function add(el, ...children) {
  append(el, children);
  return el;
}

export function clear(el) {
  el.replaceChildren();
  return el;
}

// ---------- focus across re-renders ----------
// Views rebuild their DOM on every store change, which would drop keyboard
// focus to <body>. Give stable controls a `data-focus-key` and wrap the
// re-render in keepFocus() to put focus back on the equivalent new element.

function focusedKey(container) {
  const el = document.activeElement;
  if (!el || !container.contains(el)) return null;
  return el.closest('[data-focus-key]')?.dataset.focusKey ?? null;
}

function refocus(container, key) {
  if (!key) return false;
  const el = container.querySelector(`[data-focus-key="${CSS.escape(key)}"]`);
  if (!el) return false;
  el.focus({ preventScroll: true });
  return true;
}

/** Run a re-render of `container` and restore focus to the same keyed control. */
export function keepFocus(container, rerender) {
  const key = focusedKey(container);
  rerender();
  return refocus(container, key);
}

export function setTitle(text) {
  const t = document.getElementById('page-title');
  if (t) t.textContent = text || '';
  document.title = text ? `${text} · Academy Coach` : 'Academy Coach';
}
