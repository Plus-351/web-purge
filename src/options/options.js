document.addEventListener('DOMContentLoaded', function () {
    const categoriesContainer = document.getElementById('categories-container');
    const autoCleanToggle = document.getElementById('auto-clean-on-startup');
    const historyLookbackInput = document.getElementById('history-lookback-days');
    const exportButton = document.getElementById('export-config');
    const importButton = document.getElementById('import-config-btn');
    const importInput = document.getElementById('import-config');
    const resetButton = document.getElementById('reset-defaults');
    const form = document.getElementById('options-form');
    const saveLabel = document.getElementById('save-label');
    const exportLabel = document.getElementById('export-label');
    const importLabel = document.getElementById('import-label');
    const resetLabel = document.getElementById('reset-label');
    const addDomainText = chrome.i18n.getMessage('add_domain') || 'Add domain';
    // resize UI removed per user request

    // Remote defaults configuration (kept here so repo defaults JSON remains data-only)
    // REMOTE_DEFAULTS_URL will be initialized from src/shared/defaults-config.json when available.
    let REMOTE_DEFAULTS_URL = null;
    // DEFAULTS_VERSION will be derived after loading the local JSON or from stored applied defaults.
    let DEFAULTS_VERSION = null;

    // `defaultConfig` will be loaded from `src/options/options.json` at runtime.
    let defaultConfig = null;

    function loadDefaultConfigFromJson() {
        const url = chrome.runtime.getURL('src/options/options.json');
        return fetch(url).then(r => {
            if (!r.ok) throw new Error('Failed to load options.json');
            return r.json();
        }).then(data => {
            defaultConfig = {
                version: data.version || 1,
                // remoteDefaultsUrl and defaultsVersion are now constants in options.js
                remoteDefaultsUrl: REMOTE_DEFAULTS_URL,
                behavior: (data.behavior || { autoCleanOnStartup: false, historyLookbackDays: 7 }),
                ui: (data.ui || { showSensitiveCategory: true }),
                categories: (data.categories || [])
            };
            // try to read shared defaults-config.json to get a centralized fallback URL
            try {
                const cfgUrl = chrome.runtime.getURL('src/shared/defaults-config.json');
                fetch(cfgUrl).then(r2 => r2.ok ? r2.json() : null).then(cfgData => {
                    if (cfgData && cfgData.fallbackUrl) REMOTE_DEFAULTS_URL = cfgData.fallbackUrl;
                    // ensure remoteDefaultsUrl is available in storage.local for the service worker
                    try {
                        chrome.storage.local.get('remoteDefaultsUrl', function (res) {
                            if (!res || !res.remoteDefaultsUrl) {
                                chrome.storage.local.set({ remoteDefaultsUrl: REMOTE_DEFAULTS_URL });
                            }
                        });
                    } catch (e) { }
                }).catch(() => { /* ignore */ });
            } catch (e) { /* ignore */ }
            return defaultConfig;
        }).catch(err => {
            // fallback minimal defaults
            defaultConfig = {
                version: 1,
                behavior: { autoCleanOnStartup: false, historyLookbackDays: 7 },
                ui: { showSensitiveCategory: true },
                categories: []
            };
            console.warn('Could not load options.json, using builtin defaults.', err);
            return defaultConfig;
        });
    }

    // Fetch remote defaults if configured and merge non-destructively with user config
    async function fetchAndApplyRemoteDefaultsIfAny() {
        try {
            const url = REMOTE_DEFAULTS_URL || (defaultConfig && defaultConfig.remoteDefaultsUrl);
            if (!url) return { applied: false };
            // placeholder check
            if (url.indexOf('YOUR_HOST') !== -1) return { applied: false };

            const resp = await fetch(url, { cache: 'no-cache' });
            if (!resp.ok) return { applied: false };
            const remote = await resp.json();
            if (!remote || !remote.defaultsVersion) return { applied: false };

            // delegate to the shared merge helper
            return await mergeDefaultsAndSave(remote);
        } catch (e) {
            console.warn('Remote defaults fetch failed', e);
            return { applied: false };
        }
    }

    // Normalize domain string for deduping
    function normalizeDomainName(s) {
        if (!s) return '';
        const raw = (typeof s === 'string') ? s : (s.domain || '');
        let d = raw.trim().toLowerCase();
        if (d.startsWith('*.')) d = d.slice(2);
        // strip protocol if present
        if (d.indexOf('://') !== -1) {
            try { d = (new URL(d)).hostname; } catch (e) { /* ignore */ }
        }
        // remove port
        if (d.indexOf(':') !== -1) d = d.split(':')[0];
        return d;
    }

    // Compare semantic versions like '0.1.5' -> returns -1 if a<b, 0 if equal, 1 if a>b
    function compareVersions(a, b) {
        if (!a && !b) return 0;
        if (!a) return -1;
        if (!b) return 1;
        const pa = String(a).split('.').map(x => parseInt(x, 10) || 0);
        const pb = String(b).split('.').map(x => parseInt(x, 10) || 0);
        const len = Math.max(pa.length, pb.length);
        for (let i = 0; i < len; i++) {
            const na = pa[i] || 0;
            const nb = pb[i] || 0;
            if (na < nb) return -1;
            if (na > nb) return 1;
        }
        return 0;
    }

    // Merge helper that performs global dedupe across categories and saves merged config
    async function mergeDefaultsAndSave(remote) {
        try {
            if (!remote || !remote.defaultsVersion) return { applied: false };
            // validate shape
            if (!Array.isArray(remote.categories)) return { applied: false };

            const meta = await new Promise(resolve => chrome.storage.local.get('defaultsMeta', res => resolve(res.defaultsMeta || {})));
            const lastApplied = meta.appliedDefaultsVersion || null;
            // If we've already applied an equal or newer defaults version, skip applying
            // unless the remote object explicitly requests a forced apply (e.g. reset button).
            if (!remote.force && lastApplied && compareVersions(lastApplied, remote.defaultsVersion) >= 0) return { applied: false };

            const stored = await new Promise(resolve => chrome.storage.sync.get('webPurgeConfig', res => resolve(res.webPurgeConfig || null)));
            let userCfg = stored || JSON.parse(JSON.stringify(defaultConfig || { categories: [] }));

            // backup
            try {
                const now = Date.now();
                const bk = {};
                bk['backup_' + now] = userCfg;
                await new Promise(resolve => chrome.storage.local.set(bk, resolve));
            } catch (e) { /* ignore */ }

            // Build maps for remote categories and a global existing set
            const existing = new Set();
            (userCfg.categories || []).forEach(c => {
                (c.domains || []).forEach(d => {
                    const nd = normalizeDomainName(d);
                    if (nd) existing.add(nd);
                });
            });

            // ensure custom category exists
            userCfg.categories = userCfg.categories || [];
            let customCat = userCfg.categories.find(c => c.id === 'custom_domains');
            if (!customCat) {
                // keep a minimal English fallback label; the canonical translation for
                // the custom category is provided via `_locales` (category_custom_domains).
                customCat = { id: 'custom_domains', enabled: false, emoji: '🛠️', label: { en: 'Custom' }, domains: [], order: 9999 };
                userCfg.categories.push(customCat);
            }

            // create a quick lookup of remote categories
            const remoteMap = new Map();
            (remote.categories || []).forEach(rc => {
                const set = new Set();
                (rc.domains || []).forEach(rd => {
                    const domain = (typeof rd === 'string') ? rd : (rd.domain || '');
                    const nd = normalizeDomainName(domain);
                    if (nd) set.add(nd);
                });
                remoteMap.set(rc.id, { rc: rc, domains: set });
            });

            let changes = false;

            // Process removals and moves: for each existing user category that also exists remotely
            (userCfg.categories || []).forEach(uc => {
                const rid = uc.id;
                const remoteEntry = remoteMap.get(rid);
                if (!remoteEntry) return; // skip categories not in remote (we don't remove whole categories)
                const remoteSet = remoteEntry.domains;
                const kept = [];
                (uc.domains || []).forEach(dEnt => {
                    const domain = (typeof dEnt === 'string') ? dEnt : (dEnt.domain || '');
                    const nd = normalizeDomainName(domain);
                    if (!nd) return; // skip malformed
                    if (remoteSet.has(nd)) {
                        // domain still present remotely -> keep as-is
                        kept.push(dEnt);
                    } else {
                        // domain removed from remote
                        if (dEnt.enabled) {
                            // user had it enabled -> move to custom (enabled)
                            const already = customCat.domains.find(cd => normalizeDomainName(cd) === nd || normalizeDomainName(cd.domain) === nd);
                            if (!already) {
                                customCat.domains.push({ domain: domain, enabled: true });
                            }
                        }
                        // if it was disabled, we drop it (do not keep)
                        changes = true;
                    }
                });
                uc.domains = kept;
            });

            // Process additions: for each remote category, add domains not present anywhere
            remote.categories.forEach(rc => {
                const rid = rc.id;
                let uc = (userCfg.categories || []).find(c => c.id === rid);
                const catDefaultEnabled = rc.enabled !== undefined ? !!rc.enabled : true;
                if (!uc) {
                    const newDomains = [];
                    (rc.domains || []).forEach(rd => {
                        const domain = (typeof rd === 'string') ? rd : (rd.domain || '');
                        const nd = normalizeDomainName(domain);
                        if (!nd) return;
                        if (existing.has(nd)) return;
                        existing.add(nd);
                        newDomains.push({ domain: domain, enabled: catDefaultEnabled });
                    });
                    if (newDomains.length > 0) {
                        userCfg.categories.push({ id: rc.id, enabled: rc.enabled !== undefined ? !!rc.enabled : true, emoji: rc.emoji || rc.icon || '', label: rc.label || {}, domains: newDomains, order: (rc.order !== undefined ? rc.order : 0) });
                        changes = true;
                    }
                } else {
                    (rc.domains || []).forEach(rd => {
                        const domain = (typeof rd === 'string') ? rd : (rd.domain || '');
                        const nd = normalizeDomainName(domain);
                        if (!nd) return;
                        if (existing.has(nd)) return;
                        uc.domains = uc.domains || [];
                        uc.domains.push({ domain: domain, enabled: catDefaultEnabled });
                        // if remote provides an order and user category lacks one, set it
                        if (rc.order !== undefined && (typeof uc.order === 'undefined' || uc.order === null)) {
                            uc.order = rc.order;
                        }
                        existing.add(nd);
                        changes = true;
                    });
                }
            });

            if (changes) {
                await new Promise(resolve => chrome.storage.sync.set({ webPurgeConfig: userCfg }, resolve));
                // Only update metadata if remote version is newer than previously applied
                if (!lastApplied || compareVersions(remote.defaultsVersion, lastApplied) > 0) {
                    await new Promise(resolve => chrome.storage.local.set({ defaultsMeta: { appliedDefaultsVersion: remote.defaultsVersion, lastDefaultsFetchTime: Date.now() } }, resolve));
                }
                return { applied: true, version: remote.defaultsVersion };
            } else {
                // update meta only if remote version is newer than previously applied
                if (!lastApplied || compareVersions(remote.defaultsVersion, lastApplied) > 0) {
                    await new Promise(resolve => chrome.storage.local.set({ defaultsMeta: { appliedDefaultsVersion: remote.defaultsVersion, lastDefaultsFetchTime: Date.now() } }, resolve));
                    return { applied: false, version: remote.defaultsVersion, metaUpdated: true };
                }
                return { applied: false, version: remote.defaultsVersion };
            }
        } catch (e) {
            console.warn('mergeDefaultsAndSave failed', e);
            return { applied: false };
        }
    }

    function clearCategoriesUI() {
        categoriesContainer.innerHTML = '';
    }

    // domain validation using URL parsing: accepts hostnames or host:port
    function isValidDomain(d) {
        if (!d || typeof d !== 'string') return false;
        const s = d.trim();
        if (s.length === 0) return false;
        if (s.indexOf(' ') !== -1) return false;
        try {
            const candidate = (s.indexOf('://') === -1) ? ('https://' + s) : s;
            const u = new URL(candidate);
            const host = u.hostname || '';
            if (!host) return false;
            if (host.indexOf('.') === -1 && host !== 'localhost') return false;
            return true;
        } catch (e) {
            return false;
        }
    }

    function createDomainRow(domainEntry, defaultChecked, isEditable) {
        // domainEntry can be a string or an object { domain, enabled }
        let domainName = '';
        let enabled = defaultChecked !== undefined ? !!defaultChecked : true;
        if (typeof domainEntry === 'string') {
            domainName = domainEntry;
        } else if (domainEntry && typeof domainEntry === 'object') {
            domainName = domainEntry.domain || domainEntry.name || '';
            enabled = domainEntry.enabled !== undefined ? !!domainEntry.enabled : enabled;
        }

        const div = document.createElement('div');
        div.className = 'domain-row';

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = enabled;
        checkbox.className = 'domain-enabled';

        if (isEditable) {
            const input = document.createElement('input');
            input.type = 'text';
            input.value = domainName || '';
            input.placeholder = t('example_placeholder') || 'example.com';
            input.className = 'domain-input';

            const remove = document.createElement('span');
            remove.className = 'remove-icon';
            remove.textContent = '🗑️';
            remove.title = t('delete_domain') || 'Delete domain';
            remove.addEventListener('click', () => {
                const parent = div.parentElement;
                div.remove();
                try { if (parent) parent.dispatchEvent(new Event('change')); } catch (e) { }
            });

            div.appendChild(checkbox);
            div.appendChild(input);
            div.appendChild(remove);
        } else {
            const span = document.createElement('span');
            span.className = 'domain-text';
            span.textContent = domainName || '';
            div.appendChild(checkbox);
            div.appendChild(span);
        }
        return div;
    }

    function t(key) {
        try { return chrome.i18n.getMessage(key) || key; } catch (e) { return key; }
    }

    // Build a prioritized list of preferred languages (e.g. ['es','en']).
    // Initialize synchronously from getUILanguage/navigator so render uses correct language immediately.
    let preferredLangs = ['en'];
    try {
        if (chrome && chrome.i18n && typeof chrome.i18n.getUILanguage === 'function') {
            const ui = chrome.i18n.getUILanguage();
            if (ui) preferredLangs = [ui.split('-')[0]];
        } else if (navigator.languages && Array.isArray(navigator.languages) && navigator.languages.length) {
            preferredLangs = navigator.languages.map(a => (a || '').split('-')[0]).filter(Boolean);
        } else {
            const nav = (navigator.language || navigator.userLanguage || 'en');
            preferredLangs = [nav.split('-')[0]];
        }

        // Asynchronously ask for accept-languages and update if different; re-render categories.
        if (chrome && chrome.i18n && typeof chrome.i18n.getAcceptLanguages === 'function') {
            try {
                chrome.i18n.getAcceptLanguages((arr) => {
                    if (!arr || !Array.isArray(arr) || !arr.length) return;
                    const newPrefs = arr.map(a => (a || '').split('-')[0]).filter(Boolean);
                    const same = (newPrefs.length === preferredLangs.length && newPrefs.every((v, i) => v === preferredLangs[i]));
                    if (!same) {
                        preferredLangs = newPrefs;
                        try { if (currentConfig) renderCategories(currentConfig); } catch (e) { /* ignore */ }
                    }
                });
            } catch (e) { /* ignore async accept-languages */ }
        }
    } catch (e) { preferredLangs = ['en']; }

    // track last loaded config so we can re-render if languages update
    let currentConfig = null;

    function renderCategories(config) {
        clearCategoriesUI();
        // sort categories by `order` (default 0) so sensitive/custom can be forced to penultimate/last
        const cats = (config.categories || []).slice().sort((a, b) => (Number(a.order || 0) - Number(b.order || 0)));
        cats.forEach(category => {
            const section = document.createElement('section');
            section.className = 'category';

            const header = document.createElement('div');
            header.className = 'category-header';

            const arrow = document.createElement('span');
            arrow.className = 'category-arrow';
            // always start collapsed
            arrow.textContent = '▸';

            const toggle = document.createElement('input');
            toggle.type = 'checkbox';
            toggle.className = 'category-enabled';
            toggle.dataset.id = category.id;

            const emojiSpan = document.createElement('span');
            emojiSpan.className = 'category-emoji';
            emojiSpan.textContent = category.emoji || '';

            const titleSpan = document.createElement('span');
            titleSpan.className = 'category-title';
            // Prefer explicit i18n messages when available (we only add `category_custom_domains` in _locales),
            // otherwise fall back to the per-category label from the defaults JSON.
            // Resolve category title with robust fallbacks:
            // 1) i18n message `category_<id>` if present
            // 2) `category.label` when it's a string or object, try exact lang (es, pt),
            //    then keys that start with the lang (es_ES), then `en`, then first available.
            function resolveCategoryTitle(cat) {
                try {
                    if (chrome && chrome.i18n && typeof chrome.i18n.getMessage === 'function') {
                        const i18nKey = 'category_' + cat.id;
                        const msg = chrome.i18n.getMessage(i18nKey) || '';
                        if (msg) return msg;
                    }
                } catch (e) { /* ignore i18n errors */ }

                const l = cat.label;
                if (!l) return cat.id;
                if (typeof l === 'string') return l;

                // try preferred languages in order, and also check navigator/document signals
                try {
                    const keys = Object.keys(l || {});
                    const extraPrefs = [];
                    try {
                        if (navigator && navigator.languages && navigator.languages.length) {
                            extraPrefs.push(...navigator.languages.map(a => (a || '').split('-')[0]).filter(Boolean));
                        }
                    } catch (e) { }
                    try {
                        const docLang = (document && document.documentElement && document.documentElement.lang) ? document.documentElement.lang.split('-')[0] : null;
                        if (docLang) extraPrefs.push(docLang);
                    } catch (e) { }
                    try {
                        if (chrome && chrome.i18n && typeof chrome.i18n.getUILanguage === 'function') {
                            const ui = chrome.i18n.getUILanguage();
                            if (ui) extraPrefs.push(ui.split('-')[0]);
                        }
                    } catch (e) { }

                    const combined = Array.from(new Set([...(preferredLangs || []), ...extraPrefs]));
                    for (const p of combined) {
                        if (typeof l[p] === 'string' && l[p].length) return l[p];
                    }
                    // try exact matches against label keys (case-insensitive)
                    for (const k of keys) {
                        for (const p of combined) {
                            if (k.toLowerCase() === p.toLowerCase()) return l[k];
                        }
                    }
                    // try regional variants like 'es_ES' that start with preferred lang
                    for (const k of keys) {
                        for (const p of combined) {
                            if (k.toLowerCase().startsWith((p || '').toLowerCase() + '_')) return l[k];
                        }
                    }
                    if (typeof l.en === 'string' && l.en.length) return l.en;
                    if (keys.length) return l[keys[0]];
                } catch (e) { /* ignore */ }

                return cat.id;
            }

            titleSpan.textContent = resolveCategoryTitle(category);

            // assemble header: arrow, checkbox, emoji, title
            header.appendChild(arrow);
            header.appendChild(toggle);
            header.appendChild(emojiSpan);
            header.appendChild(titleSpan);

            // when toggling category checkbox, mark/unmark all domain checkboxes
            toggle.addEventListener('change', () => {
                try {
                    const rows = Array.from(domainsContainer.querySelectorAll('.domain-row'));
                    rows.forEach(r => {
                        const cb = r.querySelector('.domain-enabled');
                        if (cb) cb.checked = !!toggle.checked;
                    });
                    // update indeterminate state
                    toggle.indeterminate = false;
                } catch (e) { /* ignore */ }
            });

            const body = document.createElement('div');
            body.className = 'category-body';
            // start all categories collapsed
            body.style.display = 'none';

            const domainsContainer = document.createElement('div');
            domainsContainer.className = 'domains-container';
            // indent domains visually
            domainsContainer.style.paddingLeft = '26px';
            domainsContainer.style.display = 'flex';
            domainsContainer.style.flexDirection = 'column';
            // sort domains alphabetically for display
            const domainsList = (category.domains || []).slice().sort((a, b) => {
                const aStr = (typeof a === 'string') ? a : (a.domain || '');
                const bStr = (typeof b === 'string') ? b : (b.domain || '');
                return aStr.toLowerCase().localeCompare(bStr.toLowerCase());
            });
            domainsList.forEach(d => {
                // editable only for custom_domains
                const isCustom = (category.id === 'custom_domains');
                // pass category enabled as defaultChecked so string-domain entries inherit it
                const row = createDomainRow(d, !!category.enabled, isCustom);
                domainsContainer.appendChild(row);
            });

            // Determine category checkbox state from domain checkboxes if domains exist
            (function syncCategoryToggleState() {
                try {
                    const rows = Array.from(domainsContainer.querySelectorAll('.domain-row'));
                    if (rows.length === 0) {
                        // no domains: for custom category disable the checkbox, otherwise
                        // fall back to category.enabled
                        if (category.id === 'custom_domains') {
                            toggle.checked = false;
                            toggle.indeterminate = false;
                            toggle.disabled = true;
                        } else {
                            toggle.checked = !!category.enabled;
                            toggle.indeterminate = false;
                            toggle.disabled = false;
                        }
                        return;
                    }
                    let total = 0, enabledCount = 0;
                    rows.forEach(r => {
                        const cb = r.querySelector('.domain-enabled');
                        if (!cb) return;
                        total += 1;
                        if (cb.checked) enabledCount += 1;
                    });
                    if (enabledCount === 0) {
                        toggle.checked = false;
                        toggle.indeterminate = false;
                    } else if (enabledCount === total) {
                        toggle.checked = true;
                        toggle.indeterminate = false;
                    } else {
                        toggle.checked = false;
                        toggle.indeterminate = true;
                    }
                } catch (e) { /* ignore */ }
            })();

            // Update category checkbox when any domain checkbox changes
            domainsContainer.addEventListener('change', (e) => {
                try {
                    const rows = Array.from(domainsContainer.querySelectorAll('.domain-row'));
                    let total = 0, enabledCount = 0;
                    rows.forEach(r => {
                        const cb = r.querySelector('.domain-enabled');
                        if (!cb) return;
                        total += 1;
                        if (cb.checked) enabledCount += 1;
                    });
                    // when there are no rows, custom category checkbox should be disabled
                    if (rows.length === 0 && category.id === 'custom_domains') {
                        toggle.checked = false;
                        toggle.indeterminate = false;
                        toggle.disabled = true;
                    } else if (enabledCount === 0) {
                        toggle.checked = false;
                        toggle.indeterminate = false;
                        toggle.disabled = false;
                    } else if (enabledCount === total) {
                        toggle.checked = true;
                        toggle.indeterminate = false;
                        toggle.disabled = false;
                    } else {
                        toggle.checked = false;
                        toggle.indeterminate = true;
                        toggle.disabled = false;
                    }
                } catch (e) { /* ignore */ }
            });

            // only custom category has add button and editable inputs
            if (category.id === 'custom_domains') {
                const addBtn = document.createElement('button');
                addBtn.type = 'button';
                addBtn.className = 'add-domain-btn';
                addBtn.textContent = '+ ' + (addDomainText || 'Add domain');
                addBtn.addEventListener('click', () => {
                    const newRow = createDomainRow('', true, true);
                    domainsContainer.appendChild(newRow);
                    // trigger change on the newly added checkbox so the category state updates
                    try {
                        const cb = newRow.querySelector('.domain-enabled');
                        if (cb) cb.dispatchEvent(new Event('change', { bubbles: true }));
                    } catch (e) { }
                });
                // small gap between title and first domain
                domainsContainer.style.marginTop = '6px';
                body.appendChild(domainsContainer);
                body.appendChild(addBtn);
            } else {
                body.appendChild(domainsContainer);
            }

            section.appendChild(header);
            section.appendChild(body);
            categoriesContainer.appendChild(section);

            // clicking header toggles collapse (ignore clicks on the checkbox)
            header.addEventListener('click', (e) => {
                if (e.target && e.target.classList && e.target.classList.contains('category-enabled')) return;
                if (body.style.display === 'none') {
                    body.style.display = 'block';
                    arrow.textContent = '▾';
                } else {
                    body.style.display = 'none';
                    arrow.textContent = '▸';
                }
            });

            // when toggling category enabled, do not auto-expand/collapse body;
            // do not change the arrow direction here — header clicks control collapse.
        });
    }

    function loadConfig() {
        chrome.storage.sync.get('webPurgeConfig', function (data) {
            let cfg = data.webPurgeConfig;
            if (!cfg) {
                // Do not persist the in-memory default here. The options page will
                // display `defaultConfig` when no stored config exists, but writing
                // it immediately can create stale/fallback configs (schema version 1).
                cfg = defaultConfig;
            }
            autoCleanToggle.checked = !!(cfg.behavior && cfg.behavior.autoCleanOnStartup);
            historyLookbackInput.value = (cfg.behavior && cfg.behavior.historyLookbackDays) || 7;
            // localize static labels
            try {
                // Set title with gear emoji, remove duplicate subtitle
                const name = chrome.i18n.getMessage('extension_name') || 'Web Purge';
                const titleEl = document.getElementById('app-title');
                // show plain extension name beside the logo; the gear belongs in the
                // options/title area instead (see categories-title below)
                if (titleEl) titleEl.textContent = name;
                try { document.title = chrome.i18n.getMessage('options_title') || name; } catch (e) { }
                // clear subtitle (we no longer show duplicate name)
                try { const subtitleEl = document.getElementById('app-subtitle'); if (subtitleEl) subtitleEl.textContent = ''; } catch (e) { }
                // set alt text for logo
                try { const logo = document.getElementById('options-logo'); if (logo) logo.alt = name; } catch (e) { }
                document.getElementById('categories-title').textContent = chrome.i18n.getMessage('options_title') || 'Categories';
                document.getElementById('behavior-title').textContent = chrome.i18n.getMessage('behavior_title') || 'Behavior';
                document.getElementById('actions-title').textContent = chrome.i18n.getMessage('actions_title') || 'Global Actions';
                // localized static labels
                const sessionWarning = document.getElementById('session-warning');
                if (sessionWarning) sessionWarning.textContent = t('session_warning');
                const autoLabel = document.getElementById('auto-clean-label');
                if (autoLabel) autoLabel.textContent = t('auto_clean_label');
                const historyLabelEl = document.getElementById('history-label');
                if (historyLabelEl) historyLabelEl.textContent = t('history_label');
                const historyInlineEl = document.getElementById('history-inline-note');
                const historyBlockEl = document.getElementById('history-note-block');
                if (historyInlineEl || historyBlockEl) {
                    const note = t('history_note') || '';
                    // split by first period into short and rest
                    const idx = note.indexOf('.');
                    if (idx !== -1) {
                        const first = note.slice(0, idx + 1).trim();
                        const rest = note.slice(idx + 1).trim();
                        if (historyInlineEl) historyInlineEl.textContent = first;
                        if (historyBlockEl) historyBlockEl.textContent = rest;
                    } else {
                        if (historyInlineEl) historyInlineEl.textContent = note;
                        if (historyBlockEl) historyBlockEl.textContent = '';
                    }
                }
            } catch (e) { }
            if (exportLabel) exportLabel.textContent = t('export_config');
            if (importLabel) importLabel.textContent = t('import_config');
            if (resetLabel) resetLabel.textContent = t('reset_defaults');
            if (saveLabel) saveLabel.textContent = t('save_label');

            // set version label from manifest
            try {
                const v = (chrome.runtime && chrome.runtime.getManifest) ? chrome.runtime.getManifest().version : null;
                const versionLabel = document.getElementById('version-label');
                if (versionLabel) versionLabel.textContent = v ? ("App Version: " + v) : '';
                const dataVersionLabel = document.getElementById('data-version-label');
                try {
                    chrome.storage.local.get('defaultsMeta', (res) => {
                        const meta = res && res.defaultsMeta ? res.defaultsMeta : null;
                        const dv = (meta && meta.appliedDefaultsVersion) ? meta.appliedDefaultsVersion : (DEFAULTS_VERSION || '');
                        if (dataVersionLabel) dataVersionLabel.textContent = (dv ? dv : '');
                    });
                } catch (e) {
                    if (dataVersionLabel) dataVersionLabel.textContent = (DEFAULTS_VERSION || '');
                }
            } catch (e) { }
            // Set categories/options title with gear emoji
            try {
                const catTitleEl = document.getElementById('categories-title');
                if (catTitleEl) catTitleEl.textContent = ('⚙️ ' + (chrome.i18n.getMessage('options_title') || 'Categories'));
            } catch (e) { }

            currentConfig = cfg;
            renderCategories(cfg);

            // Developer i18n key check: enable by setting localStorage.wp_dev_i18n_check = '1'
            (function i18nDevCheck() {
                try {
                    if (localStorage && localStorage.getItem && localStorage.getItem('wp_dev_i18n_check') === '1') {
                        const keys = [
                            'options_title', 'behavior_title', 'actions_title', 'add_domain', 'save_label', 'export_config', 'import_config', 'reset_defaults',
                            'force_defaults', 'revert_backup', 'example_placeholder', 'delete_domain', 'invalid_file', 'session_warning', 'auto_clean_label',
                            'history_label', 'history_note', 'data_version_label', 'defaults_applied', 'defaults_applied_remote', 'defaults_no_change',
                            'defaults_error', 'no_backups', 'backup_missing', 'backup_restored', 'backup_error', 'category_custom_domains'
                        ];
                        const missing = [];
                        if (chrome && chrome.i18n && typeof chrome.i18n.getMessage === 'function') {
                            keys.forEach(k => {
                                const msg = chrome.i18n.getMessage(k) || '';
                                if (!msg) missing.push(k);
                            });
                        }
                        if (missing.length) console.warn('Missing i18n keys (wp_dev_i18n_check):', missing);
                        else console.info('i18n dev check: all keys present');
                    }
                } catch (e) { /* ignore */ }
            })();
            // after render, first apply local defaults (from bundled options.json) if its version changed,
            // then fetch remote defaults and apply if any. Both use the same merge helper.
            const localDefaults = { defaultsVersion: (defaultConfig && defaultConfig.version) ? defaultConfig.version : DEFAULTS_VERSION, categories: defaultConfig.categories };
            mergeDefaultsAndSave(localDefaults).then(localRes => {
                if (localRes && localRes.version) {
                    try { showToast(`Defaults updated to ${localRes.version}`, 5000, 'info'); } catch (e) { }
                    const banner = document.getElementById('defaults-banner');
                    const bannerText = document.getElementById('defaults-banner-text');
                    const reviewBtn = document.getElementById('defaults-banner-review');
                    if (banner && bannerText) {
                        bannerText.textContent = `Defaults have been updated to ${localRes.version}.`;
                        if (reviewBtn) {
                            reviewBtn.style.display = 'inline-block';
                            reviewBtn.textContent = 'Dismiss';
                        }
                        // update UI data version immediately
                        try {
                            DEFAULTS_VERSION = localRes.version;
                            const dataVersionLabel = document.getElementById('data-version-label');
                            if (dataVersionLabel) dataVersionLabel.textContent = DEFAULTS_VERSION;
                        } catch (e) { }
                        banner.style.display = 'block';
                        if (reviewBtn) {
                            reviewBtn.onclick = () => {
                                // dismiss and ensure data version label shows applied version
                                try {
                                    const dataVersionLabel = document.getElementById('data-version-label');
                                    if (dataVersionLabel) dataVersionLabel.textContent = DEFAULTS_VERSION;
                                } catch (e) { }
                                banner.style.display = 'none';
                            };
                        }
                    }
                }
            }).catch(() => { /* ignore */ }).finally(() => {
                fetchAndApplyRemoteDefaultsIfAny().then(res => {
                    if (res && res.applied) {
                        try { showToast(`Defaults updated to ${res.version}`, 5000, 'info'); } catch (e) { }
                        const banner = document.getElementById('defaults-banner');
                        const bannerText = document.getElementById('defaults-banner-text');
                        const reviewBtn = document.getElementById('defaults-banner-review');
                        if (banner && bannerText) {
                            bannerText.textContent = `Defaults have been updated to ${res.version}.`;
                            if (reviewBtn) {
                                reviewBtn.style.display = 'inline-block';
                                reviewBtn.textContent = 'Dismiss';
                            }
                            // update UI data version immediately
                            try {
                                DEFAULTS_VERSION = res.version;
                                const dataVersionLabel = document.getElementById('data-version-label');
                                if (dataVersionLabel) dataVersionLabel.textContent = DEFAULTS_VERSION;
                            } catch (e) { }
                            banner.style.display = 'block';
                            if (reviewBtn) {
                                reviewBtn.onclick = () => {
                                    try { const dataVersionLabel = document.getElementById('data-version-label'); if (dataVersionLabel) dataVersionLabel.textContent = DEFAULTS_VERSION; } catch (e) { }
                                    banner.style.display = 'none';
                                };
                            }
                        }
                    }
                }).catch(() => { /* ignore */ });
            });
        });
    }

    function collectConfig() {
        const sections = Array.from(categoriesContainer.querySelectorAll('section.category'));
        const categories = sections.map(section => {
            const checkbox = section.querySelector('.category-enabled');
            const id = checkbox.dataset.id;
            const titleSpan = section.querySelector('.category-header span:last-of-type');
            const title = titleSpan ? titleSpan.textContent.trim() : id;
            const labelParts = title.split(' / ');
            const domainRows = Array.from(section.querySelectorAll('.domain-row'));
            const domains = domainRows.map(row => {
                const input = row.querySelector('.domain-input');
                const cb = row.querySelector('.domain-enabled');
                const textSpan = row.querySelector('.domain-text');
                const domainNameRaw = (input && input.value) ? input.value.trim() : (textSpan && textSpan.textContent ? textSpan.textContent.trim() : '');
                const domainName = isValidDomain(domainNameRaw) ? domainNameRaw : '';
                return { domain: domainName, enabled: !!(cb && cb.checked) };
            }).filter(d => d.domain && d.domain.length > 0);
            return {
                id,
                enabled: !!checkbox.checked,
                label: { en: labelParts[0] || id, es: labelParts[1] || labelParts[0] || id },
                domains
            };
        });

        return {
            version: 1,
            behavior: {
                autoCleanOnStartup: !!autoCleanToggle.checked,
                historyLookbackDays: Number(historyLookbackInput.value) || 7
            },
            categories
        };
    }



    form.addEventListener('submit', function (e) {
        e.preventDefault();
        const cfg = collectConfig();
        chrome.storage.sync.set({ webPurgeConfig: cfg }, function () {
            try {
                showToast(t('save_ok'), 3000, 'success');
            } catch (e) { showToast('Saved', 3000, 'success'); }
        });
    });

    exportButton.addEventListener('click', function () {
        chrome.storage.sync.get('webPurgeConfig', function (data) {
            const json = JSON.stringify(data.webPurgeConfig || defaultConfig, null, 2);
            const blob = new Blob([json], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'webPurgeConfig.json';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        });
    });

    importButton.addEventListener('click', function () {
        importInput.click();
    });

    importInput.addEventListener('change', function (event) {
        const file = event.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = function (ev) {
            try {
                const cfg = JSON.parse(ev.target.result);
                chrome.storage.sync.set({ webPurgeConfig: cfg }, function () {
                    showToast((t('import_config') || 'Import') + ' OK', 3000, 'success');
                    loadConfig();
                });
            } catch (e) {
                showToast(t('invalid_file') || 'Invalid file', 3500, 'error');
            }
        };
        reader.readAsText(file);
    });

    resetButton.addEventListener('click', async function () {
        try {
            // Replace the stored config with the canonical bundled defaults (force reset)
            const cfg = JSON.parse(JSON.stringify(defaultConfig || { version: DEFAULTS_VERSION || 1, categories: [] }));
            await new Promise(resolve => chrome.storage.sync.set({ webPurgeConfig: cfg }, resolve));
            // update applied defaults meta to reflect the bundled version
            const ver = cfg.version || DEFAULTS_VERSION || null;
            if (ver) {
                await new Promise(resolve => chrome.storage.local.set({ defaultsMeta: { appliedDefaultsVersion: ver, lastDefaultsFetchTime: Date.now() } }, resolve));
                DEFAULTS_VERSION = ver;
                try { const dataVersionLabel = document.getElementById('data-version-label'); if (dataVersionLabel) dataVersionLabel.textContent = DEFAULTS_VERSION; } catch (e) { }
            }
            showToast(t('reset_defaults') || 'Defaults restored', 3000, 'success');
            loadConfig();
        } catch (e) {
            showToast(t('reset_defaults') || 'Defaults restored', 3000, 'success');
            loadConfig();
        }
    });

    // showToast provided by shared script (src/shared/toast.js)

    // resize UI removed — use dev-run script flags

    // Load the default config from JSON, then determine defaults version and render UI
    loadDefaultConfigFromJson().then(async () => {
        try {
            const meta = await new Promise(resolve => chrome.storage.local.get('defaultsMeta', res => resolve(res.defaultsMeta || {})));
            const applied = meta.appliedDefaultsVersion || null;
            if (applied) {
                DEFAULTS_VERSION = applied;
            } else if (defaultConfig && defaultConfig.version) {
                DEFAULTS_VERSION = defaultConfig.version;
            } else {
                try {
                    DEFAULTS_VERSION = (chrome.runtime && chrome.runtime.getManifest) ? chrome.runtime.getManifest().version : '1.0.0';
                } catch (e) { DEFAULTS_VERSION = '1.0.0'; }
            }
        } catch (e) {
            try { DEFAULTS_VERSION = (chrome.runtime && chrome.runtime.getManifest) ? chrome.runtime.getManifest().version : '1.0.0'; } catch (e) { DEFAULTS_VERSION = '1.0.0'; }
        }
        loadConfig();
    });
});