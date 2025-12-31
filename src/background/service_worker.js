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
    console.log('Web Purge extension installed.');
    // Optionally perform initial run or setup here
    try {
        const cfg = await self.loadConfig();
        if (cfg.behavior && cfg.behavior.autoCleanOnStartup) {
            await self.cleanAllEnabledTargets(cfg);
        }
    } catch (e) {
        console.error('Startup install task failed:', e);
    }
});

chrome.runtime.onStartup.addListener(async () => {
    console.log('Web Purge extension started.');
    try {
        const cfg = await self.loadConfig();
        if (cfg.behavior && cfg.behavior.autoCleanOnStartup) {
            await self.cleanAllEnabledTargets(cfg);
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