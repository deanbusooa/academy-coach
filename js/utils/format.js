// Formatting helpers for display only (never for stored values).

export const CURRENCIES = ['GBP', 'EUR', 'USD', 'AUD', 'CAD', 'NZD', 'ZAR', 'NGN', 'GHS', 'KES', 'INR', 'AED'];

const moneyCache = new Map();

export function formatMoney(amount, currency = 'GBP') {
  const n = Number(amount) || 0;
  let fmt = moneyCache.get(currency);
  if (!fmt) {
    try {
      fmt = new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: 2, minimumFractionDigits: 0 });
    } catch {
      fmt = { format: (v) => `${currency} ${v.toFixed(2)}` };
    }
    moneyCache.set(currency, fmt);
  }
  return fmt.format(n);
}

export function formatDuration(mins) {
  const m = Math.max(0, Math.round(Number(mins) || 0));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h}h ${r}m` : `${h}h`;
}

export function initials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

export function plural(n, one, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`;
}

export function round1(n) {
  return Math.round(n * 10) / 10;
}
