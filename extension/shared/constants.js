// Firefox content-script globals are distinct from self/window.
var ALETHEIA = globalThis.ALETHEIA || {};

ALETHEIA.DEFAULTS = Object.freeze({
  modelProvider: "jev",
  providerConfigs: {},
  jevBaseUrl: "https://api.typesafe.ai",
  localContent: false,
  contentCategories: [],
  whitelist: [],
  blacklist: [
    "google.com",
    "youtube.com",
    "github.com",
    "stackoverflow.com",
    "twitter.com",
    "x.com",
    "facebook.com",
    "instagram.com",
    "reddit.com",
    "linkedin.com",
    "amazon.com",
    "ebay.com",
    "netflix.com",
    "spotify.com"
  ],
  enabled: true,
  minTextLength: 200,
  showBadgePercent: false
});

ALETHEIA.MSG = Object.freeze({
  DETECT_TEXT: "DETECT_TEXT",
  GET_STATUS: "GET_STATUS",
  MANUAL_DETECT: "MANUAL_DETECT"
});
