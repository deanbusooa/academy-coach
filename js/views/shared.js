// Small building blocks shared by several views.

import { h, keepFocus } from '../utils/dom.js';
import { icon } from '../ui/icons.js';
import { initials } from '../utils/format.js';
import { sortPlayers } from '../models/players.js';

export function pageHead(title, ...right) {
  return h('div', { class: 'page-head' }, h('h2', {}, title), h('span', { class: 'spacer' }), ...right);
}

export function backLink(hash, label = 'Back') {
  return h('a', { class: 'back-link', href: hash }, icon('chevron-left'), label);
}

export function emptyState({ iconName = 'ball', text, action }) {
  return h('div', { class: 'empty' }, icon(iconName), h('p', {}, text), action || null);
}

export function fab(label, onclick) {
  return h('button', { class: 'fab', type: 'button', 'aria-label': label, title: label, onclick, dataset: { focusKey: 'fab' } }, icon('plus'));
}

export function avatar(name) {
  return h('span', { class: 'avatar', 'aria-hidden': 'true' }, initials(name));
}

/** Filter chips: options = [{ value, label }]; first chip is "All". */
export function filterChips({ options, value, onChange, allLabel = 'All', label = 'Filter' }) {
  const all = [{ value: '', label: allLabel }, ...options];
  return h('div', { class: 'chips', role: 'group', 'aria-label': label },
    all.map((o) => h('button', {
      type: 'button',
      class: 'chip',
      dataset: { focusKey: `chip-${label}-${o.value}` },
      'aria-pressed': String(o.value === value),
      onclick: () => onChange(o.value),
    }, o.label)));
}

export function searchBox({ value, placeholder, onInput }) {
  const input = h('input', {
    class: 'input', type: 'search', value, placeholder, 'aria-label': placeholder,
    oninput: (e) => onInput(e.target.value),
  });
  return h('div', { class: 'search' }, icon('search'), input);
}

/** Select options for active players (plus `keepId`, e.g. the archived player on an existing booking). */
/** Re-render a view in place (e.g. after a filter chip), keeping keyboard focus. */
export function rerenderView(container, render, ...args) {
  keepFocus(container, () => { container.replaceChildren(); render(container, ...args); });
}

export function playerOptions(players, keepId = null) {
  return sortPlayers(players.filter((p) => !p.archived || p.id === keepId))
    .map((p) => ({ value: p.id, label: `${p.name}${p.ageGroup ? ` (${p.ageGroup})` : ''}${p.archived ? ' · archived' : ''}` }));
}

/** Age groups from settings plus any extra value currently in use. */
export function ageGroupOptions(settings, ...extra) {
  const set = [...settings.ageGroups];
  for (const g of extra) if (g && !set.includes(g)) set.push(g);
  return set;
}

export function listItemLink(hrefValue, ...content) {
  return h('li', {}, h('a', { class: 'list-item', href: hrefValue }, ...content, icon('chevron-right', 'chev')));
}
