// Progress: pick a player, rate skills 1–5, see trend chart + history.

import * as store from '../store.js';
import { h, add, setTitle, keepFocus } from '../utils/dom.js';
import { href } from '../router.js';
import { icon } from '../ui/icons.js';
import { openModal, confirmDialog } from '../ui/modal.js';
import { toast } from '../ui/toast.js';
import { lineChart } from '../ui/chart.js';
import { round1, plural } from '../utils/format.js';
import { todayISO, formatDate, formatShortDate } from '../utils/date.js';
import { sortPlayers } from '../models/players.js';
import {
  SKILLS, MAX_SCORE, normalizeRating, validateRating, ratingsForPlayer, trendSeries, latestScores,
  average, changeSinceFirst, changeSinceLast, uniqueDates, ratingOn, RUBRIC,
} from '../models/ratings.js';
import { skillBar } from './player-detail.js';
import { saveRating } from '../actions.js';
import { pageHead, backLink, emptyState, avatar, filterChips, listItemLink, rerenderView } from './shared.js';

const ui = { ageGroup: '', hidden: new Set() };

export function render(container, params) {
  if (params.playerId) renderPlayer(container, params.playerId);
  else renderPicker(container);
}

// ---------- player picker ----------

function renderPicker(container) {
  setTitle('Progress');
  // Archived players' progress stays reachable from their profile page.
  const players = sortPlayers(store.getAll('players').filter((p) => !p.archived));
  const ratings = store.getAll('ratings');
  const settings = store.getSettings();

  container.append(pageHead('Progress'));
  if (!players.length) {
    container.append(emptyState({
      iconName: 'progress',
      text: 'Add players, then rate their skills after sessions to track progress.',
      action: h('a', { class: 'btn btn-primary', href: href('/players') }, 'Go to players'),
    }));
    return;
  }

  const groups = settings.ageGroups.filter((g) => players.some((p) => p.ageGroup === g));
  add(container, groups.length > 1 ? filterChips({
    label: 'Age group', value: ui.ageGroup,
    options: groups.map((g) => ({ value: g, label: g })),
    onChange: (v) => { ui.ageGroup = v; rerenderView(container, render, {}); },
  }) : null);

  const list = players.filter((p) => !ui.ageGroup || p.ageGroup === ui.ageGroup);
  container.append(h('ul', { class: 'list' }, list.map((p) => {
    const pr = ratingsForPlayer(ratings, p.id);
    const avg = average(latestScores(pr));
    const last = pr[pr.length - 1];
    return listItemLink(href(`/progress/${p.id}`),
      avatar(p.name),
      h('div', { class: 'grow' },
        h('div', { class: 'title' }, p.name),
        h('div', { class: 'sub' }, last ? `Last rated ${formatDate(last.date)} · ${plural(pr.length, 'rating')}` : 'Not rated yet')),
      avg !== null ? h('span', { class: 'score-pill' }, round1(avg).toFixed(1)) : h('span', { class: 'badge badge-muted' }, p.ageGroup));
  })));
}

// ---------- single player ----------

function renderPlayer(container, playerId) {
  const player = store.get('players', playerId);
  if (!player) {
    setTitle('Progress');
    container.append(backLink(href('/progress'), 'Progress'), emptyState({ iconName: 'players', text: 'This player no longer exists.' }));
    return;
  }
  setTitle(`${player.name} · Progress`);
  const ratings = ratingsForPlayer(store.getAll('ratings'), playerId);
  const latest = latestScores(ratings);
  const change = changeSinceFirst(ratings);
  const changeLast = changeSinceLast(ratings);
  const dates = uniqueDates(ratings);

  container.append(
    backLink(href(`/players/${playerId}`), player.name),
    h('div', { class: 'page-head' },
      h('h2', {}, 'Progress'),
      h('span', { class: 'spacer' }),
      h('button', { class: 'btn btn-primary', type: 'button', onclick: () => openRatingForm(playerId) }, icon('star'), 'Rate now')),
  );

  if (!ratings.length) {
    container.append(emptyState({
      iconName: 'progress',
      text: `No ratings for ${player.name} yet. Rate their skills 1–5 after a session; each rating adds a point to the trend chart.`,
      action: h('button', { class: 'btn btn-primary', onclick: () => openRatingForm(playerId) }, 'Add first rating'),
    }));
    return;
  }

  // Latest + change
  container.append(h('section', { class: 'card' },
    h('div', { class: 'card-head' },
      h('h3', {}, 'Current level'),
      h('span', { class: 'score-pill' }, round1(average(latest) ?? 0).toFixed(1))),
    h('div', { class: 'skill-bars' },
      Object.keys(change).length ? h('div', { class: 'skill-bar skill-bar-head', 'aria-hidden': 'true' },
        h('span'), h('span'), h('span'),
        h('span', { class: 'deltas' }, h('span', {}, 'vs last'), h('span', {}, 'vs first'))) : null,
      SKILLS.map((s) => {
        const bar = skillBar(s, latest[s.key]);
        bar.append(h('span', { class: 'deltas' },
          deltaCell(changeLast[s.key], `${s.label} since last rating`),
          deltaCell(change[s.key], `${s.label} since first rating`)));
        return bar;
      })),
    Object.keys(change).length
      ? h('p', { class: 'muted hint-line' }, `Change since the last rating, and since the first on ${formatDate(ratings[0].date)}. Only skills that were scored count.`)
      : null,
  ));

  // Trend chart
  const chartCard = h('section', { class: 'card' }, h('h3', {}, 'Trend'));
  if (dates.length < 2) {
    chartCard.append(h('p', { class: 'muted' }, 'Add a second rating on another date to see the trend line.'));
  } else {
    const series = trendSeries(ratings);
    const chartWrap = h('div', { class: 'chart-wrap' });
    const legend = h('div', { class: 'legend', role: 'group', 'aria-label': 'Show or hide skills' });
    const draw = () => {
      // Match the viewBox to the screen so axis labels render near real size on phones.
      const width = Math.min(640, Math.max(300, window.innerWidth - 64));
      chartWrap.replaceChildren(lineChart(series, { yMin: 1, yMax: MAX_SCORE, hidden: ui.hidden, width }));
      keepFocus(legend, () => legend.replaceChildren(...series.map((s) => h('button', {
        type: 'button', class: 'legend-item', 'aria-pressed': String(!ui.hidden.has(s.key)), dataset: { focusKey: `legend-${s.key}` },
        style: { '--dot': s.color },
        onclick: () => { if (ui.hidden.has(s.key)) ui.hidden.delete(s.key); else ui.hidden.add(s.key); draw(); },
      }, h('span', { class: 'legend-dot' }), s.label))));
    };
    draw();
    chartCard.append(legend, chartWrap);
  }
  container.append(chartCard);

  // History
  container.append(h('div', { class: 'section-label' }, 'History'),
    h('ul', { class: 'list' }, ratings.slice().reverse().map((r) => h('li', {},
      h('button', { class: 'list-item', type: 'button', onclick: () => openRatingForm(playerId, r) },
        h('div', { class: 'grow' },
          h('div', { class: 'title' }, formatDate(r.date)),
          h('div', { class: 'sub' }, SKILLS.filter((s) => r.scores[s.key]).map((s) => `${s.label} ${r.scores[s.key]}`).join(' · ')),
          r.notes ? h('div', { class: 'sub' }, r.notes) : null),
        h('span', { class: 'score-pill' }, round1(average(r.scores) ?? 0).toFixed(1)))))));
}

/** One change figure: +n / −n / 0, or blank when the skill wasn't scored twice. */
function deltaCell(d, label) {
  if (d === undefined) return h('span', { class: 'delta' });
  const text = d > 0 ? `+${d}` : d < 0 ? `−${Math.abs(d)}` : '0';
  return h('span', { class: ['delta', d > 0 && 'up', d < 0 && 'down'], title: label, 'aria-label': `${label}: ${text}` }, text);
}

// ---------- rating form ----------

export function openRatingForm(playerId, rating = null) {
  const player = store.get('players', playerId);
  const isEdit = Boolean(rating);
  // A rating records only what was observed this time. New ratings start with
  // every skill "Not observed"; the previous score is shown as a hint, never saved.
  const prev = latestScores(ratingsForPlayer(store.getAll('ratings').filter((r) => r.id !== rating?.id), playerId));
  const scores = { ...(rating ? rating.scores : {}) };

  const dateInput = h('input', { class: 'input', type: 'date', value: rating?.date || todayISO(), required: true, id: 'rating-date' });
  const notes = h('textarea', { class: 'textarea', rows: 2, placeholder: 'What went well, what to work on…' }, rating?.notes || '');
  const errorEl = h('p', { class: 'error', hidden: true, style: { color: 'var(--c-bad)', fontWeight: 600 } });

  // One rating per player per date: warn when the chosen date already has one.
  const dateHint = h('p', { class: 'hint-line warn-text', hidden: true, role: 'status' });
  const updateDateHint = () => {
    const other = ratingOn(store.getAll('ratings'), playerId, dateInput.value, rating?.id);
    dateHint.hidden = !other;
    dateHint.textContent = other ? `${player?.name || 'This player'} already has a rating on ${formatDate(other.date)}. Saving replaces it.` : '';
  };
  dateInput.addEventListener('input', updateDateHint);
  dateInput.addEventListener('change', updateDateHint);
  updateDateHint();

  const rows = SKILLS.map((s) => {
    const status = h('span', { class: 'score-status' });
    const showStatus = () => {
      status.textContent = scores[s.key] ? '' : 'Not observed';
      status.hidden = Boolean(scores[s.key]);
    };
    const btns = [1, 2, 3, 4, 5].map((n) => h('button', {
      type: 'button', class: 'score-btn', 'aria-label': `${s.label} ${n}`,
      'aria-pressed': String(scores[s.key] === n),
      onclick: () => {
        scores[s.key] = scores[s.key] === n ? undefined : n; // tap again: back to "Not observed"
        btns.forEach((b, i) => b.setAttribute('aria-pressed', String(scores[s.key] === i + 1)));
        showStatus();
      },
    }, String(n)));
    showStatus();
    return h('div', { class: 'score-row', dataset: { skill: s.key } },
      h('span', { class: 'score-label' },
        h('span', { class: 'legend-dot', style: { '--dot': s.color } }), s.label,
        prev[s.key] ? h('span', { class: 'score-last', title: 'Score at the previous rating (not saved again)' }, `Last: ${prev[s.key]}`) : null,
        status),
      h('div', { class: 'score-btns', role: 'group', 'aria-label': s.label }, btns));
  });

  const save = h('button', { class: 'btn btn-primary', type: 'button' }, icon('check'), 'Save rating');
  const del = isEdit ? h('button', { class: 'btn btn-ghost left', type: 'button', style: { color: 'var(--c-bad)' } }, icon('trash'), 'Delete') : null;

  const m = openModal({
    title: `${isEdit ? 'Edit rating' : 'Rate'} · ${player?.name || ''}`,
    body: [
      h('div', { class: 'field' }, h('label', { for: 'rating-date' }, 'Date'), dateInput, dateHint),
      h('p', { class: 'muted hint-line' }, 'Score only what you saw this session. Leave the rest as "Not observed"; tap a score again to clear it.'),
      h('div', { class: 'score-grid' }, rows),
      h('dl', { class: 'rubric', 'aria-label': 'What the scores mean' },
        RUBRIC.map((r) => [h('dt', {}, String(r.score)), h('dd', {}, r.text)])),
      h('div', { class: 'field' }, h('label', {}, 'Notes'), notes),
      errorEl,
    ],
    footer: h('div', { class: 'form-actions' }, del, h('button', { class: 'btn', type: 'button', onclick: () => m.close() }, 'Cancel'), save),
  });

  save.addEventListener('click', () => {
    const rec = normalizeRating({ ...(rating || {}), playerId, date: dateInput.value, scores, notes: notes.value });
    const errors = validateRating(rec);
    const msg = Object.values(errors)[0];
    if (msg) { errorEl.textContent = msg; errorEl.hidden = false; return; }
    const result = saveRating(rec); // replaces any other rating on the same date
    if (!result) return; // save-error toast already shown; keep form open
    m.close();
    toast(result.replaced
      ? `Replaced ${player?.name || ''}'s rating for ${formatShortDate(rec.date)}`
      : isEdit ? 'Rating updated' : `Rated ${player?.name || ''} for ${formatShortDate(rec.date)}`);
  });

  del?.addEventListener('click', async () => {
    const ok = await confirmDialog({ title: 'Delete this rating?', message: formatDate(rating.date), confirmLabel: 'Delete', danger: true });
    if (!ok) return;
    if (!store.remove('ratings', rating.id)) return;
    m.close();
    toast('Rating deleted');
  });
}
