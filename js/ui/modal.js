// Modal that renders as a bottom sheet on phones and a centred dialog on
// larger screens (see .modal in components.css).

import { h } from '../utils/dom.js';
import { icon } from './icons.js';

const open = [];

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && open.length) open[open.length - 1].close();
});

/**
 * Only the top-most modal is interactive: every other top-level element
 * (the app, lower modals) gets `inert`, so Tab, screen readers and taps can't
 * reach it. The toast region stays live so messages are still announced.
 */
function syncInert() {
  const top = open[open.length - 1]?.backdrop ?? null;
  for (const el of document.body.children) {
    if (el.tagName === 'SCRIPT' || el.id === 'toast-root') continue;
    el.inert = Boolean(top) && el !== top;
  }
}

/** Where to put focus back: the opener, or its re-rendered twin (same data-focus-key). */
function returnFocus(opener, key) {
  const target = opener?.isConnected ? opener
    : (key ? document.querySelector(`[data-focus-key="${CSS.escape(key)}"]`) : null);
  target?.focus?.({ preventScroll: true });
}

/**
 * @param {{ title: string, body: Node|Node[], footer?: Node, onClose?: () => void }} opts
 * @returns {{ close: () => void, el: HTMLElement }}
 */
export function openModal({ title, body, footer, onClose }) {
  const previouslyFocused = document.activeElement;
  const previousKey = previouslyFocused?.closest?.('[data-focus-key]')?.dataset.focusKey ?? null;
  const titleId = `modal-title-${Date.now()}`;

  const closeBtn = h('button', { class: 'btn btn-ghost btn-icon', type: 'button', 'aria-label': 'Close' }, icon('x'));
  const dialog = h('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': titleId },
    h('div', { class: 'modal-head' }, h('h3', { id: titleId }, title), closeBtn),
    h('div', { class: 'modal-body' }, body),
    footer ? h('div', { class: 'modal-foot' }, footer) : null,
  );
  const backdrop = h('div', { class: 'modal-backdrop' }, dialog);

  let closed = false;
  const api = {
    el: dialog,
    backdrop,
    close() {
      if (closed) return;
      closed = true;
      backdrop.remove();
      open.splice(open.indexOf(api), 1);
      syncInert();
      if (!open.length) document.body.style.overflow = '';
      returnFocus(previouslyFocused, previousKey);
      onClose?.();
    },
  };

  closeBtn.addEventListener('click', api.close);
  backdrop.addEventListener('mousedown', (e) => { if (e.target === backdrop) api.close(); });

  document.body.append(backdrop);
  document.body.style.overflow = 'hidden';
  open.push(api);
  syncInert();

  // Focus the first field (or the close button) for keyboard users.
  requestAnimationFrame(() => {
    const first = dialog.querySelector('input:not([type=hidden]), select, textarea') || closeBtn;
    // Avoid popping the keyboard on phones for long forms; focus only on wider screens.
    if (window.matchMedia('(min-width: 640px)').matches || first === closeBtn) first.focus({ preventScroll: true });
  });

  return api;
}

/** Promise-based confirmation dialog. */
/** Pass cancelLabel: null for a single-button notice. */
export function confirmDialog({ title = 'Are you sure?', message = '', confirmLabel = 'Confirm', cancelLabel = 'Cancel', danger = false } = {}) {
  return new Promise((resolve) => {
    let result = false;
    const cancel = cancelLabel ? h('button', { class: 'btn', type: 'button' }, cancelLabel) : null;
    const ok = h('button', { class: ['btn', danger ? 'btn-danger' : 'btn-pitch'], type: 'button' }, confirmLabel);
    const m = openModal({
      title,
      body: h('p', { class: 'pre-line' }, message),
      footer: h('div', { class: 'form-actions' }, cancel, ok),
      onClose: () => resolve(result),
    });
    cancel?.addEventListener('click', () => m.close());
    ok.addEventListener('click', () => { result = true; m.close(); });
    requestAnimationFrame(() => ok.focus());
  });
}
