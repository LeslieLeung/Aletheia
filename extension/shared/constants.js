var ALETHEIA = self.ALETHEIA || {};

ALETHEIA.DEFAULTS = Object.freeze({
  apiUrl: "http://localhost:8000",
  strategy: "sliding_weighted_avg",
  earlyStop: true,
  detector: "onnx_classifier",
  contentEngine: "off",
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
  minTextLength: 200
});

ALETHEIA.MSG = Object.freeze({
  DETECT_TEXT: "DETECT_TEXT",
  GET_STATUS: "GET_STATUS",
  MANUAL_DETECT: "MANUAL_DETECT"
});
