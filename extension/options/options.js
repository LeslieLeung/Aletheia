(function () {
  ALETHEIA.applyI18n();

  var testBtn = document.getElementById("testBtn");
  var testStatus = document.getElementById("testStatus");
  var strategyEl = document.getElementById("strategy");
  var earlyStopEl = document.getElementById("earlyStop");
  var showBadgePercentEl = document.getElementById("showBadgePercent");
  var minTextLengthEl = document.getElementById("minTextLength");
  var blacklistEl = document.getElementById("blacklist");
  var whitelistEl = document.getElementById("whitelist");
  var saveBtn = document.getElementById("saveBtn");
  var resetBtn = document.getElementById("resetBtn");
  var saveStatus = document.getElementById("saveStatus");

  ALETHEIA.storage.get().then(function (s) {
    ALETHEIA.connection.fill(s);
    strategyEl.value = s.strategy;
    earlyStopEl.checked = s.earlyStop;
    showBadgePercentEl.checked = !!s.showBadgePercent;
    minTextLengthEl.value = s.minTextLength;
    blacklistEl.value = (s.blacklist || []).join("\n");
    whitelistEl.value = (s.whitelist || []).join("\n");
  });

  ALETHEIA.connection.bind(null);

  testBtn.addEventListener("click", function () {
    if (ALETHEIA.connection.mode() === "server" && !document.getElementById("apiUrl").value.trim()) {
      showTestStatus(ALETHEIA.t("enterApiUrl"), false);
      return;
    }
    var urlError = ALETHEIA.connection.activeUrlError();
    if (urlError) {
      showTestStatus(urlError, false);
      return;
    }

    testBtn.disabled = true;
    testBtn.textContent = ALETHEIA.t("testing");
    testStatus.className = "test-status";

    var pending;
    if (ALETHEIA.connection.mode() === "local" && ALETHEIA.connection.engine() === "jev") {
      pending = ALETHEIA.jev.test(
        document.getElementById("jevBaseUrl").value.trim(),
        document.getElementById("jevApiKey").value.trim()
      );
    } else if (ALETHEIA.connection.mode() === "local") {
      pending = Promise.reject(new Error(ALETHEIA.t("unsupportedLocalEngine")));
    } else {
      pending = testServer(document.getElementById("apiUrl").value.trim());
    }

    pending.then(function () {
      showTestStatus(ALETHEIA.t("connectedOk"), true);
    }).catch(function (err) {
      showTestStatus(ALETHEIA.t("connectionFailed") + err.message, false);
    }).finally(function () {
      testBtn.disabled = false;
      ALETHEIA.connection.applyVisibility();
    });
  });

  function testServer(url) {
    if (!url) return Promise.reject(new Error(ALETHEIA.t("enterApiUrl")));
    return fetch(url + "/health").then(function (response) {
      if (!response.ok) throw new Error("HTTP " + response.status);
      return response.json();
    }).then(function (data) {
      if (data.status !== "ok") {
        throw new Error(ALETHEIA.t("unexpectedApiResponse") + JSON.stringify(data));
      }
    });
  }

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

  function flashSave(message, failed) {
    saveStatus.textContent = message;
    saveStatus.className = "save-status show" + (failed ? " fail" : "");
    setTimeout(function () {
      saveStatus.className = "save-status";
    }, 2000);
  }

  saveBtn.addEventListener("click", function () {
    var urlError = ALETHEIA.connection.activeUrlError();
    if (urlError) {
      flashSave(urlError, true);
      return;
    }

    var data = ALETHEIA.connection.collect();
    data.strategy = strategyEl.value;
    data.earlyStop = earlyStopEl.checked;
    data.showBadgePercent = showBadgePercentEl.checked;
    data.minTextLength = parseInt(minTextLengthEl.value, 10) || ALETHEIA.DEFAULTS.minTextLength;
    data.blacklist = parseDomains(blacklistEl.value);
    data.whitelist = parseDomains(whitelistEl.value);

    ALETHEIA.storage.set(data).then(function () {
      flashSave(ALETHEIA.t("settingsSaved"), false);
    }).catch(function (err) {
      flashSave(err.message, true);
    });
  });

  resetBtn.addEventListener("click", function () {
    if (!confirm(ALETHEIA.t("confirmReset"))) return;

    var d = ALETHEIA.DEFAULTS;
    ALETHEIA.connection.fill({
      apiUrl: d.apiUrl,
      runMode: d.runMode,
      localEngine: d.localEngine,
      jevBaseUrl: d.jevBaseUrl,
      jevApiKey: "",
      localContent: d.localContent,
      detector: d.detector,
      contentEngine: d.contentEngine
    });
    strategyEl.value = d.strategy;
    earlyStopEl.checked = d.earlyStop;
    showBadgePercentEl.checked = d.showBadgePercent;
    minTextLengthEl.value = d.minTextLength;
    blacklistEl.value = d.blacklist.join("\n");
    whitelistEl.value = "";

    ALETHEIA.storage.set({
      apiUrl: d.apiUrl,
      runMode: d.runMode,
      localEngine: d.localEngine,
      jevBaseUrl: d.jevBaseUrl,
      jevApiKey: "",
      localContent: d.localContent,
      detector: d.detector,
      contentEngine: d.contentEngine,
      strategy: d.strategy,
      earlyStop: d.earlyStop,
      showBadgePercent: d.showBadgePercent,
      minTextLength: d.minTextLength,
      blacklist: d.blacklist.slice(),
      whitelist: [],
      enabled: true
    }).then(function () {
      flashSave(ALETHEIA.t("settingsReset"), false);
    });
  });
})();
