// src/background/cleanup.js

// Utilities for the background service worker environment.

function historySearch(query) {
    return new Promise((resolve) => {
        try {
            chrome.history.search(query, (results) => resolve(results || []));
        } catch (e) {
            resolve([]);
        }
    });
}

function tabsQuery(query) {
    return new Promise((resolve) => {
        try {
            chrome.tabs.query(query, (tabs) => resolve(tabs || []));
        } catch (e) {
            resolve([]);
        }
    });
}

function browsingDataRemove(options, dataToRemove) {
    return new Promise((resolve) => {
        try {
            chrome.browsingData.remove(options, dataToRemove, () => resolve());
        } catch (e) {
            resolve();
        }
    });
}

function historyDeleteUrl(url) {
    return new Promise((resolve) => {
        try {
            chrome.history.deleteUrl({ url }, () => resolve());
        } catch (e) {
            resolve();
        }
    });
}

function storageSet(obj) {
    return new Promise((resolve) => {
        try {
            chrome.storage.local.set(obj, () => resolve());
        } catch (e) {
            resolve();
        }
    });
}

async function cleanAllEnabledTargets(config) {
    const urlsToDelete = [];
    const hostsToPurge = new Set();

    // Build a set of target domains from enabled domain entries (new format expects
    // domains as objects: { domain, enabled }). Only domains with enabled===true
    // will be considered regardless of category state; categories are informative
    // and can be used to bulk-toggle domains in the UI.
    const targetDomains = (config.categories || [])
        .flatMap(category => (category.domains || [])
            .filter(d => d && (d.enabled === undefined ? true : !!d.enabled))
            .map(d => (typeof d === 'string' ? d : d.domain))
            .filter(Boolean)
        );

    // Scan browsing history (configurable lookback)
    const lookbackDays = (config.behavior && Number(config.behavior.historyLookbackDays)) || 7;
    const startTime = lookbackDays > 0 ? Date.now() - lookbackDays * 24 * 60 * 60 * 1000 : 0;
    const historyItems = await historySearch({
        text: '',
        startTime,
        maxResults: 10000
    });
    for (const item of historyItems) {
        try {
            const hostname = new URL(item.url).hostname;
            if (matchesTargetDomain(hostname, targetDomains)) {
                urlsToDelete.push(item.url);
                hostsToPurge.add(hostname);
            }
        } catch (e) {
            // skip invalid URLs
        }
    }

    // Scan open tabs
    const openTabs = await tabsQuery({});
    openTabs.forEach(tab => {
        try {
            if (!tab.url) return;
            const hostname = new URL(tab.url).hostname;
            if (matchesTargetDomain(hostname, targetDomains)) {
                urlsToDelete.push(tab.url);
                hostsToPurge.add(hostname);
            }
        } catch (e) {
            // ignore
        }
    });

    // Purge browsing data
    await purgeBrowsingData(hostsToPurge);
    await deleteHistoryUrls(urlsToDelete);

    // Save run summary
    await saveRunSummary(urlsToDelete.length, hostsToPurge.size);
}

function matchesTargetDomain(hostname, targetDomains) {
    return targetDomains.some(domain => {
        const normalizedDomain = domain.toLowerCase().trim();
        return hostname === normalizedDomain || hostname.endsWith(`.${normalizedDomain}`);
    });
}

async function purgeBrowsingData(hostsToPurge) {
    const hosts = Array.from(hostsToPurge);
    const origins = hosts.flatMap(host => [`http://${host}`, `https://${host}`]);

    await browsingDataRemove({ origins }, {
        cookies: true,
        cache: true,
        localStorage: true,
        indexedDB: true,
        serviceWorkers: true
    });
}

async function deleteHistoryUrls(urlsToDelete) {
    for (const url of urlsToDelete) {
        await historyDeleteUrl(url);
    }
}

async function saveRunSummary(deletedUrlsCount, purgedOriginsCount) {
    const summary = {
        timestamp: new Date().toISOString(),
        deletedUrlsCount,
        purgedOriginsCount
    };
    await storageSet({ lastRunSummary: summary });
}

// Expose the function to the global worker scope so the service worker can call it
self.cleanAllEnabledTargets = cleanAllEnabledTargets;

// Clean a single domain or origin derived from a URL.
self.cleanSingleDomain = async function (url) {
    try {
        const hostname = new URL(url).hostname;
        const hostsToPurge = new Set([hostname]);

        // Find history URLs for this host (scan a reasonable number of entries)
        const historyItems = await historySearch({ text: '', startTime: 0, maxResults: 10000 });
        const urlsToDelete = [];
        for (const item of historyItems) {
            try {
                if (new URL(item.url).hostname === hostname) {
                    urlsToDelete.push(item.url);
                }
            } catch (e) { }
        }

        await purgeBrowsingData(hostsToPurge);
        await deleteHistoryUrls(urlsToDelete);
        await saveRunSummary(urlsToDelete.length, hostsToPurge.size);
        return { deletedUrlsCount: urlsToDelete.length, purgedOriginsCount: hostsToPurge.size };
    } catch (e) {
        return { error: String(e) };
    }
};
