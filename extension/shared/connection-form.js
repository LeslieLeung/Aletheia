var ALETHEIA = self.ALETHEIA || {};

ALETHEIA.connection = (function () {
  function $(id) {
    return document.getElementById(id);
  }

  function mode() {
    var local = $("modeLocal");
    return local && local.getAttribute("aria-pressed") === "true" ? "local" : "server";
  }

  function engine() {
    var selected = document.querySelector('input[name="localEngine"]:checked');
    return selected ? selected.value : ALETHEIA.DEFAULTS.localEngine;
  }

  function setHidden(id, hidden) {
    var el = $(id);
    if (el) el.hidden = hidden;
  }

  function applyVisibility() {
    var local = mode() === "local";
    setHidden("serverFields", local);
    setHidden("localFields", !local);
    setHidden("jevFields", !local || engine() !== "jev");
    setHidden("serverStrategy", local);
    setHidden("strategyLocalNote", !local);

    var hint = $("modeHint");
    if (hint) hint.textContent = ALETHEIA.t(local ? "modeLocalHint" : "modeServerHint");

    var group = $("modeSwitch");
    if (group) group.setAttribute("aria-label", ALETHEIA.t("detectSource"));

    var testBtn = $("testBtn");
    if (testBtn && !testBtn.disabled) {
      var testKey = local ? "testJev" : "testConnection";
      testBtn.textContent = ALETHEIA.t(testKey);
    }
  }

  function setMode(next) {
    $("modeServer").setAttribute("aria-pressed", next === "server" ? "true" : "false");
    $("modeLocal").setAttribute("aria-pressed", next === "local" ? "true" : "false");
    applyVisibility();
  }

  function fill(settings) {
    setMode(settings.runMode === "local" ? "local" : "server");
    $("apiUrl").value = settings.apiUrl || "";
    $("detector").value = settings.detector || ALETHEIA.DEFAULTS.detector;
    $("contentEngine").value = settings.contentEngine || ALETHEIA.DEFAULTS.contentEngine;
    var selected = null;
    document.querySelectorAll('input[name="localEngine"]').forEach(function (input) {
      if (input.value === settings.localEngine) selected = input;
    });
    $("engineJev").checked = !selected;
    if (selected) selected.checked = true;
    $("jevBaseUrl").value = settings.jevBaseUrl || ALETHEIA.DEFAULTS.jevBaseUrl;
    $("jevApiKey").value = settings.jevApiKey || "";
    $("localContent").checked = !!settings.localContent;
    applyVisibility();
  }

  function collect() {
    var apiRaw = $("apiUrl").value.trim();
    var jevRaw = $("jevBaseUrl").value.trim();
    return {
      runMode: mode(),
      apiUrl: apiRaw || ALETHEIA.DEFAULTS.apiUrl,
      detector: $("detector").value,
      contentEngine: $("contentEngine").value,
      localEngine: engine(),
      jevBaseUrl: jevRaw || ALETHEIA.DEFAULTS.jevBaseUrl,
      jevApiKey: $("jevApiKey").value.trim(),
      localContent: $("localContent").checked
    };
  }

  function validateUrl(value) {
    if (!value) return ALETHEIA.t("invalidUrl");
    try {
      var parsed = new URL(value);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        return ALETHEIA.t("urlMustHttp");
      }
    } catch (e) {
      return ALETHEIA.t("invalidUrl");
    }
    return "";
  }

  function activeUrlError() {
    var data = collect();
    if (data.runMode === "server") {
      var apiRaw = $("apiUrl").value.trim();
      if (apiRaw) return validateUrl(apiRaw);
    }
    if (data.runMode === "local" && data.localEngine === "jev") {
      return validateUrl($("jevBaseUrl").value.trim() || data.jevBaseUrl);
    }
    return "";
  }

  function bind(onCommit) {
    $("modeServer").addEventListener("click", function () {
      setMode("server");
      if (onCommit) onCommit("mode");
    });
    $("modeLocal").addEventListener("click", function () {
      setMode("local");
      if (onCommit) onCommit("mode");
    });
    document.querySelectorAll('input[name="localEngine"]').forEach(function (input) {
      input.addEventListener("change", function () {
        applyVisibility();
        if (onCommit) onCommit("engine");
      });
    });
    $("detector").addEventListener("change", function () {
      if (onCommit) onCommit("detector");
    });
    $("contentEngine").addEventListener("change", function () {
      if (onCommit) onCommit("content");
    });
    $("localContent").addEventListener("change", function () {
      if (onCommit) onCommit("content");
    });
    $("apiUrl").addEventListener("change", function () {
      if (onCommit) onCommit("apiUrl");
    });
    $("jevBaseUrl").addEventListener("change", function () {
      if (onCommit) onCommit("jevBaseUrl");
    });
    $("jevApiKey").addEventListener("change", function () {
      if (onCommit) onCommit("jevApiKey");
    });
  }

  return {
    fill: fill,
    collect: collect,
    applyVisibility: applyVisibility,
    bind: bind,
    validateUrl: validateUrl,
    activeUrlError: activeUrlError,
    mode: mode,
    engine: engine
  };
})();
