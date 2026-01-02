# GitHub Pages — docs/

This `docs/` folder is used as the Pages source for the Web Purge project.

Quick notes:

- Push to the repository branch configured for Pages (commonly `main`) and the files under `docs/` will be served at the Pages URL configured in Settings → Pages. It may take a minute or two for updates to appear after a push.
- The site root is `docs/index.html`. Other static files in `docs/` (e.g. `web-purge-defaults.json`, `privacy.html`, `terms.html`) will be directly available via the Pages URL.
- To publish: go to the repository Settings → Pages and select `Branch: main / folder: /docs` (or whichever branch/folder you prefer), then Save.

Visibility and private repos:

- By default, Pages sites are public. GitHub allows Pages to be published from private repositories depending on your account/organization plan and settings. Check Settings → Pages → Visibility for options.
- If you need private/internal-only Pages hosting, that requires GitHub Enterprise or specific organization-level policies — verify with your organization or GitHub plan support.

Deployment notes:

- This repo includes `scripts/sync-defaults.js` which copies `src/options/options.json` into `docs/` before build; run it or commit the synced files before pushing to ensure `docs/web-purge-defaults.json` is up-to-date.
- After pushing, wait a minute and reload the Pages URL; if the site doesn't update, check the Pages status and build logs under Settings → Pages.

If you want, I can also add a small GitHub Actions workflow to automatically sync/copy and deploy the docs on push. Let me know if you want that.
