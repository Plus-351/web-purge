document.addEventListener('DOMContentLoaded', function () {
    const categoriesContainer = document.getElementById('categories-container');
    const autoCleanToggle = document.getElementById('auto-clean-on-startup');
    const historyLookbackInput = document.getElementById('history-lookback-days');
    const exportButton = document.getElementById('export-config');
    const importInput = document.getElementById('import-config');
    const resetButton = document.getElementById('reset-defaults');
    const form = document.getElementById('options-form');

    const defaultConfig = {
        version: 1,
        behavior: {
            autoCleanOnStartup: true,
            historyLookbackDays: 7
        },
        ui: {
            showSensitiveCategory: true
        },
        categories: [
            {
                id: 'trackers_ads',
                enabled: true,
                label: { en: 'Trackers / Ads', es: 'Trackers / Publicidad' },
                domains: [
                    'doubleclick.net',
                    'googlesyndication.com',
                    'google-analytics.com',
                    'googletagmanager.com',
                    'googletagservices.com',
                    'adsystem.com',
                    'adnxs.com',
                    'criteo.com',
                    'scorecardresearch.com',
                    'taboola.com',
                    'outbrain.com'
                ]
            },
            {
                id: 'social_networks',
                enabled: true,
                label: { en: 'Social Networks', es: 'Redes Sociales' },
                domains: [
                    'facebook.com',
                    'fb.com',
                    'messenger.com',
                    'instagram.com',
                    'threads.net',
                    'tiktok.com',
                    'x.com',
                    'twitter.com',
                    'linkedin.com',
                    'reddit.com',
                    'pinterest.com'
                ]
            },
            {
                id: 'sensitive_sites',
                enabled: false,
                label: { en: 'Sensitive Sites', es: 'Sitios Sensibles' },
                domains: [
                    'pornhub.com',
                    'xvideos.com',
                    'xnxx.com',
                    'redtube.com',
                    'youporn.com',
                    'onlyfans.com',
                    'loyalfans.com',
                    'fansly.com',
                    'redgifs.com',
                    'fetlife.com'
                ]
            },
            {
                id: 'custom_domains',
                enabled: true,
                label: { en: 'Custom Domains', es: 'Dominios personalizados' },
                domains: []
            }
        ]
    };

    function clearCategoriesUI() {
        categoriesContainer.innerHTML = '';
    }

    function createDomainRow(domainValue) {
        const div = document.createElement('div');
        div.className = 'domain-row';
        const input = document.createElement('input');
        input.type = 'text';
        input.value = domainValue || '';
        input.placeholder = 'example.com';
        input.className = 'domain-input';
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.textContent = 'Eliminar';
        remove.addEventListener('click', () => div.remove());
        div.appendChild(input);
        div.appendChild(remove);
        return div;
    }

    function renderCategories(config) {
        clearCategoriesUI();
        config.categories.forEach(category => {
            const section = document.createElement('section');
            section.className = 'category';
            const heading = document.createElement('h3');
            heading.textContent = `${category.label.en} / ${category.label.es}`;

            const enabledLabel = document.createElement('label');
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.checked = !!category.enabled;
            checkbox.dataset.id = category.id;
            enabledLabel.appendChild(checkbox);
            enabledLabel.appendChild(document.createTextNode(' Habilitado'));

            const domainsList = document.createElement('div');
            domainsList.className = 'domains-list';
            (category.domains || []).forEach(d => {
                domainsList.appendChild(createDomainRow(d));
            });

            const addBtn = document.createElement('button');
            addBtn.type = 'button';
            addBtn.textContent = 'Agregar dominio';
            addBtn.addEventListener('click', () => domainsList.appendChild(createDomainRow('')));

            section.appendChild(heading);
            section.appendChild(enabledLabel);
            section.appendChild(domainsList);
            section.appendChild(addBtn);
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
            renderCategories(cfg);
        });
    }

    function collectConfig() {
        const sections = Array.from(categoriesContainer.querySelectorAll('section.category'));
        const categories = sections.map(section => {
            const checkbox = section.querySelector('input[type="checkbox"]');
            const id = checkbox.dataset.id;
            const title = section.querySelector('h3').textContent || id;
            const labelParts = title.split(' / ');
            const inputs = Array.from(section.querySelectorAll('.domain-input'));
            const domains = inputs.map(i => i.value.trim()).filter(s => s.length > 0);
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
            alert('Configuración guardada');
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

    importInput.addEventListener('change', function (event) {
        const file = event.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = function (ev) {
            try {
                const cfg = JSON.parse(ev.target.result);
                chrome.storage.sync.set({ webPurgeConfig: cfg }, function () {
                    alert('Configuración importada');
                    loadConfig();
                });
            } catch (e) {
                alert('Archivo inválido');
            }
        };
        reader.readAsText(file);
    });

    resetButton.addEventListener('click', function () {
        chrome.storage.sync.set({ webPurgeConfig: defaultConfig }, function () {
            alert('Se restableció la configuración por defecto');
            loadConfig();
        });
    });

    loadConfig();
});