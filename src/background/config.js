const CONFIG_KEY = 'webPurgeConfig';

function storageSyncGet(key) {
    return new Promise((resolve) => {
        try {
            chrome.storage.sync.get(key, (res) => resolve(res || {}));
        } catch (e) {
            resolve({});
        }
    });
}

function storageSyncSet(obj) {
    return new Promise((resolve) => {
        try {
            chrome.storage.sync.set(obj, () => resolve());
        } catch (e) {
            resolve();
        }
    });
}

function storageLocalGet(key) {
    return new Promise((resolve) => {
        try {
            chrome.storage.local.get(key, (res) => resolve(res || {}));
        } catch (e) {
            resolve({});
        }
    });
}

function storageLocalSet(obj) {
    return new Promise((resolve) => {
        try {
            chrome.storage.local.set(obj, () => resolve());
        } catch (e) {
            resolve();
        }
    });
}

function storageLocalRemove(keys) {
    return new Promise((resolve) => {
        try {
            chrome.storage.local.remove(keys, () => resolve());
        } catch (e) {
            resolve();
        }
    });
}

self.loadConfig = async () => {
    const result = await storageSyncGet(CONFIG_KEY);
    let cfg = result[CONFIG_KEY] || initializeDefaultConfig();

    // Basic normalization and validation to ensure new format:
    // - behavior.historyLookbackDays exists
    // - categories[].domains is an array of { domain, enabled }
    let changed = false;

    cfg.behavior = cfg.behavior || {};
    if (typeof cfg.behavior.historyLookbackDays === 'undefined') {
        cfg.behavior.historyLookbackDays = 7;
        changed = true;
    }

    cfg.categories = Array.isArray(cfg.categories) ? cfg.categories : [];
    cfg.categories = cfg.categories.map(category => {
        const c = Object.assign({}, category);
        c.enabled = !!c.enabled;
        c.label = c.label || { en: c.id || '', es: c.id || '' };
        c.description = c.description || { en: '', es: '' };

        const rawDomains = Array.isArray(c.domains) ? c.domains : [];
        const normalized = rawDomains.map(d => {
            if (!d) return null;
            if (typeof d === 'string') {
                // default enabled to category.enabled
                changed = true;
                return { domain: d, enabled: !!c.enabled };
            }
            if (typeof d === 'object') {
                const domainName = d.domain || d.name || '';
                const enabled = (typeof d.enabled === 'undefined') ? !!c.enabled : !!d.enabled;
                if (domainName !== d.domain || typeof d.enabled === 'undefined') changed = true;
                return { domain: domainName, enabled };
            }
            return null;
        }).filter(Boolean);

        if (JSON.stringify(normalized) !== JSON.stringify(c.domains)) changed = true;
        c.domains = normalized;
        return c;
    });

    if (changed) {
        try {
            // Create a rotating backup (keep last 5) in local storage
            try {
                const backupsIndexKey = 'webPurgeConfig_backups';
                const existing = await storageLocalGet(backupsIndexKey);
                const index = Array.isArray(existing[backupsIndexKey]) ? existing[backupsIndexKey] : [];
                const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                const backupKey = `webPurgeConfig_backup_${timestamp}`;
                const original = result[CONFIG_KEY] || null;
                if (original) {
                    await storageLocalSet({ [backupKey]: original });
                    index.push(backupKey);
                    // keep only last 5
                    while (index.length > 5) {
                        const old = index.shift();
                        await storageLocalRemove(old);
                    }
                    await storageLocalSet({ [backupsIndexKey]: index });
                }
            } catch (e) {
                // ignore backup errors
            }

            await storageSyncSet({ [CONFIG_KEY]: cfg });
        } catch (e) {
            // ignore storage errors during normalization
        }
    }

    return cfg;
};

self.saveConfig = async (config) => {
    await storageSyncSet({ [CONFIG_KEY]: config });
};

const initializeDefaultConfig = () => {
    return {
        version: 1,
        behavior: {
            // default: do NOT auto-clean on startup to avoid unexpected deletes
            autoCleanOnStartup: false,
            historyLookbackDays: 7
        },
        ui: {
            showSensitiveCategory: true
        },
        categories: [
            {
                id: "trackers_ads",
                enabled: true,
                label: {
                    en: "Trackers / Ads",
                    es: "Trackers / Publicidad"
                },
                description: {
                    en: "Common ad and analytics domains.",
                    es: "Dominios comunes de anuncios y analítica."
                },
                domains: [
                    { domain: "doubleclick.net", enabled: true },
                    { domain: "googlesyndication.com", enabled: true },
                    { domain: "google-analytics.com", enabled: true },
                    { domain: "googletagmanager.com", enabled: true },
                    { domain: "googletagservices.com", enabled: true },
                    { domain: "adsystem.com", enabled: true },
                    { domain: "adnxs.com", enabled: true },
                    { domain: "criteo.com", enabled: true },
                    { domain: "scorecardresearch.com", enabled: true },
                    { domain: "taboola.com", enabled: true },
                    { domain: "outbrain.com", enabled: true }
                ]
            },
            {
                id: "social_networks",
                enabled: true,
                label: {
                    en: "Social Networks",
                    es: "Redes Sociales"
                },
                description: {
                    en: "Major social platforms.",
                    es: "Plataformas sociales principales."
                },
                domains: [
                    { domain: "facebook.com", enabled: true },
                    { domain: "fb.com", enabled: true },
                    { domain: "messenger.com", enabled: true },
                    { domain: "instagram.com", enabled: true },
                    { domain: "threads.net", enabled: true },
                    { domain: "tiktok.com", enabled: true },
                    { domain: "x.com", enabled: true },
                    { domain: "twitter.com", enabled: true },
                    { domain: "linkedin.com", enabled: true },
                    { domain: "reddit.com", enabled: true },
                    { domain: "pinterest.com", enabled: true }
                ]
            },
            {
                id: "sensitive_sites",
                enabled: false,
                label: {
                    en: "Sensitive Sites",
                    es: "Sitios Sensibles"
                },
                description: {
                    en: "Privacy cleanup for sensitive websites.",
                    es: "Limpieza de privacidad para sitios sensibles."
                },
                domains: [
                    { domain: "pornhub.com", enabled: false },
                    { domain: "xvideos.com", enabled: false },
                    { domain: "xnxx.com", enabled: false },
                    { domain: "redtube.com", enabled: false },
                    { domain: "youporn.com", enabled: false },
                    { domain: "onlyfans.com", enabled: false }
                ]
            }
        ]
    };
};
