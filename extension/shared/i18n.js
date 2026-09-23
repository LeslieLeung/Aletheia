var ALETHEIA = self.ALETHEIA || {};

ALETHEIA.t = function (key, substitutions) {
  if (!chrome.i18n || typeof chrome.i18n.getMessage !== "function") return key;
  var message = substitutions
    ? chrome.i18n.getMessage(key, substitutions)
    : chrome.i18n.getMessage(key);
  return message || key;
};

ALETHEIA.applyI18n = function (root) {
  var scope = root || document;
  var nodes = scope.querySelectorAll("[data-i18n]");
  var i;
  for (i = 0; i < nodes.length; i++) {
    nodes[i].textContent = ALETHEIA.t(nodes[i].getAttribute("data-i18n"));
  }

  var placeholders = scope.querySelectorAll("[data-i18n-placeholder]");
  for (i = 0; i < placeholders.length; i++) {
    placeholders[i].setAttribute(
      "placeholder",
      ALETHEIA.t(placeholders[i].getAttribute("data-i18n-placeholder"))
    );
  }

  if (document.documentElement && chrome.i18n && chrome.i18n.getUILanguage) {
    var ui = chrome.i18n.getUILanguage().toLowerCase();
    document.documentElement.lang = ui.indexOf("zh") === 0 ? "zh-CN" : ui || "en";
  }
};
