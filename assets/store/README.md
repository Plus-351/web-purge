# Store Assets Guide

This file lists recommended images and filenames to include for store listings and documentation.

Location conventions

- Extension icons: `src/icons/`
- Store assets and screenshots: `assets/store/`

Required icons (put PNGs in `src/icons/`):

- `icon16.png` — 16×16 (toolbar, small UI)
- `icon32.png` — 32×32
- `icon48.png` — 48×48
- `icon128.png` — 128×128 (store listing primary icon)

Recommended additional images (place in `assets/store/`):

- `logo.svg` — vector logo (useful for docs and marketing)
- `screenshot-1.png`, `screenshot-2.png` — screenshots of the popup and options page (suggested 1280×800 or 800×600)
- `feature-graphic.png` — promotional graphic (follow store-specific dimensions)

Formats and quality

- Icons: PNG with transparency (prefer 8-bit+alpha). Provide exact pixel sizes as above.
- Logos: SVG preferred; also provide a 512×512 PNG fallback.
- Screenshots: PNG or high-quality JPG, ensure UI is readable and in Spanish/English as appropriate.

Store-specific notes

- Chrome Web Store: supply a 128×128 icon and at least one screenshot. See the Chrome developer documentation for additional assets like promotional tiles.
- Microsoft Edge Add-ons: similar requirements to Chrome; verify required aspect ratios on submission.

Naming and paths example

- `src/icons/icon16.png`
- `src/icons/icon32.png`
- `src/icons/icon48.png`
- `src/icons/icon128.png`
- `assets/store/screenshot-1.png`
- `assets/store/feature-graphic.png`

Tips

- Keep text in screenshots minimal and localised.
- Produce at least one screenshot showing the panic button and one showing the options page.
