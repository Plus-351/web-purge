// src/background/service_worker.js

// src/background/service_worker.js

// Load helper scripts (cleanup, config) into the worker scope
try {
    // Prefer absolute extension URLs so import works regardless of CWD
    const scriptUrls = [];
    try {
        if (chrome && chrome.runtime && chrome.runtime.getURL) {
            scriptUrls.push(chrome.runtime.getURL('src/background/cleanup.js'));
            scriptUrls.push(chrome.runtime.getURL('src/background/config.js'));
        } else {
            scriptUrls.push('cleanup.js');
            scriptUrls.push('config.js');
        }
    } catch (uerr) {
        scriptUrls.push('cleanup.js');
        scriptUrls.push('config.js');
    }
    importScripts(...scriptUrls);
} catch (e) {
    console.error('Failed to import background scripts:', e);
}

// Non-disruptive startup marker to help debug service worker activation
try {
    chrome.storage && chrome.storage.local && chrome.storage.local.set && chrome.storage.local.set({ serviceWorkerLoaded: Date.now() });
} catch (e) { /* ignore */ }

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

// Compare simple semantic version strings like "0.1.3". Returns 1 if a>b, 0 if equal, -1 if a<b
function compareVersions(a, b) {
    if (!a || !b) return 0;
    try {
        const pa = String(a).split(/[.-]/).map(s => parseInt(s, 10));
        const pb = String(b).split(/[.-]/).map(s => parseInt(s, 10));
        const len = Math.max(pa.length, pb.length);
        for (let i = 0; i < len; i++) {
            const na = Number.isFinite(pa[i]) ? pa[i] : 0;
            const nb = Number.isFinite(pb[i]) ? pb[i] : 0;
            if (na > nb) return 1;
            if (na < nb) return -1;
        }
        return 0;
    } catch (e) {
        // fallback to string compare
        if (a === b) return 0;
        return a > b ? 1 : -1;
    }
}

async function applyDefaultsObject(defaultsObj) {
    try {
        if (!defaultsObj || !Array.isArray(defaultsObj.categories)) return { applied: false };
        const remoteVersion = defaultsObj.defaultsVersion || defaultsObj.version || null;
        const meta = await storageLocalGet('defaultsMeta');
        const lastApplied = (meta && meta.defaultsMeta && meta.defaultsMeta.appliedDefaultsVersion) ? meta.defaultsMeta.appliedDefaultsVersion : null;
        // If we already applied a version that is newer or equal to the remote, skip applying older/same defaults
        try {
            if (lastApplied && remoteVersion && compareVersions(remoteVersion, lastApplied) <= 0) {
                return { applied: false };
            }
        } catch (e) { /* ignore comparison errors and continue */ }

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
        if (chrome && chrome.alarms && typeof chrome.alarms.get === 'function') {
            chrome.alarms.get(DEFAULTS_CHECK_ALARM, (a) => {
                if (!a && typeof chrome.alarms.create === 'function') chrome.alarms.create(DEFAULTS_CHECK_ALARM, { periodInMinutes: DEFAULTS_CHECK_PERIOD_MINUTES });
            });
        } else {
            console.warn('chrome.alarms API not available; skipping defaults alarm creation');
        }
    } catch (e) { /* ignore */ }
}

if (chrome && chrome.alarms && chrome.alarms.onAlarm && typeof chrome.alarms.onAlarm.addListener === 'function') {
    chrome.alarms.onAlarm.addListener((alarm) => {
        if (!alarm || alarm.name !== DEFAULTS_CHECK_ALARM) return;
        // try remote fetch
        try {
            chrome.storage.local.get('remoteDefaultsUrl', (r) => {
                const maybe = (r && r.remoteDefaultsUrl) ? r.remoteDefaultsUrl : null;
                if (maybe) {
                    fetchAndApplyDefaultsUrl(maybe).then(res => {
                        if (res && res.applied) console.info('Periodic defaults applied', res.version);
                    }).catch(() => { /* ignore */ });
                } else {
                    try {
                        const cfgUrl = chrome.runtime.getURL('src/shared/defaults-config.json');
                        fetch(cfgUrl).then(rr => rr.ok ? rr.json() : null).then(cfgData => {
                            const url = cfgData && cfgData.fallbackUrl ? cfgData.fallbackUrl : null;
                            if (url) fetchAndApplyDefaultsUrl(url).then(res => {
                                if (res && res.applied) console.info('Periodic defaults applied', res.version);
                            }).catch(() => { /* ignore */ });
                        }).catch(() => { });
                    } catch (e) { }
                }
            });
        } catch (e) { /* ignore */ }
    });
} else {
    console.warn('chrome.alarms.onAlarm not available in this context');
}

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
        try {
            chrome.storage.local.get('remoteDefaultsUrl', (r) => {
                const maybe = (r && r.remoteDefaultsUrl) ? r.remoteDefaultsUrl : null;
                if (maybe) {
                    fetchAndApplyDefaultsUrl(maybe).then(() => { }).catch(() => { });
                } else {
                    // try reading shared defaults-config.json
                    try {
                        const cfgUrl = chrome.runtime.getURL('src/shared/defaults-config.json');
                        fetch(cfgUrl).then(rr => rr.ok ? rr.json() : null).then(cfgData => {
                            const url = cfgData && cfgData.fallbackUrl ? cfgData.fallbackUrl : null;
                            if (url) fetchAndApplyDefaultsUrl(url).then(() => { }).catch(() => { });
                        }).catch(() => { });
                    } catch (e) { }
                }
            });
        } catch (e) { }
    } catch (e) { /* ignore */ }
});

chrome.runtime.onStartup.addListener(async () => {
    try {
        ensureDefaultsAlarm();
        // run a quick remote check on startup (non-blocking)
        try {
            chrome.storage.local.get('remoteDefaultsUrl', (r) => {
                const maybe = (r && r.remoteDefaultsUrl) ? r.remoteDefaultsUrl : null;
                if (maybe) {
                    fetchAndApplyDefaultsUrl(maybe).then(() => { }).catch(() => { });
                } else {
                    try {
                        const cfgUrl = chrome.runtime.getURL('src/shared/defaults-config.json');
                        fetch(cfgUrl).then(rr => rr.ok ? rr.json() : null).then(cfgData => {
                            const url = cfgData && cfgData.fallbackUrl ? cfgData.fallbackUrl : null;
                            if (url) fetchAndApplyDefaultsUrl(url).then(() => { }).catch(() => { });
                        }).catch(() => { });
                    } catch (e) { }
                }
            });
        } catch (e) { }
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

    // Quick persistent debug: write the incoming request to storage so user can inspect
    try {
        chrome.storage.local.set({ lastMessageReceived: { request: request, sender: sender || null, ts: Date.now() } });
    } catch (e) { /* ignore */ }

    (async () => {
        try {
            if (request.action === 'cleanAllEnabledTargets') {
                const cfg = await self.loadConfig();
                await self.cleanAllEnabledTargets(cfg);
                const res = await storageLocalGet('lastRunSummary');
                const payload = { success: true, summary: res.lastRunSummary || null };
                try { chrome.storage.local.set({ lastMessageResponse: payload }); } catch (e) { }
                sendResponse(payload);
                return;
            }

            if (request.action === 'cleanCurrentDomain' && request.url) {
                const result = await self.cleanSingleDomain(request.url);
                if (result && result.error) {
                    const payload = { success: false, error: result.error };
                    try { chrome.storage.local.set({ lastMessageResponse: payload }); } catch (e) { }
                    sendResponse(payload);
                } else {
                    const res = await storageLocalGet('lastRunSummary');
                    const payload = { success: true, summary: res.lastRunSummary || null };
                    try { chrome.storage.local.set({ lastMessageResponse: payload }); } catch (e) { }
                    sendResponse(payload);
                }
                return;
            }

            // Backwards-compatible simple 'clean' action
            if (request.action === 'clean') {
                const cfg = await self.loadConfig();
                await self.cleanAllEnabledTargets(cfg);
                const res = await storageLocalGet('lastRunSummary');
                const payload = { success: true, summary: res.lastRunSummary || null };
                try { chrome.storage.local.set({ lastMessageResponse: payload }); } catch (e) { }
                sendResponse(payload);
                return;
            }

            // resizeWindow handler removed per user request

            const payload = { success: false, error: 'unknown action' };
            try { chrome.storage.local.set({ lastMessageResponse: payload }); } catch (e) { }
            sendResponse(payload);
        } catch (e) {
            console.error('Message handler failed:', e);
            try { chrome.storage.local.set({ lastMessageError: String(e) }); } catch (ex) { }
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