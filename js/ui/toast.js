import { h } from '../utils/dom.js';
import { icon as svgIcon } from './icons.js';

/**
 * Show a short message.
 * type: 'info' (it worked; status) | 'error' (it did NOT work; alert).
 * icon: optional icon name, e.g. 'warning' for "saved, but note…" messages,
 * which stay type 'info' because the action succeeded.
 */
export function toast(message, { type = 'info', icon = null, duration = 2600 } = {}) {
  const root = document.getElementById('toast-root');
  if (!root) return;
  const el = h('div', {
    class: ['toast', type === 'error' && 'error', icon && 'has-icon'],
    role: type === 'error' ? 'alert' : 'status',
    dataset: icon ? { icon } : null,
  }, icon ? svgIcon(icon, 'toast-icon') : null, h('span', {}, message));
  root.append(el);
  setTimeout(() => el.remove(), duration);
}
