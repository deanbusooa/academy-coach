import { h } from '../utils/dom.js';

/** Show a short message. type: 'info' | 'error' */
export function toast(message, { type = 'info', duration = 2600 } = {}) {
  const root = document.getElementById('toast-root');
  if (!root) return;
  const el = h('div', { class: ['toast', type === 'error' && 'error'], role: type === 'error' ? 'alert' : 'status' }, message);
  root.append(el);
  setTimeout(() => el.remove(), duration);
}
