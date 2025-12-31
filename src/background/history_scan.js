// history_scan.js

async function scanBrowsingHistory(targetDomains) {
    const urlsToDelete = [];
    const hostsToPurge = new Set();
    const timeWindow = 30 * 24 * 60 * 60 * 1000; // 30 days in milliseconds
    const now = Date.now();
    
    try {
        const historyItems = await chrome.history.search({
            text: '',
            startTime: now - timeWindow,
            maxResults: 1000
        });

        for (const item of historyItems) {
            const hostname = new URL(item.url).hostname;
            if (isDomainMatched(hostname, targetDomains)) {
                urlsToDelete.push(item.url);
                hostsToPurge.add(hostname);
            }
        }
    } catch (error) {
        console.error('Error scanning browsing history:', error);
    }

    return { urlsToDelete, hostsToPurge: Array.from(hostsToPurge) };
}

function isDomainMatched(hostname, targetDomains) {
    return targetDomains.some(domain => {
        const normalizedDomain = domain.toLowerCase().trim();
        return hostname === normalizedDomain || hostname.endsWith(`.${normalizedDomain}`);
    });
}

// Export the scan function for use in other modules
export { scanBrowsingHistory };