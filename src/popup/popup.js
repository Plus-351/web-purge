document.addEventListener('DOMContentLoaded', function() {
    const panicButton = document.getElementById('panic-button');
    const cleanDomainButton = document.getElementById('clean-domain-button');
    const statusSummary = document.getElementById('status-summary');

    // Load the current configuration
    chrome.storage.sync.get('webPurgeConfig', function(config) {
        if (config && config.version) {
            updateStatusSummary(config);
        } else {
            statusSummary.textContent = 'Configuration not found.';
        }
    });

    // Panic button event listener
    panicButton.addEventListener('click', function() {
        chrome.runtime.sendMessage({ action: 'cleanAllEnabledTargets' }, function(response) {
            if (response.success) {
                updateStatusSummary(response.summary);
            } else {
                statusSummary.textContent = 'Error: ' + response.error;
            }
        });
    });

    // Clean current domain button event listener
    cleanDomainButton.addEventListener('click', function() {
        chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
            const activeTab = tabs[0];
            if (activeTab) {
                chrome.runtime.sendMessage({ action: 'cleanCurrentDomain', url: activeTab.url }, function(response) {
                    if (response.success) {
                        updateStatusSummary(response.summary);
                    } else {
                        statusSummary.textContent = 'Error: ' + response.error;
                    }
                });
            }
        });
    });

    function updateStatusSummary(summary) {
        statusSummary.textContent = `Last run: ${summary.lastRun} | Deleted URLs: ${summary.deletedUrlsCount} | Purged origins: ${summary.purgedOriginsCount}`;
    }
});