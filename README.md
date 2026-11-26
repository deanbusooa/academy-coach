# Academy Coach ⚽

Academy Coach is a training companion for football coaches who run kids' group sessions and 1-1 coaching. It runs in the browser on your phone or computer. There's no account, and all data stays on your device.

- **Players:** your roster with age group, position, the date they joined, parent contact (tap to call), and notes. Players who leave can be archived: they drop off the roster and registers, and their history is kept.
- **Group sessions:** plan a session from your drill library, see the total time and kit list, and take the register on the pitch with one tap per player.
- **1-1 sessions:** a weekly calendar of bookings, with paid/unpaid tracking, weekly totals, and a list of everyone who still owes you.
- **Progress:** rate players 1–5 on dribbling, passing, first touch, shooting, defending, and fitness, then see their trend over time.
- **Drill library:** drills with duration, equipment, coaching points, and suitable age groups.
- **Backup:** export everything to a JSON file and import it on another device.
- **Works offline:** you can install it to your home screen.

## Running it

The app has to be served over HTTP. Opening `index.html` directly won't work.

```bash
npm start                    # serves on http://localhost:8080 (uses npx serve)
# or
python -m http.server 8080
```

To use it on your phone, open the hosted version (see **Deploying** below) and choose **Add to Home Screen**.

To try it with sample data, open **Settings → Load demo data**.

## Tests

```bash
npm install                  # once: installs Playwright, the only dev dependency
npm test                     # unit tests in Node (no browser needed)
npm run test:e2e             # browser tests: phone and desktop layouts
npm run test:all             # both
```

The browser tests run on Chromium (Android phone and desktop layouts) and WebKit (the Safari engine, iPhone layout). Run `npx playwright install chromium webkit` once. To use your installed Chrome for the Chromium runs instead, run `PW_CHANNEL=chrome npm run test:e2e`.

They cover the full coach workflow (including backup and restore), offline loading, two open tabs, keyboard-only use of the register, archiving, and age-group rules. You can also open `/tests/index.html` in the browser while the app is served, to run the unit tests there.

GitHub Actions runs both suites on every push and pull request.

## Deploying

Every push to `main` that passes the tests is published to GitHub Pages by `.github/workflows/ci.yml`. Only the app files are published (`index.html`, `manifest.webmanifest`, `sw.js`, `css/`, `js/`, `assets/`).

One-time setup: in the GitHub repo, go to **Settings → Pages → Build and deployment** and set **Source** to **GitHub Actions**. The app is then at `https://<user>.github.io/academy-coach/`. GitHub Pages on a private repository needs a paid GitHub plan.

When you change any app file, bump `CACHE_VERSION` in `sw.js`. Otherwise installed copies keep the old version for one extra visit.

## Your data

Everything is saved in this browser's local storage on this device. Clearing browser data deletes it. Use **Settings → Export backup** regularly, and keep the file somewhere safe.

The data and backup files aren't encrypted. They hold children's names and parents' contact details, so keep backups private, and don't store medical or other sensitive details in notes.

On a phone or tablet, **Export backup** opens the share sheet. Choose **Save to Files** (iPhone/iPad) or a cloud drive, or email the file to yourself. On a computer it downloads normally.

### iPhone and iPad: home-screen app

- **Separate data:** if you added Academy Coach to your home screen, that app has its own storage, separate from Safari. Players you entered in a Safari tab don't appear in the home-screen app, or the other way round. To move data across, export from one and import into the other.
- **Downloads don't work there:** iOS ignores file downloads inside home-screen apps, which is why export uses the share sheet. Choose **Save to Files** so the backup isn't lost.
- **Import:** **Settings → Import backup** opens the Files picker. Choose the backup `.json` you saved.

See [CLAUDE.md](CLAUDE.md) for the architecture and code conventions.
