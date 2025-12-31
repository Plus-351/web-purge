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