(function () {
  var apiUrlEl = document.getElementById("apiUrl");
  var testBtn = document.getElementById("testBtn");
  var testStatus = document.getElementById("testStatus");
  var detectorEl = document.getElementById("detector");
  var contentEngineEl = document.getElementById("contentEngine");
  var strategyEl = document.getElementById("strategy");
  var earlyStopEl = document.getElementById("earlyStop");
  var minTextLengthEl = document.getElementById("minTextLength");
  var blacklistEl = document.getElementById("blacklist");
  var whitelistEl = document.getElementById("whitelist");
  var saveBtn = document.getElementById("saveBtn");
  var resetBtn = document.getElementById("resetBtn");
  var saveStatus = document.getElementById("saveStatus");

  // Load current settings
  ALETHEIA.storage.get().then(function (s) {
    apiUrlEl.value = s.apiUrl;
    detectorEl.value = s.detector;
    contentEngineEl.value = s.contentEngine || ALETHEIA.DEFAULTS.contentEngine;
    strategyEl.value = s.strategy;
    earlyStopEl.checked = s.earlyStop;
    minTextLengthEl.value = s.minTextLength;
    blacklistEl.value = (s.blacklist || []).join("\n");
    whitelistEl.value = (s.whitelist || []).join("\n");
  });

  // Test connection
  testBtn.addEventListener("click", function () {
    var url = apiUrlEl.value.trim();
    if (!url) {
      showTestStatus("Please enter an API URL", false);
      return;
    }

    testBtn.disabled = true;
    testBtn.textContent = "Testing\u2026";
    testStatus.className = "test-status";

    fetch(url + "/health")
      .then(function (r) {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      })
      .then(function (data) {
        if (data.status === "ok") {
          showTestStatus("Connected successfully!", true);
        } else {
          showTestStatus("Unexpected response: " + JSON.stringify(data), false);
        }
      })
      .catch(function (err) {
        showTestStatus("Connection failed: " + err.message, false);
      })
      .finally(function () {
        testBtn.disabled = false;
        testBtn.textContent = "Test Connection";
      });
  });

  function showTestStatus(msg, ok) {
    testStatus.textContent = msg;
    testStatus.className = "test-status show " + (ok ? "ok" : "fail");
  }

  function parseDomains(text) {
    return text
      .split("\n")
      .map(function (d) { return d.trim().toLowerCase(); })
      .filter(function (d) { return d.length > 0; });
  }

  // Save settings
  saveBtn.addEventListener("click", function () {
    var data = {
      apiUrl: apiUrlEl.value.trim() || ALETHEIA.DEFAULTS.apiUrl,
      detector: detectorEl.value,
      contentEngine: contentEngineEl.value,
      strategy: strategyEl.value,
      earlyStop: earlyStopEl.checked,
      minTextLength: parseInt(minTextLengthEl.value, 10) || ALETHEIA.DEFAULTS.minTextLength,
      blacklist: parseDomains(blacklistEl.value),
      whitelist: parseDomains(whitelistEl.value)
    };

    ALETHEIA.storage.set(data).then(function () {
      saveStatus.textContent = "Settings saved!";
      saveStatus.className = "save-status show";
      setTimeout(function () {
        saveStatus.className = "save-status";
      }, 2000);
    });
  });

  // Reset to defaults
  resetBtn.addEventListener("click", function () {
    if (!confirm("Reset all settings to defaults?")) return;

    var d = ALETHEIA.DEFAULTS;
    apiUrlEl.value = d.apiUrl;
    detectorEl.value = d.detector;
    contentEngineEl.value = d.contentEngine;
    strategyEl.value = d.strategy;
    earlyStopEl.checked = d.earlyStop;
    minTextLengthEl.value = d.minTextLength;
    blacklistEl.value = d.blacklist.join("\n");
    whitelistEl.value = "";

    ALETHEIA.storage.set({
      apiUrl: d.apiUrl,
      detector: d.detector,
      contentEngine: d.contentEngine,
      strategy: d.strategy,
      earlyStop: d.earlyStop,
      minTextLength: d.minTextLength,
      blacklist: d.blacklist.slice(),
      whitelist: [],
      enabled: true
    }).then(function () {
      saveStatus.textContent = "Settings reset to defaults!";
      saveStatus.className = "save-status show";
      setTimeout(function () {
        saveStatus.className = "save-status";
      }, 2000);
    });
  });
})();
