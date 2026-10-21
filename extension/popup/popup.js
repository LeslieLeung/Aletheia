(function () {
  ALETHEIA.applyI18n();

  var enabledEl = document.getElementById("enabled");
  var detectBtn = document.getElementById("detectBtn");
  var statusEl = document.getElementById("status");
  var optionsLink = document.getElementById("optionsLink");

  ALETHEIA.storage.get().then(function (settings) {
    enabledEl.checked = settings.enabled;
    ALETHEIA.connection.fill(settings);
  });

  enabledEl.addEventListener("change", function () {
    ALETHEIA.storage.set({ enabled: enabledEl.checked });
  });

  ALETHEIA.connection.bind(function (reason) {
    var urlError = ALETHEIA.connection.activeUrlError();
    if (urlError) {
      showStatus(urlError, "error");
      return;
    }
    ALETHEIA.storage.set(ALETHEIA.connection.collect()).then(function () {
      var notice = noticeFor(reason);
      if (notice) showStatus(notice, "success");
    }).catch(function (err) {
      showStatus(err.message, "error");
    });
  });

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

  optionsLink.addEventListener("click", function (e) {
    e.preventDefault();
    chrome.runtime.openOptionsPage();
  });

  function noticeFor(reason) {
    if (reason === "mode") return ALETHEIA.t("modeSaved");
    if (reason === "apiUrl") return ALETHEIA.t("apiUrlSaved");
    if (reason === "jevBaseUrl" || reason === "jevApiKey") return ALETHEIA.t("jevSaved");
    return "";
  }

  function showStatus(msg, type) {
    statusEl.textContent = msg;
    statusEl.className = "status show " + type;
  }

  function resetBtn() {
    detectBtn.disabled = false;
    detectBtn.textContent = ALETHEIA.t("detectNow");
  }
})();
