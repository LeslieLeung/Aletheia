(function () {
  ALETHEIA.applyI18n();

  var enabledEl = document.getElementById("enabled");
  var enabledStateEl = document.getElementById("enabledState");
  var localContentEl = document.getElementById("localContent");
  var detectBtn = document.getElementById("detectBtn");
  var detectLabel = document.getElementById("detectLabel");
  var statusEl = document.getElementById("status");
  var setupHint = document.getElementById("setupHint");
  var setupLink = document.getElementById("setupLink");
  var optionsLink = document.getElementById("optionsLink");
  var versionEl = document.getElementById("version");
  var siteRule = document.getElementById("siteRule");
  var siteFaviconEl = document.getElementById("siteFavicon");
  var siteDomainEl = document.getElementById("siteDomain");
  var siteButtons = {
    default: document.getElementById("defaultSiteBtn"),
    whitelist: document.getElementById("allowSiteBtn"),
    blacklist: document.getElementById("blockSiteBtn")
  };

  var currentSettings = null;
  var siteDomain = "";
  var activeTab = null;
  var statusTimer;

  versionEl.textContent = "v" + chrome.runtime.getManifest().version;

  ALETHEIA.storage.get().then(function (loaded) {
    currentSettings = loaded;
    enabledEl.checked = currentSettings.enabled;
    localContentEl.checked = !!currentSettings.localContent;
    setupHint.hidden = isConfigured(currentSettings);
    renderEnabled();
    loadSiteRule();
  });

  function renderEnabled() {
    var on = enabledEl.checked;
    document.body.classList.toggle("paused", !on);
    enabledStateEl.textContent = ALETHEIA.t(on ? "autoDetectOn" : "autoDetectPaused");
    detectBtn.disabled = !on || detectBtn.classList.contains("loading");
    detectBtn.title = on ? "" : ALETHEIA.t("detectionDisabled");
  }

  function loadSiteRule() {
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
      activeTab = tabs[0] || null;
      var url = (activeTab && activeTab.url) || "";
      if (!/^https?:\/\//i.test(url)) return;
      siteDomain = ALETHEIA.domains.hostOf(url);
      if (!siteDomain) return;
      siteDomainEl.textContent = siteDomain;
      siteDomainEl.title = siteDomain;
      if (activeTab.favIconUrl && /^https?:|^data:/.test(activeTab.favIconUrl)) {
        siteFaviconEl.src = activeTab.favIconUrl;
        siteFaviconEl.hidden = false;
        siteFaviconEl.onerror = function () {
          siteFaviconEl.hidden = true;
        };
      }
      siteRule.hidden = false;
      renderSiteRule();
    });
  }

  function renderSiteRule() {
    var status = ALETHEIA.domains.status(siteDomain, currentSettings);
    Object.keys(siteButtons).forEach(function (key) {
      var active = key === status;
      siteButtons[key].classList.toggle("active", active);
      siteButtons[key].setAttribute("aria-pressed", active ? "true" : "false");
    });
  }

  function setSiteRule(list) {
    if (!siteDomain) return;
    var target = list === "default" ? "" : list;
    var next = ALETHEIA.domains.apply(currentSettings, siteDomain, target);
    currentSettings.whitelist = next.whitelist;
    currentSettings.blacklist = next.blacklist;
    renderSiteRule();
    ALETHEIA.storage.set({
      whitelist: next.whitelist,
      blacklist: next.blacklist
    }).catch(function (err) {
      showStatus(err.message, "error");
    });
  }

  Object.keys(siteButtons).forEach(function (key) {
    siteButtons[key].addEventListener("click", function () {
      setSiteRule(key);
    });
  });

  enabledEl.addEventListener("change", function () {
    renderEnabled();
    ALETHEIA.storage.set({ enabled: enabledEl.checked });
  });

  localContentEl.addEventListener("change", function () {
    ALETHEIA.storage.set({ localContent: localContentEl.checked });
  });

  detectBtn.addEventListener("click", function () {
    setLoading(true);
    showStatus(ALETHEIA.t("sendingDetect"), "info");

    ALETHEIA.storage.get().then(function (settings) {
      if (!isConfigured(settings)) {
        setupHint.hidden = false;
        showStatus(ALETHEIA.t("setupRequired"), "error");
        setLoading(false);
        return;
      }
      triggerDetection();
    });
  });

  function triggerDetection() {
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
      if (!tabs[0]) {
        showStatus(ALETHEIA.t("noActiveTab"), "error");
        setLoading(false);
        return;
      }

      chrome.tabs.sendMessage(
        tabs[0].id,
        { type: ALETHEIA.MSG.MANUAL_DETECT },
        function (response) {
          setLoading(false);
          if (chrome.runtime.lastError) {
            showStatus(ALETHEIA.t("couldNotConnect"), "error");
          } else if (response && response.ok) {
            showStatus(ALETHEIA.t("detectionTriggered"), "success");
            setTimeout(function () {
              window.close();
            }, 1200);
          } else {
            showStatus(ALETHEIA.t("unexpectedResponse"), "error");
          }
        }
      );
    });
  }

  function isConfigured(settings) {
    return ALETHEIA.providers.isConfigured(settings);
  }

  function openOptions() {
    chrome.runtime.openOptionsPage();
    window.close();
  }

  optionsLink.addEventListener("click", openOptions);
  setupLink.addEventListener("click", openOptions);

  function showStatus(msg, type) {
    clearTimeout(statusTimer);
    statusEl.textContent = msg;
    statusEl.className = "status show " + type;
    if (type === "info") return;
    statusTimer = setTimeout(function () {
      statusEl.className = "status";
    }, type === "error" ? 6000 : 3000);
  }

  function setLoading(loading) {
    detectBtn.classList.toggle("loading", loading);
    detectBtn.setAttribute("aria-busy", loading ? "true" : "false");
    detectLabel.textContent = ALETHEIA.t(loading ? "detecting" : "detectNow");
    renderEnabled();
  }
})();
