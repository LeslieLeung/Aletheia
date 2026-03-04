importScripts("../shared/constants.js", "../shared/storage.js");

chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
  if (message.type === ALETHEIA.MSG.DETECT_TEXT) {
    handleDetect(message.text).then(sendResponse);
    return true; // keep channel open for async response
  }
  if (message.type === ALETHEIA.MSG.GET_STATUS) {
    ALETHEIA.storage.get().then(function (settings) {
      sendResponse({ enabled: settings.enabled, settings: settings });
    });
    return true;
  }
});

async function handleDetect(text) {
  try {
    var settings = await ALETHEIA.storage.get();

    var body = {
      text: text,
      strategy: settings.strategy,
      early_stop: settings.earlyStop,
      detector: settings.detector
    };

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
        error: errData.detail || response.statusText || "API error"
      };
    }

    var data = await response.json();
    return { success: true, data: data };
  } catch (err) {
    return { success: false, error: err.message || "Network error" };
  }
}
