# Academy Coach ⚽

Academy Coach is a training companion for football coaches who run kids' group sessions and 1-1 coaching. It runs in the browser on your phone or computer. There's no account, and all data stays on your device.

- **Players:** your roster with age group, position, parent contact (tap to call), and notes.
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

To use it on your phone, host the folder on any static host (GitHub Pages, Netlify, and so on). Open it, then choose **Add to Home Screen**.

To try it with sample data, open **Settings → Load demo data**.

## Tests

```bash
npm test                     # runs the unit tests in Node
```

You can also open `/tests/index.html` in the browser while the app is being served.

## Your data

Everything is saved in this browser's local storage on this device. Clearing browser data deletes it. Use **Settings → Export backup** regularly, and keep the file somewhere safe.

See [CLAUDE.md](CLAUDE.md) for the architecture and code conventions.
