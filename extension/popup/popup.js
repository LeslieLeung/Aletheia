(function () {
  ALETHEIA.applyI18n();

  var enabledEl = document.getElementById("enabled");
  var apiUrlEl = document.getElementById("apiUrl");
  var detectorEl = document.getElementById("detector");
  var contentEngineEl = document.getElementById("contentEngine");
  var detectBtn = document.getElementById("detectBtn");
  var statusEl = document.getElementById("status");
  var optionsLink = document.getElementById("optionsLink");

  // Load settings
  ALETHEIA.storage.get().then(function (settings) {
    enabledEl.checked = settings.enabled;
    apiUrlEl.value = settings.apiUrl;
    detectorEl.value = settings.detector;
    contentEngineEl.value = settings.contentEngine || ALETHEIA.DEFAULTS.contentEngine;
  });

  // Save enabled toggle
  enabledEl.addEventListener("change", function () {
    ALETHEIA.storage.set({ enabled: enabledEl.checked });
  });

  // Save detector on change
  detectorEl.addEventListener("change", function () {
    ALETHEIA.storage.set({ detector: detectorEl.value });
  });

  contentEngineEl.addEventListener("change", function () {
    ALETHEIA.storage.set({ contentEngine: contentEngineEl.value });
  });

  // Save API URL on blur
  apiUrlEl.addEventListener("change", function () {
    var url = apiUrlEl.value.trim();
    if (url) {
      try {
        var parsed = new URL(url);
        if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
          showStatus(ALETHEIA.t("urlMustHttp"), "error");
          return;
        }
        ALETHEIA.storage.set({ apiUrl: url });
        showStatus(ALETHEIA.t("apiUrlSaved"), "success");
      } catch (e) {
        showStatus(ALETHEIA.t("invalidUrl"), "error");
      }
    }
  });

  // Detect Now button
  detectBtn.addEventListener("click", function () {
    detectBtn.disabled = true;
    detectBtn.textContent = ALETHEIA.t("detecting");
    showStatus(ALETHEIA.t("sendingDetect"), "info");

    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
      if (!tabs[0]) {
        showStatus(ALETHEIA.t("noActiveTab"), "error");
        resetBtn();
        return;
      }

      chrome.tabs.sendMessage(
        tabs[0].id,
        { type: ALETHEIA.MSG.MANUAL_DETECT },
        function (response) {
          if (chrome.runtime.lastError) {
            showStatus(ALETHEIA.t("couldNotConnect"), "error");
          } else if (response && response.ok) {
            showStatus(ALETHEIA.t("detectionTriggered"), "success");
          } else {
            showStatus(ALETHEIA.t("unexpectedResponse"), "error");
          }
          resetBtn();
        }
      );
    });
  });

  // Options link
  optionsLink.addEventListener("click", function (e) {
    e.preventDefault();
    chrome.runtime.openOptionsPage();
  });

  function showStatus(msg, type) {
    statusEl.textContent = msg;
    statusEl.className = "status show " + type;
  }

  function resetBtn() {
    detectBtn.disabled = false;
    detectBtn.textContent = ALETHEIA.t("detectNow");
  }
})();
