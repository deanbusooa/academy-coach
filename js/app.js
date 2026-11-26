// Bootstrap: load data, build nav, start router, register service worker.

import * as store from './store.js';
import { startRouter, href } from './router.js';
import { h } from './utils/dom.js';
import { icon } from './ui/icons.js';
import { toast } from './ui/toast.js';

import * as playersView from './views/players.js';
import * as playerDetailView from './views/player-detail.js';
import * as sessionsView from './views/sessions.js';
import * as sessionDetailView from './views/session-detail.js';
import * as bookingsView from './views/bookings.js';
import * as progressView from './views/progress.js';
import * as drillsView from './views/drills.js';
import * as settingsView from './views/settings.js';

// `section` ties detail routes to their nav tab.
const routes = [
  { path: '/players', view: playersView, section: 'players' },
  { path: '/players/:id', view: playerDetailView, section: 'players' },
  { path: '/sessions', view: sessionsView, section: 'sessions' },
  { path: '/sessions/:id', view: sessionDetailView, section: 'sessions' },
  { path: '/bookings', view: bookingsView, section: 'bookings' },
  { path: '/progress', view: progressView, section: 'progress' },
  { path: '/progress/:playerId', view: progressView, section: 'progress' },
  { path: '/drills', view: drillsView, section: 'drills' },
  { path: '/settings', view: settingsView, section: 'settings' },
];

const NAV = [
  { section: 'players', label: 'Players', icon: 'players', path: '/players' },
  { section: 'sessions', label: 'Sessions', icon: 'sessions', path: '/sessions' },
  { section: 'bookings', label: '1-1s', icon: 'calendar', path: '/bookings' },
  { section: 'progress', label: 'Progress', icon: 'progress', path: '/progress' },
  { section: 'drills', label: 'Drills', icon: 'drills', path: '/drills' },
  { section: 'settings', label: 'Settings', icon: 'settings', path: '/settings' },
];

function buildNav() {
  const nav = document.getElementById('nav');
  nav.replaceChildren(...NAV.map((n) => h('a', { href: href(n.path), dataset: { section: n.section } }, icon(n.icon), h('span', {}, n.label))));
  return nav;
}

function highlightNav(nav, section) {
  for (const a of nav.querySelectorAll('a')) {
    if (a.dataset.section === section) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  }
}

function main() {
  // Single place where failed saves reach the user. Writes roll back and return null/false.
  store.onSaveError((err) => toast(err.message, { type: 'error', duration: 6000 }));
  store.init();
  const nav = buildNav();
  const router = startRouter({
    routes,
    container: document.getElementById('view'),
    fallback: '/players',
    onRoute: (r) => highlightNav(nav, r.route.section),
  });

  // Re-render the current view whenever data changes.
  store.subscribe(() => router.refresh());

  const warning = store.getLoadWarning();
  if (warning) toast(warning, { type: 'error', duration: 8000 });

  // Ask the browser not to evict our data under storage pressure.
  navigator.storage?.persist?.().catch(() => {});

  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('./sw.js').catch((err) => console.warn('[sw] registration failed', err));
  }
}

main();
