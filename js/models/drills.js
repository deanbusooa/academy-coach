// Drill library domain logic. Pure functions.

const str = (v) => (v === undefined || v === null ? '' : String(v).trim());

/** Turn multi-line textarea text (or an array) into a clean list. */
export function toList(value) {
  const arr = Array.isArray(value) ? value : String(value || '').split(/\r?\n/);
  return arr.map((s) => String(s).replace(/^[-•*\s]+/, '').trim()).filter(Boolean);
}

export function listToLines(list) {
  return (list || []).join('\n');
}

export function normalizeDrill(input = {}) {
  const duration = Number(input.durationMin);
  return {
    ...(input.id ? { id: input.id } : {}),
    name: str(input.name),
    durationMin: Number.isFinite(duration) ? Math.round(duration) : 0,
    equipment: toList(input.equipment),
    coachingPoints: toList(input.coachingPoints),
    ageGroups: Array.isArray(input.ageGroups) ? input.ageGroups.filter(Boolean) : [],
    notes: str(input.notes),
  };
}

export function validateDrill(d) {
  const errors = {};
  if (!d.name) errors.name = 'Name is required';
  if (!(d.durationMin > 0)) errors.durationMin = 'Enter minutes (1 or more)';
  else if (d.durationMin > 240) errors.durationMin = 'That is longer than 4 hours';
  return errors;
}

export function sortDrills(drills) {
  return drills.slice().sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
}

/** Drills with no age groups set are suitable for everyone. */
export function suitsAgeGroup(drill, ageGroup) {
  return !ageGroup || !drill.ageGroups?.length || drill.ageGroups.includes(ageGroup);
}

export function filterDrills(drills, { query = '', ageGroup = '' } = {}) {
  const q = query.trim().toLowerCase();
  return sortDrills(drills).filter((d) => {
    if (!suitsAgeGroup(d, ageGroup)) return false;
    if (!q) return true;
    return d.name.toLowerCase().includes(q)
      || d.equipment.some((e) => e.toLowerCase().includes(q))
      || d.coachingPoints.some((c) => c.toLowerCase().includes(q));
  });
}

/** Unique equipment list across drills, e.g. for a session kit list. */
export function equipmentFor(drills) {
  const seen = new Map();
  for (const d of drills) for (const e of d.equipment || []) {
    const k = e.toLowerCase();
    if (!seen.has(k)) seen.set(k, e);
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b));
}
