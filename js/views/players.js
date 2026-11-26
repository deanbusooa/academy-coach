// Roster: search, age-group filter, archived list, add/edit/archive.

import * as store from '../store.js';
import { h, add, setTitle } from '../utils/dom.js';
import { href, navigate } from '../router.js';
import { openFormModal, confirmDialog } from '../ui/form.js';
import { toast } from '../ui/toast.js';
import { plural } from '../utils/format.js';
import { POSITIONS, normalizePlayer, validatePlayer, filterPlayers, countByAgeGroup, activePlayers } from '../models/players.js';
import { deletePlayer, playerDependents } from '../actions.js';
import { pageHead, emptyState, fab, avatar, filterChips, searchBox, ageGroupOptions, listItemLink } from './shared.js';

// View-local UI state survives re-renders triggered by store changes.
const ui = { query: '', ageGroup: '', archived: false };

export function render(container) {
  setTitle('Players');
  const all = store.getAll('players');
  const active = activePlayers(all);
  const archivedCount = all.length - active.length;
  if (!archivedCount) ui.archived = false;
  const settings = store.getSettings();
  const counts = countByAgeGroup(ui.archived ? all.filter((p) => p.archived) : active);

  container.append(pageHead('Players', h('span', { class: 'badge badge-muted' }, plural(active.length, 'player'))));

  if (!all.length) {
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
    const filtered = filterPlayers(all, ui);
    listWrap.replaceChildren(filtered.length
      ? h('ul', { class: 'list' }, filtered.map(playerRow))
      : h('p', { class: 'empty' }, ui.archived ? 'No archived players match.' : 'No players match.'));
  };
  const rerender = () => { container.replaceChildren(); render(container); };

  add(container,
    searchBox({ value: ui.query, placeholder: 'Search players, positions, parents', onInput: (v) => { ui.query = v; renderList(); } }),
    h('div', { class: 'row', style: { alignItems: 'flex-start', flexWrap: 'nowrap' } },
      h('div', { class: 'grow' }, filterChips({
        label: 'Age group',
        value: ui.ageGroup,
        options: settings.ageGroups.filter((g) => counts[g]).map((g) => ({ value: g, label: `${g} · ${counts[g]}` })),
        onChange: (v) => { ui.ageGroup = v; rerender(); },
      })),
      archivedCount ? h('button', {
        type: 'button', class: 'chip', 'aria-pressed': String(ui.archived),
        onclick: () => { ui.archived = !ui.archived; ui.ageGroup = ''; rerender(); },
      }, `Archived · ${archivedCount}`) : null),
    ui.archived ? h('p', { class: 'muted hint-line' }, 'Archived players are hidden from the roster, registers and booking lists. Their history is kept.') : null,
    listWrap,
    fab('Add player', () => openPlayerForm()),
  );
  renderList();
}

function playerRow(p) {
  return listItemLink(href(`/players/${p.id}`),
    avatar(p.name),
    h('div', { class: 'grow' },
      h('div', { class: 'title' }, p.name),
      h('div', { class: 'sub' }, [p.position, p.parentName && `Parent: ${p.parentName}`].filter(Boolean).join(' · ') || '—')),
    h('span', { class: ['badge', p.archived && 'badge-muted'] }, p.ageGroup));
}

/** Archive or restore. Reversible, so no confirm dialog. */
export function setArchived(player, archived) {
  const saved = store.upsert('players', { ...player, archived });
  if (!saved) return false;
  toast(archived ? `${player.name} archived — find them under “Archived”` : `${player.name} restored to the roster`);
  return true;
}

/** Permanent delete, offered only for archived players. */
export async function confirmDeletePlayer(player) {
  const dep = playerDependents(player.id);
  const extra = dep.ratings || dep.bookings
    ? `\n\nThis also deletes ${plural(dep.ratings, 'rating')} and ${plural(dep.bookings, '1-1 booking')}.`
    : '';
  const ok = await confirmDialog({
    title: `Permanently delete ${player.name}?`,
    message: `This cannot be undone.${extra}`,
    confirmLabel: 'Delete permanently',
    danger: true,
  });
  if (!ok || !deletePlayer(player.id)) return false;
  toast('Player deleted');
  navigate('/players');
  return true;
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
      if (!saved) return false;
      if (!isEdit) navigate(`/players/${saved.id}`);
      return true;
    },
    savedMessage: isEdit ? 'Player updated' : 'Player added',
    // Archiving is the normal way to remove a player; permanent delete lives on an archived player's page.
    leftAction: isEdit
      ? (player.archived
        ? { label: 'Restore', icon: 'restore', run: () => setArchived(player, false) }
        : { label: 'Archive', icon: 'archive', run: () => setArchived(player, true) })
      : null,
  });
}
