// Roster: search, age-group filter, add/edit.

import * as store from '../store.js';
import { h, setTitle } from '../utils/dom.js';
import { href, navigate } from '../router.js';
import { openFormModal, confirmDialog } from '../ui/form.js';
import { toast } from '../ui/toast.js';
import { plural } from '../utils/format.js';
import { POSITIONS, normalizePlayer, validatePlayer, filterPlayers, countByAgeGroup } from '../models/players.js';
import { deletePlayer, playerDependents } from '../actions.js';
import { pageHead, emptyState, fab, avatar, filterChips, searchBox, ageGroupOptions, listItemLink } from './shared.js';

// View-local UI state survives re-renders triggered by store changes.
const ui = { query: '', ageGroup: '' };

export function render(container) {
  setTitle('Players');
  const players = store.getAll('players');
  const settings = store.getSettings();
  const counts = countByAgeGroup(players);

  container.append(pageHead('Players', h('span', { class: 'badge badge-muted' }, plural(players.length, 'player'))));

  if (!players.length) {
    container.append(emptyState({
      iconName: 'players',
      text: 'No players yet. Add your squad to start taking attendance and tracking progress.',
      action: h('button', { class: 'btn btn-primary', onclick: () => openPlayerForm() }, 'Add first player'),
    }));
    container.append(fab('Add player', () => openPlayerForm()));
    return;
  }

  const listWrap = h('div');
  const renderList = () => {
    const filtered = filterPlayers(players, ui);
    listWrap.replaceChildren(filtered.length
      ? h('ul', { class: 'list' }, filtered.map(playerRow))
      : h('p', { class: 'empty' }, 'No players match.'));
  };

  container.append(
    searchBox({ value: ui.query, placeholder: 'Search players, positions, parents', onInput: (v) => { ui.query = v; renderList(); } }),
    filterChips({
      label: 'Age group',
      value: ui.ageGroup,
      options: settings.ageGroups.filter((g) => counts[g]).map((g) => ({ value: g, label: `${g} · ${counts[g]}` })),
      onChange: (v) => { ui.ageGroup = v; renderAgain(container); },
    }),
    listWrap,
    fab('Add player', () => openPlayerForm()),
  );
  renderList();
}

function renderAgain(container) {
  container.replaceChildren();
  render(container);
}

function playerRow(p) {
  return listItemLink(href(`/players/${p.id}`),
    avatar(p.name),
    h('div', { class: 'grow' },
      h('div', { class: 'title' }, p.name),
      h('div', { class: 'sub' }, [p.position, p.parentName && `Parent: ${p.parentName}`].filter(Boolean).join(' · ') || '—')),
    h('span', { class: 'badge' }, p.ageGroup));
}

/** Add (no arg) or edit a player. Exported for the player detail view. */
export function openPlayerForm(player = null) {
  const settings = store.getSettings();
  const isEdit = Boolean(player);
  openFormModal({
    title: isEdit ? 'Edit player' : 'Add player',
    values: player || { ageGroup: ui.ageGroup || '' },
    fields: [
      { name: 'name', label: 'Full name', required: true, autocomplete: 'off' },
      [
        { name: 'ageGroup', label: 'Age group', type: 'select', required: true, options: ageGroupOptions(settings, player?.ageGroup) },
        { name: 'position', label: 'Position', type: 'select', options: POSITIONS, placeholderOption: '—' },
      ],
      { name: 'parentName', label: 'Parent / guardian name' },
      [
        { name: 'parentPhone', label: 'Parent phone', type: 'tel', inputmode: 'tel' },
        { name: 'parentEmail', label: 'Parent email', type: 'email', inputmode: 'email' },
      ],
      { name: 'notes', label: 'Notes', type: 'textarea', placeholder: 'Medical info, strong foot, goals…' },
    ],
    normalize: normalizePlayer,
    validate: validatePlayer,
    onSave: (rec) => {
      const saved = store.upsert('players', rec);
      if (!isEdit) navigate(`/players/${saved.id}`);
    },
    savedMessage: isEdit ? 'Player updated' : 'Player added',
    onDelete: isEdit ? async () => {
      const dep = playerDependents(player.id);
      const extra = dep.ratings || dep.bookings
        ? `\n\nThis also deletes ${plural(dep.ratings, 'rating')} and ${plural(dep.bookings, '1-1 booking')}.`
        : '';
      const ok = await confirmDialog({
        title: `Delete ${player.name}?`,
        message: `This cannot be undone.${extra}`,
        confirmLabel: 'Delete player',
        danger: true,
      });
      if (!ok) return false;
      deletePlayer(player.id);
      toast('Player deleted');
      navigate('/players');
      return true;
    } : null,
  });
}
