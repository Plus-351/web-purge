# Web Purge

Web Purge is a local-first browser extension that helps remove browsing data (history, cookies, site data) associated with configured target websites. It runs entirely on the user's machine without telemetry.

## Quick start

1. Clone the repository and enter it:

```bash
git clone https://github.com/Plus-351/web-purge.git
cd web-purge
```

1. Keep translations in sync (recommended):

```bash
npm run sync-locales
```

1. Start the dev runner (the `predev` script will sync locales automatically):

```bash
WINDOW_SIZE=1200,900 CHROME_LANG=es npm run dev
```

1. To build a distributable zip (runs `sync-locales` first):

```bash
npm run build
```

## Where to edit

- Translations: edit files under `src/_locales/<lang>/messages.json`. These are the source-of-truth for translations; run `npm run sync-locales` (or `npm run dev`) to copy them into the top-level `_locales` folder that Chrome consumes.
- Category lists and UI defaults: edit `src/options/options.json` (contains category ids, labels, emojis and domain lists). `src/options/options.js` loads this at runtime.

### What you can modify manually

- `src/options/options.json`: category definitions, emojis and the built-in domain lists. Edits take effect in the Options page immediately (after saving) because the UI loads this JSON at runtime.
- `src/_locales/<lang>/messages.json`: translation strings. Keep these under `src/_locales` and run `npm run sync-locales` (or `npm run dev`) before loading the extension in Chrome so the top-level `_locales` is up-to-date.
- `package.json` version: the canonical developer-facing version is in `package.json`. The extension runtime reads the version from `manifest.json`.
- `manifest.json` version: this is what Chrome shows in the extension UI. We provide an automated sync script — run `npm run sync-version` (or `npm run dev` / `npm run build`) to copy `package.json` → `manifest.json`.

Notes:

- Prefer editing `src/_locales` and `src/options/options.json` as the source-of-truth. Use `npm run sync-locales` and `npm run sync-version` to update runtime/packaging files.
- If you only change `package.json` version, run `npm run sync-version` to update `manifest.json` before loading the extension.

## Configuration

Settings are saved in `chrome.storage.sync`. You can import/export configuration from the Options page as JSON. Default configuration is loaded from `src/options/options.json` when no stored config exists.

## Version

The extension version is managed in `package.json` and displayed at the bottom of the Options page.

## Features

- Preloaded domain category lists (Trackers, Social Networks, Sensitive Sites, Custom Domains)
- Per-domain enable/disable toggles
- Manual triggers from popup (panic / clean current domain)
- Import / export and reset-to-defaults
- Multilingual UI using Chrome `i18n` (`_locales`)

## Contributing

Contributions welcome — please fork, make changes in `src/` (edit `src/_locales` and `src/options/options.json` as appropriate), and open a pull request.

## License

MIT — see [LICENSE](LICENSE).

## Contact

Visit <https://plus351.com/contact/> for feedback.
