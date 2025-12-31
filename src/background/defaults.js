const defaultConfig = {
  version: 1,
  behavior: {
    autoCleanOnStartup: true
  },
  ui: {
    showSensitiveCategory: true
  },
  categories: [
    {
      id: "trackers_ads",
      enabled: true,
      label: {
        en: "Trackers / Ads",
        es: "Trackers / Publicidad"
      },
      description: {
        en: "Common ad and analytics domains.",
        es: "Dominios comunes de anuncios y analítica."
      },
      domains: [
        "doubleclick.net",
        "googlesyndication.com",
        "google-analytics.com",
        "googletagmanager.com",
        "googletagservices.com",
        "adsystem.com",
        "adnxs.com",
        "criteo.com",
        "scorecardresearch.com",
        "taboola.com",
        "outbrain.com"
      ]
    },
    {
      id: "social_networks",
      enabled: true,
      label: {
        en: "Social Networks",
        es: "Redes Sociales"
      },
      description: {
        en: "Major social platforms.",
        es: "Plataformas sociales principales."
      },
      domains: [
        "facebook.com",
        "fb.com",
        "messenger.com",
        "instagram.com",
        "threads.net",
        "tiktok.com",
        "x.com",
        "twitter.com",
        "linkedin.com",
        "reddit.com",
        "pinterest.com"
      ]
    },
    {
      id: "sensitive_sites",
      enabled: false,
      label: {
        en: "Sensitive Sites",
        es: "Sitios Sensibles"
      },
      description: {
        en: "Privacy cleanup for sensitive websites.",
        es: "Limpieza de privacidad para sitios sensibles."
      },
      domains: [
        "pornhub.com",
        "xvideos.com",
        "xnxx.com",
        "redtube.com",
        "youporn.com",
        "onlyfans.com"
      ]
    }
  ]
};

export default defaultConfig;