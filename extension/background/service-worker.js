importScripts(
  "../shared/constants.js",
  "../shared/storage.js",
  "../shared/i18n.js",
  "../shared/questions.js",
  "../shared/jev.js"
);

chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
  if (message.type === ALETHEIA.MSG.DETECT_TEXT) {
    handleDetect(message).then(sendResponse);
    return true;
  }
  if (message.type === ALETHEIA.MSG.GET_STATUS) {
    ALETHEIA.storage.get().then(function (settings) {
      var shared = Object.assign({}, settings);
      delete shared.jevApiKey;
      sendResponse({ enabled: settings.enabled, settings: shared });
    });
    return true;
  }
});

async function handleDetect(message) {
  try {
    var settings = await ALETHEIA.storage.get();
    if (settings.runMode === "local") {
      return await handleLocalDetect(message, settings);
    }
    return await handleServerDetect(message, settings);
  } catch (err) {
    return { success: false, error: err.message || ALETHEIA.t("networkError") };
  }
}

async function handleLocalDetect(message, settings) {
  var state = ALETHEIA.questions.buildState(message);
  var questions = ALETHEIA.questions.forSettings(settings);
  var engine = settings.localEngine || ALETHEIA.DEFAULTS.localEngine;
  if (engine === "jev") return ALETHEIA.jev.detect(settings, state, questions);
  throw new Error(ALETHEIA.t("unsupportedLocalEngine"));
}

async function handleServerDetect(message, settings) {
  var body = {
    text: message.text,
    strategy: settings.strategy,
    early_stop: settings.earlyStop,
    detector: settings.detector
  };
  if (message.title) body.title = message.title;
  if (message.url) body.url = message.url;
  if (settings.contentEngine && settings.contentEngine !== "off") {
    body.content_engine = settings.contentEngine;
  }

  var response = await fetch(settings.apiUrl + "/detect", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    var errData;
    try {
      errData = await response.json();
    } catch (e) {
      errData = {};
    }
    return {
      success: false,
      error: errData.detail || response.statusText || ALETHEIA.t("apiError")
    };
  }

  var data = await response.json();
  return { success: true, data: data };
}
