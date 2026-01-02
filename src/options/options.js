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

    // `defaultConfig` will be loaded from `src/options/options.json` at runtime.
    let defaultConfig = null;

    function loadDefaultConfigFromJson() {
        const url = chrome.runtime.getURL('src/options/options.json');
        return fetch(url).then(r => {
            if (!r.ok) throw new Error('Failed to load options.json');
            return r.json();
        }).then(data => {
            defaultConfig = {
                version: data.defaultsVersion || 1,
                remoteDefaultsUrl: data.remoteDefaultsUrl || '',
                behavior: (data.behavior || { autoCleanOnStartup: false, historyLookbackDays: 7 }),
                ui: (data.ui || { showSensitiveCategory: true }),
                categories: (data.categories || [])
            };
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
            if (!defaultConfig || !defaultConfig.remoteDefaultsUrl) return { applied: false };
            const url = defaultConfig.remoteDefaultsUrl;
            // placeholder check
            if (url.indexOf('YOUR_HOST') !== -1) return { applied: false };

            const resp = await fetch(url, { cache: 'no-cache' });
            if (!resp.ok) return { applied: false };
            const remote = await resp.json();
            if (!remote || !remote.defaultsVersion) return { applied: false };

            // load meta about last applied defaults
            const meta = await new Promise(resolve => chrome.storage.local.get('defaultsMeta', res => resolve(res.defaultsMeta || {})));
            const lastApplied = meta.appliedDefaultsVersion || null;
            if (lastApplied && (lastApplied === remote.defaultsVersion)) return { applied: false };

            // validate minimal shape
            if (!Array.isArray(remote.categories)) return { applied: false };

            // merge remote defaults into current stored config
            const stored = await new Promise(resolve => chrome.storage.sync.get('webPurgeConfig', res => resolve(res.webPurgeConfig || null)));
            let userCfg = stored || defaultConfig;

            // backup
            try {
                const now = Date.now();
                await new Promise(resolve => chrome.storage.local.set({ ['backup_' + now]: userCfg }, resolve));
            } catch (e) { /* ignore */ }

            // Build maps for easy lookup
            const userById = {};
            (userCfg.categories || []).forEach(c => { userById[c.id] = c; });

            let changes = false;
            remote.categories.forEach(rc => {
                const rid = rc.id;
                if (!userById[rid]) {
                    // new category: add entirely
                    userCfg.categories = userCfg.categories || [];
                    userCfg.categories.push(JSON.parse(JSON.stringify(rc)));
                    changes = true;
                } else {
                    // existing category: merge domains non-destructively
                    const uc = userById[rid];
                    const ucDomains = (uc.domains || []).map(d => (typeof d === 'string' ? d : (d.domain || '')));
                    (rc.domains || []).forEach(rd => {
                        const rdDomain = (typeof rd === 'string') ? rd : (rd.domain || '');
                        if (!rdDomain) return;
                        if (!ucDomains.includes(rdDomain)) {
                            uc.domains = uc.domains || [];
                            // add with default enabled state from remote if present
                            if (typeof rd === 'string') uc.domains.push({ domain: rdDomain, enabled: true });
                            else uc.domains.push({ domain: rdDomain, enabled: !!rd.enabled });
                            changes = true;
                        }
                    });
                }
            });

            if (changes) {
                // save merged config and update meta
                await new Promise(resolve => chrome.storage.sync.set({ webPurgeConfig: userCfg }, resolve));
                await new Promise(resolve => chrome.storage.local.set({ defaultsMeta: { appliedDefaultsVersion: remote.defaultsVersion, lastDefaultsFetchTime: Date.now() } }, resolve));
                return { applied: true, version: remote.defaultsVersion };
            } else {
                // still update meta so we don't refetch repeatedly
                await new Promise(resolve => chrome.storage.local.set({ defaultsMeta: { appliedDefaultsVersion: remote.defaultsVersion, lastDefaultsFetchTime: Date.now() } }, resolve));
                return { applied: false };
            }
        } catch (e) {
            console.warn('Remote defaults fetch failed', e);
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
            remove.addEventListener('click', () => div.remove());

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

    // Prefer the extension UI language from chrome.i18n when available
    let lang = 'en';
    try {
        const ui = chrome.i18n.getUILanguage && chrome.i18n.getUILanguage();
        if (ui) lang = ui.split('-')[0];
        else lang = (navigator.language || 'en').split('-')[0];
    } catch (e) {
        lang = (navigator.language || 'en').split('-')[0];
    }

    function renderCategories(config) {
        clearCategoriesUI();
        config.categories.forEach(category => {
            const section = document.createElement('section');
            section.className = 'category';
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.checked = !!category.enabled;
            checkbox.dataset.id = category.id;
            checkbox.className = 'category-checkbox category-enabled';

            const domainsList = document.createElement('div');
            domainsList.className = 'domains-list';
            domainsList.style.display = 'none';
            (category.domains || []).forEach(d => {
                const isCustom = category.id === 'custom_domains';
                domainsList.appendChild(createDomainRow(d, !!category.enabled, isCustom));
            });

            // When category checkbox toggles, update all child domain checkboxes
            checkbox.addEventListener('change', () => {
                const checked = !!checkbox.checked;
                const domainCheckboxes = domainsList.querySelectorAll('.domain-enabled');
                domainCheckboxes.forEach(cb => { cb.checked = checked; });
            });

            // Add button only for custom category
            let addBtn = null;
            if (category.id === 'custom_domains') {
                addBtn = document.createElement('button');
                addBtn.type = 'button';
                addBtn.className = 'button';
                addBtn.innerHTML = '➕ ' + addDomainText;
                addBtn.addEventListener('click', () => {
                    // expand if not expanded
                    if (domainsList.style.display !== 'block') {
                        domainsList.style.display = 'block';
                        arrow.textContent = '▼';
                    }
                    domainsList.appendChild(createDomainRow('', !!checkbox.checked, true));
                });
            }

            // header: arrow + checkbox + icon + title
            const header = document.createElement('div');
            header.className = 'category-header';

            const arrow = document.createElement('span');
            arrow.className = 'arrow';
            arrow.textContent = '▶';
            arrow.addEventListener('click', () => {
                const expanded = domainsList.style.display === 'block';
                domainsList.style.display = expanded ? 'none' : 'block';
                arrow.textContent = expanded ? '▶' : '▼';
            });

            const iconSpan = document.createElement('span');
            const icons = {
                trackers_ads: '🕵️',
                social_networks: '👥',
                sensitive_sites: '⚠️',
                custom_domains: '✳️'
            };
            iconSpan.textContent = category.emoji || icons[category.id] || '•';
            iconSpan.className = 'category-icon';

            const titleText = document.createElement('span');
            // Resolve category label with priority:
            // 1) chrome.i18n message `category_<id>` (preferred)
            // 2) category.label[lang]
            // 3) category.label.en
            // 4) category.id
            let titleLabel = category.id;
            try {
                const i18nKey = 'category_' + category.id;
                const i18nMsg = (chrome.i18n && chrome.i18n.getMessage) ? chrome.i18n.getMessage(i18nKey) : '';
                if (i18nMsg && i18nMsg !== i18nKey && i18nMsg.trim() !== '') {
                    // Use chrome.i18n value if available
                    titleLabel = i18nMsg;
                } else if (category.label) {
                    // Prefer language-specific label from the category data
                    if (typeof category.label === 'string') titleLabel = category.label;
                    else titleLabel = category.label[lang] || category.label.en || Object.values(category.label)[0] || category.id;
                } else {
                    titleLabel = category.id;
                }
            } catch (e) {
                titleLabel = (category.label && (category.label[lang] || category.label.en)) || category.id;
            }
            titleText.textContent = ` ${titleLabel}`;

            header.appendChild(arrow);
            header.appendChild(checkbox);
            header.appendChild(iconSpan);
            header.appendChild(titleText);

            section.appendChild(header);
            section.appendChild(domainsList);
            if (addBtn) section.appendChild(addBtn);
            categoriesContainer.appendChild(section);
        });
    }

    function loadConfig() {
        chrome.storage.sync.get('webPurgeConfig', function (data) {
            let cfg = data.webPurgeConfig;
            if (!cfg) {
                cfg = defaultConfig;
                chrome.storage.sync.set({ webPurgeConfig: cfg });
            }
            autoCleanToggle.checked = !!(cfg.behavior && cfg.behavior.autoCleanOnStartup);
            historyLookbackInput.value = (cfg.behavior && cfg.behavior.historyLookbackDays) || 7;
            // localize static labels
            try {
                // Set title with gear emoji, remove duplicate subtitle
                const name = chrome.i18n.getMessage('extension_name') || 'Web Purge';
                const titleEl = document.getElementById('app-title');
                if (titleEl) titleEl.textContent = '⚙️ ' + name;
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
                if (versionLabel) versionLabel.textContent = v ? ("Version: " + v) : '';
            } catch (e) { }
            renderCategories(cfg);
            // after render, attempt to fetch remote defaults and apply if any
            fetchAndApplyRemoteDefaultsIfAny().then(res => {
                if (res && res.applied) {
                    // notify user to review changes
                    try { showToast(`Defaults updated to ${res.version}`, 5000, 'info'); } catch (e) { }
                    const banner = document.getElementById('defaults-banner');
                    const bannerText = document.getElementById('defaults-banner-text');
                    const reviewBtn = document.getElementById('defaults-banner-review');
                    if (banner && bannerText) {
                        bannerText.textContent = `Defaults have been updated to ${res.version}.`;
                        if (reviewBtn) reviewBtn.style.display = 'inline-block';
                        banner.style.display = 'block';
                        reviewBtn.addEventListener('click', () => { loadConfig(); banner.style.display = 'none'; });
                    }
                }
            }).catch(() => { /* ignore */ });
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

    resetButton.addEventListener('click', function () {
        chrome.storage.sync.set({ webPurgeConfig: defaultConfig }, function () {
            showToast(t('reset_defaults') || 'Defaults restored', 3000, 'success');
            loadConfig();
        });
    });

    // showToast provided by shared script (src/shared/toast.js)

    // resize UI removed — use dev-run script flags

    // Load the default config from JSON, then render UI from stored config or defaults
    loadDefaultConfigFromJson().then(() => {
        loadConfig();
    });
});