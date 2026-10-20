# App Store listing

- `metadata.json` — name, subtitle, promotional text, keywords and description for en-US, es-MX and ru (all within Apple's limits), plus category and URLs.
- `screenshots/ios-6.3/{en,es,ru}/01–10.jpg` — 1206 × 2622 screenshots for the "iPhone with Dynamic Island" slot, the only iPhone size App Store Connect asks for now. Already uploaded for all three languages.
- `screenshots/screens.html` + `copy.js` — the source. Open `screens.html?lang=ru` in a browser to see all ten; `?lang=ru&n=3` shows one at full size. Text lives in `copy.js`.

The Russian name is "Labless: расшифровка анализов" because "Labless: анализы крови" was refused as taken. Save one language at a time in App Store Connect: saving several at once makes it report the names as taken.

The app is iPhone-only (`supportsTablet: false`), so no iPad screenshots are needed.
