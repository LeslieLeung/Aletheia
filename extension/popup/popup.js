(function () {
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
          showStatus("URL must use http or https", "error");
          return;
        }
        ALETHEIA.storage.set({ apiUrl: url });
        showStatus("API URL saved", "success");
      } catch (e) {
        showStatus("Invalid URL format", "error");
      }
    }
  });

  // Detect Now button
  detectBtn.addEventListener("click", function () {
    detectBtn.disabled = true;
    detectBtn.textContent = "Detecting\u2026";
    showStatus("Sending detect request to active tab\u2026", "info");

    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
      if (!tabs[0]) {
        showStatus("No active tab found", "error");
        resetBtn();
        return;
      }

      chrome.tabs.sendMessage(
        tabs[0].id,
        { type: ALETHEIA.MSG.MANUAL_DETECT },
        function (response) {
          if (chrome.runtime.lastError) {
            showStatus(
              "Could not connect to page. Try refreshing the page first.",
              "error"
            );
          } else if (response && response.ok) {
            showStatus("Detection triggered! Check the page for results.", "success");
          } else {
            showStatus("Unexpected response from content script.", "error");
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
    detectBtn.textContent = "Detect Now";
  }
})();
