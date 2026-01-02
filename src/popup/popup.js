document.addEventListener('DOMContentLoaded', function () {
    const panicButton = document.getElementById('panic-button');
    const cleanDomainButton = document.getElementById('clean-domain-button');
    const statusSummary = document.getElementById('status-summary');

    try {
        document.getElementById('title').textContent = chrome.i18n.getMessage('extension_name') || 'Web Purge';
        try { document.title = chrome.i18n.getMessage('popup_title') || (chrome.i18n.getMessage('extension_name') || 'Web Purge'); } catch (e) { }
        panicButton.innerHTML = '💥 ' + (chrome.i18n.getMessage('panic_button') || 'Panic');
        cleanDomainButton.innerHTML = '🗑️ ' + (chrome.i18n.getMessage('clean_current_domain') || 'Clean this domain');
    } catch (e) { }

    // Localize status labels, keeping placeholders for spans
    try {
        const lastRunTemplate = chrome.i18n.getMessage('last_run') || 'Last run: {timestamp}';
        const deletedTemplate = chrome.i18n.getMessage('deleted_urls_count') || 'Deleted URLs: {count}';
        const purgedTemplate = chrome.i18n.getMessage('purged_origins_count') || 'Purged origins: {count}';
        const lastRunLabel = (lastRunTemplate || '').replace('{timestamp}', '').trim();
        const deletedLabel = (deletedTemplate || '').replace('{count}', '').trim();
        const purgedLabel = (purgedTemplate || '').replace('{count}', '').trim();
        const lastRunEl = document.getElementById('last-run-label');
        const deletedEl = document.getElementById('deleted-urls-label');
        const purgedEl = document.getElementById('purged-origins-label');
        if (lastRunEl) lastRunEl.textContent = lastRunLabel;
        if (deletedEl) deletedEl.textContent = deletedLabel;
        if (purgedEl) purgedEl.textContent = purgedLabel;
        const lastErrorEl = document.getElementById('last-error');
        if (lastErrorEl) lastErrorEl.style.color = 'red';
    } catch (e) { }

    // Load the last run summary from local storage
    chrome.storage.local.get('lastRunSummary', function (data) {
        const summary = data && data.lastRunSummary ? data.lastRunSummary : null;
        if (summary) {
            updateStatusSummary(summary);
        } else {
            // show placeholders
            const lastRunTimestamp = document.getElementById('last-run-timestamp');
            const deletedCount = document.getElementById('deleted-urls-count');
            const purgedCount = document.getElementById('purged-origins-count');
            if (lastRunTimestamp) lastRunTimestamp.textContent = 'n/a';
            if (deletedCount) deletedCount.textContent = '0';
            if (purgedCount) purgedCount.textContent = '0';
        }
    });

    // Panic button event listener
    panicButton.addEventListener('click', function () {
        chrome.runtime.sendMessage({ action: 'cleanAllEnabledTargets' }, function (response) {
            console.log('cleanAllEnabledTargets response', response);
            if (response && response.success) {
                updateStatusSummary(response.summary || {});
                const del = (response.summary && response.summary.deletedUrlsCount) ? String(response.summary.deletedUrlsCount) : '0';
                const purged = (response.summary && response.summary.purgedOriginsCount) ? String(response.summary.purgedOriginsCount) : '0';
                const deletedLabel = chrome.i18n.getMessage('deleted_urls_count') || 'Deleted URLs: {count}';
                const purgedLabel = chrome.i18n.getMessage('purged_origins_count') || 'Purged origins: {count}';
                const msg = `${deletedLabel.replace('{count}', '').trim()}: ${del} — ${purgedLabel.replace('{count}', '').trim()}: ${purged}`;
                showToast(msg, 3000, 'success');
            } else {
                // fallback: try reading lastRunSummary from storage
                chrome.storage.local.get('lastRunSummary', function (data) {
                    const s = data && data.lastRunSummary ? data.lastRunSummary : null;
                    if (s) {
                        updateStatusSummary(s);
                        showToast('Clean completed (from storage)', 2500, 'success');
                        return;
                    }
                    const lastError = document.getElementById('last-error');
                    const errMsg = (response && response.error) ? response.error : 'unknown';
                    if (lastError) lastError.textContent = 'Error: ' + errMsg;
                    showToast('Error: ' + errMsg, 5000, 'error');
                });
            }
        });
    });

    // Clean current domain button event listener
    cleanDomainButton.addEventListener('click', function () {
        chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
            const activeTab = tabs[0];
            if (activeTab) {
                chrome.runtime.sendMessage({ action: 'cleanCurrentDomain', url: activeTab.url }, function (response) {
                    console.log('cleanCurrentDomain response', response);
                    if (response && response.success) {
                        updateStatusSummary(response.summary || {});
                        const del = (response.summary && response.summary.deletedUrlsCount) ? String(response.summary.deletedUrlsCount) : '0';
                        const purged = (response.summary && response.summary.purgedOriginsCount) ? String(response.summary.purgedOriginsCount) : '0';
                        const deletedLabel = chrome.i18n.getMessage('deleted_urls_count') || 'Deleted URLs: {count}';
                        const purgedLabel = chrome.i18n.getMessage('purged_origins_count') || 'Purged origins: {count}';
                        const msg = `${deletedLabel.replace('{count}', '').trim()}: ${del} — ${purgedLabel.replace('{count}', '').trim()}: ${purged}`;
                        showToast(msg, 3000, 'success');
                    } else {
                        chrome.storage.local.get('lastRunSummary', function (data) {
                            const s = data && data.lastRunSummary ? data.lastRunSummary : null;
                            if (s) {
                                updateStatusSummary(s);
                                showToast('Clean completed (from storage)', 2500, 'success');
                                return;
                            }
                            const lastError = document.getElementById('last-error');
                            const errMsg = (response && response.error) ? response.error : 'unknown';
                            if (lastError) lastError.textContent = 'Error: ' + errMsg;
                            showToast('Error: ' + errMsg, 5000, 'error');
                        });
                    }
                });
            }
        });
    });

    // showToast provided by shared script (src/shared/toast.js)

    function updateStatusSummary(summary) {
        const lastRunTimestamp = document.getElementById('last-run-timestamp');
        const deletedCount = document.getElementById('deleted-urls-count');
        const purgedCount = document.getElementById('purged-origins-count');
        if (summary) {
            if (lastRunTimestamp) lastRunTimestamp.textContent = formatTimestamp(summary.timestamp) || 'n/a';
            if (deletedCount) deletedCount.textContent = String(summary.deletedUrlsCount || 0);
            if (purgedCount) purgedCount.textContent = String(summary.purgedOriginsCount || 0);
        }
    }

    function formatTimestamp(input) {
        if (!input) return 'n/a';
        const d = (typeof input === 'number') ? new Date(input) : new Date(input);
        if (isNaN(d.getTime())) return String(input);
        const locale = navigator.language || 'en-US';
        const opts = { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false };
        // format like: 31 Dec 2025, 14:05 -> remove comma
        const s = new Intl.DateTimeFormat(locale, opts).format(d);
        return s.replace(',', '');
    }
});