# App Store listing

- `metadata.json` — name, subtitle, promotional text, keywords and description for en-US, es-MX and ru (all within Apple's limits), plus category and URLs.
- `screenshots/ios-6.9/{en,es,ru}/01–10.jpg` — 1320 × 2868 screenshots for the 6.9" iPhone slot. App Store Connect scales them down for smaller iPhones.
- `screenshots/screens.html` + `copy.js` — the source. Open `screens.html?lang=ru` in a browser to see all ten; `?lang=ru&n=3` shows one at full size. Text lives in `copy.js`.

The app is iPhone-only (`supportsTablet: false`), so no iPad screenshots are needed.
