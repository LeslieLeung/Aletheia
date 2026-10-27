// Chrome runs this file as a service worker and loads dependencies here.
// Firefox runs it as an event page after manifest background.scripts, which
// already loaded those files. Event pages have no importScripts.
if (typeof importScripts === "function") {
  importScripts(
    "../shared/constants.js",
    "../shared/storage.js",
    "../shared/i18n.js",
    "../shared/questions.js",
    "../shared/jev.js"
  );
}

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
    var state = ALETHEIA.questions.buildState(message);
    var questions = ALETHEIA.questions.forSettings(settings);
    return await ALETHEIA.jev.detect(settings, state, questions);
  } catch (err) {
    return { success: false, error: err.message || ALETHEIA.t("networkError") };
  }
}
