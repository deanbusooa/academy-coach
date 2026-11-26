// Hand-rolled responsive SVG line chart for 1–5 skill ratings over time.

import { h } from '../utils/dom.js';
import { daysBetween, formatShortDate } from '../utils/date.js';

const PAD = { top: 14, right: 22, bottom: 34, left: 30 };

/**
 * @param {Array<{key,label,color,points:Array<{x:string,y:number}>}>} series
 * @param {{ yMin?: number, yMax?: number, hidden?: Set<string>, width?: number }} opts
 * `width` is the viewBox width: pass roughly the on-screen width so labels stay legible on phones.
 */
export function lineChart(series, { yMin = 1, yMax = 5, hidden = new Set(), width = 640 } = {}) {
  const W = Math.max(300, width);
  const H = W < 500 ? 240 : 280;
  const dates = [...new Set(series.flatMap((s) => s.points.map((p) => p.x)))].sort();
  const first = dates[0];
  const span = Math.max(1, daysBetween(first, dates[dates.length - 1]));
  const iw = W - PAD.left - PAD.right;
  const ih = H - PAD.top - PAD.bottom;

  const x = (iso) => PAD.left + (dates.length === 1 ? iw / 2 : (daysBetween(first, iso) / span) * iw);
  const y = (v) => PAD.top + ih - ((v - yMin) / (yMax - yMin)) * ih;

  const grid = [];
  for (let v = yMin; v <= yMax; v++) {
    grid.push(
      h('line', { x1: PAD.left, x2: W - PAD.right, y1: y(v), y2: y(v), class: 'chart-grid' }),
      h('text', { x: PAD.left - 10, y: y(v) + 4, class: 'chart-label', 'text-anchor': 'end' }, String(v)),
    );
  }

  // Thin out x labels so they don't collide (~1 label per 80px).
  const maxLabels = Math.max(2, Math.floor(iw / 80));
  const step = Math.ceil(dates.length / maxLabels);
  const picked = [];
  for (const d of dates.filter((_, i) => i % step === 0)) {
    if (!picked.length || x(d) - x(picked[picked.length - 1]) >= 56) picked.push(d);
  }
  const last = dates[dates.length - 1];
  if (picked[picked.length - 1] !== last) {
    if (picked.length > 1 && x(last) - x(picked[picked.length - 1]) < 56) picked.pop();
    picked.push(last);
  }
  const xLabels = picked.map((d) => h('text', { x: x(d), y: H - 10, class: 'chart-label', 'text-anchor': 'middle' }, formatShortDate(d)));

  const lines = series.filter((s) => !hidden.has(s.key) && s.points.length).map((s) => {
    const pts = s.points.map((p) => `${x(p.x).toFixed(1)},${y(p.y).toFixed(1)}`).join(' ');
    return h('g', { class: 'chart-series', style: { color: s.color } },
      s.points.length > 1 ? h('polyline', { points: pts, class: 'chart-line' }) : null,
      s.points.map((p) => h('circle', { cx: x(p.x), cy: y(p.y), r: 4.5, class: 'chart-dot' },
        h('title', {}, `${s.label}: ${p.y} (${formatShortDate(p.x)})`))));
  });

  return h('svg', {
    class: 'chart', viewBox: `0 0 ${W} ${H}`, role: 'img',
    'aria-label': `Skill ratings over ${dates.length} assessments`,
    preserveAspectRatio: 'xMidYMid meet',
  }, grid, xLabels, lines);
}
