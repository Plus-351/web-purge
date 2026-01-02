// src/background/service_worker.js

// src/background/service_worker.js

// Load helper scripts (cleanup, config) into the worker scope
try {
    importScripts('cleanup.js', 'config.js');
} catch (e) {
    // importScripts may fail in some contexts; the files should be available in the same folder
    console.error('Failed to import background scripts:', e);
}

chrome.runtime.onInstalled.addListener(async () => {
    // installation event
    // Optionally perform initial run or setup here
    try {
        const cfg = await self.loadConfig();
        if (cfg.behavior && cfg.behavior.autoCleanOnStartup) {
            await self.cleanAllEnabledTargets(cfg);
        } else {
            // If auto-clean is disabled, open the options page so the user can review configuration
            try {
                if (chrome.runtime.openOptionsPage) chrome.runtime.openOptionsPage();
            } catch (e) {
                console.warn('Could not open options page on install:', e);
            }
        }
    } catch (e) {
        console.error('Startup install task failed:', e);
    }
});

// Periodic defaults check: fetch remote/local defaults and merge non-destructively
const DEFAULTS_CHECK_ALARM = 'defaults-check';
const DEFAULTS_CHECK_PERIOD_MINUTES = 30 * 24 * 60; // 30 days

function normalizeDomainName(d) {
    if (!d) return '';
    const raw = (typeof d === 'string') ? d : (d.domain || '');
    let s = raw.trim().toLowerCase();
    if (s.startsWith('*.')) s = s.slice(2);
    if (s.indexOf('://') !== -1) {
        try { s = (new URL(s)).hostname; } catch (e) { }
    }
    if (s.indexOf(':') !== -1) s = s.split(':')[0];
    return s;
}

async function applyDefaultsObject(defaultsObj) {
    try {
        if (!defaultsObj || !Array.isArray(defaultsObj.categories)) return { applied: false };
        const remoteVersion = defaultsObj.defaultsVersion || defaultsObj.version || null;
        const meta = await storageLocalGet('defaultsMeta');
        const lastApplied = (meta && meta.defaultsMeta && meta.defaultsMeta.appliedDefaultsVersion) ? meta.defaultsMeta.appliedDefaultsVersion : null;
        if (lastApplied && remoteVersion && lastApplied === remoteVersion) return { applied: false };

        const cfg = await self.loadConfig();

        // backup current config
        try {
            const now = Date.now();
            await storageLocalSet({ ['backup_' + now]: cfg });
        } catch (e) { /* ignore */ }

        const existing = new Set();
        (cfg.categories || []).forEach(c => {
            (c.domains || []).forEach(d => existing.add(normalizeDomainName(d)));
        });

        let changed = false;

        defaultsObj.categories.forEach(rc => {
            const rid = rc.id;
            let uc = (cfg.categories || []).find(c => c.id === rid);
            if (!uc) {
                const newDomains = [];
                (rc.domains || []).forEach(rd => {
                    const domain = (typeof rd === 'string') ? rd : (rd.domain || '');
                    const nd = normalizeDomainName(domain);
                    if (!nd) return;
                    if (existing.has(nd)) return;
                    existing.add(nd);
                    newDomains.push({ domain: domain, enabled: !!(typeof rd === 'object' ? (rd.enabled !== undefined ? rd.enabled : true) : true) });
                });
                if (newDomains.length > 0) {
                    cfg.categories = cfg.categories || [];
                    cfg.categories.push({ id: rc.id, enabled: rc.enabled !== undefined ? !!rc.enabled : true, emoji: rc.emoji || rc.icon || '', label: rc.label || {}, domains: newDomains });
                    changed = true;
                }
            } else {
                (rc.domains || []).forEach(rd => {
                    const domain = (typeof rd === 'string') ? rd : (rd.domain || '');
                    const nd = normalizeDomainName(domain);
                    if (!nd) return;
                    if (existing.has(nd)) return;
                    uc.domains = uc.domains || [];
                    uc.domains.push({ domain: domain, enabled: !!(typeof rd === 'object' ? (rd.enabled !== undefined ? rd.enabled : true) : true) });
                    existing.add(nd);
                    changed = true;
                });
            }
        });

        if (changed) {
            await storageSyncSet({ webPurgeConfig: cfg });
            await storageLocalSet({ defaultsMeta: { appliedDefaultsVersion: remoteVersion, lastDefaultsFetchTime: Date.now() } });
            return { applied: true, version: remoteVersion };
        } else {
            await storageLocalSet({ defaultsMeta: { appliedDefaultsVersion: remoteVersion, lastDefaultsFetchTime: Date.now() } });
            return { applied: false };
        }
    } catch (e) {
        console.warn('applyDefaultsObject failed', e);
        return { applied: false };
    }
}

async function fetchAndApplyDefaultsUrl(url) {
    try {
        if (!url || url.indexOf('YOUR_HOST') !== -1) return { applied: false };
        const resp = await fetch(url, { cache: 'no-cache' });
        if (!resp.ok) return { applied: false };
        const json = await resp.json();
        return await applyDefaultsObject(json);
    } catch (e) {
        console.warn('fetchAndApplyDefaultsUrl failed', e);
        return { applied: false };
    }
}

// Ensure periodic alarm exists
function ensureDefaultsAlarm() {
    try {
        chrome.alarms.get(DEFAULTS_CHECK_ALARM, (a) => {
            if (!a) chrome.alarms.create(DEFAULTS_CHECK_ALARM, { periodInMinutes: DEFAULTS_CHECK_PERIOD_MINUTES });
        });
    } catch (e) { /* ignore */ }
}

chrome.alarms.onAlarm.addListener((alarm) => {
    if (!alarm || alarm.name !== DEFAULTS_CHECK_ALARM) return;
    // try remote fetch
    fetchAndApplyDefaultsUrl('https://Plus-351.github.io/web-purge/web-purge-defaults.json').then(res => {
        if (res && res.applied) console.info('Periodic defaults applied', res.version);
    }).catch(() => { /* ignore */ });
});

// Run checks on install/update and on startup
chrome.runtime.onInstalled.addListener(async (details) => {
    try {
        // apply bundled local defaults first
        try {
            const url = chrome.runtime.getURL('src/options/options.json');
            const r = await fetch(url);
            if (r.ok) {
                const local = await r.json();
                // ensure local has a version field for comparison
                if (!local.defaultsVersion && !local.version) local.version = (chrome.runtime.getManifest && chrome.runtime.getManifest().version) || null;
                await applyDefaultsObject(local);
            }
        } catch (e) { /* ignore */ }

        // on update/install, ensure alarm exists and run a remote check immediately
        ensureDefaultsAlarm();
        fetchAndApplyDefaultsUrl('https://Plus-351.github.io/web-purge/web-purge-defaults.json').then(() => {}).catch(() => {});
    } catch (e) { /* ignore */ }
});

chrome.runtime.onStartup.addListener(async () => {
    try {
        ensureDefaultsAlarm();
        // run a quick remote check on startup (non-blocking)
        fetchAndApplyDefaultsUrl('https://Plus-351.github.io/web-purge/web-purge-defaults.json').then(() => {}).catch(() => {});
    } catch (e) { /* ignore */ }
});

chrome.runtime.onStartup.addListener(async () => {
    // startup event
    try {
        const cfg = await self.loadConfig();
        if (cfg.behavior && cfg.behavior.autoCleanOnStartup) {
            await self.cleanAllEnabledTargets(cfg);
        } else {
            // show options on startup so user can enable auto-clean if desired
            try {
                if (chrome.runtime.openOptionsPage) chrome.runtime.openOptionsPage();
            } catch (e) {
                console.warn('Could not open options page on startup:', e);
            }
        }
    } catch (e) {
        console.error('Startup task failed:', e);
    }
});

// Listen for messages from the popup or options page
function storageLocalGet(key) {
    return new Promise((resolve) => {
        try {
            chrome.storage.local.get(key, (res) => resolve(res || {}));
        } catch (e) {
            resolve({});
        }
    });
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (!request || !request.action) {
        sendResponse({ success: false, error: 'invalid request' });
        return false;
    }

    (async () => {
        try {
            if (request.action === 'cleanAllEnabledTargets') {
                const cfg = await self.loadConfig();
                await self.cleanAllEnabledTargets(cfg);
                const res = await storageLocalGet('lastRunSummary');
                sendResponse({ success: true, summary: res.lastRunSummary || null });
                return;
            }

            if (request.action === 'cleanCurrentDomain' && request.url) {
                const result = await self.cleanSingleDomain(request.url);
                if (result && result.error) {
                    sendResponse({ success: false, error: result.error });
                } else {
                    const res = await storageLocalGet('lastRunSummary');
                    sendResponse({ success: true, summary: res.lastRunSummary || null });
                }
                return;
            }

            // Backwards-compatible simple 'clean' action
            if (request.action === 'clean') {
                const cfg = await self.loadConfig();
                await self.cleanAllEnabledTargets(cfg);
                const res = await storageLocalGet('lastRunSummary');
                sendResponse({ success: true, summary: res.lastRunSummary || null });
                return;
            }

            // resizeWindow handler removed per user request

            sendResponse({ success: false, error: 'unknown action' });
        } catch (e) {
            console.error('Message handler failed:', e);
            sendResponse({ success: false, error: String(e) });
        }
    })();

    return true; // will respond asynchronously
});

// Handle browser events as needed
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete') {
        // Tab updated; no-op for now
    }
});