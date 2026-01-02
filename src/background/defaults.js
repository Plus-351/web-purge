// Legacy placeholder removed: canonical defaults live in src/options/options.json
// This file intentionally contains no hardcoded categories/domains.
const defaultConfig = {
  version: 1,
  behavior: { autoCleanOnStartup: false, historyLookbackDays: 7 },
  ui: { showSensitiveCategory: true },
  categories: []
};

export default defaultConfig;