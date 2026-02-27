var ALETHEIA = self.ALETHEIA || {};

(function () {
  var detected = false;

  function getDomain() {
    return window.location.hostname.replace(/^www\./, "");
  }

  function domainMatches(domain, list) {
    return list.some(function (d) {
      return domain === d || domain.endsWith("." + d);
    });
  }

  // Whitelist takes priority over blacklist.
  // If whitelisted -> always allow. If blacklisted -> deny. Otherwise -> allow.
  function isDomainAllowed(settings) {
    var domain = getDomain();
    if (settings.whitelist.length > 0 && domainMatches(domain, settings.whitelist)) {
      return true;
    }
    if (settings.blacklist.length > 0 && domainMatches(domain, settings.blacklist)) {
      return false;
    }
    return true;
  }

  // manual=true: skip domain filter, skip readability pre-check, show errors
  function runDetection(forceRerun, manual) {
    if (detected && !forceRerun) return;

    ALETHEIA.storage.get().then(function (settings) {
      if (!settings.enabled) {
        if (manual) ALETHEIA.badge.showError("Detection is disabled. Enable it in the popup.");
        return;
      }

      if (!manual && !isDomainAllowed(settings)) return;

      var article = ALETHEIA.extractArticle({ skipReadabilityCheck: !!manual });

      if (!article || article.skipped) {
        if (manual) ALETHEIA.badge.showError(article ? article.reason : "No content found");
        return;
      }

      var text = article.textContent;
      if (text.length < settings.minTextLength) {
        if (manual) {
          ALETHEIA.badge.showError(
            "Text too short (" + text.length + " chars, need " + settings.minTextLength + ")"
          );
        }
        return;
      }

      detected = true;
      ALETHEIA.badge.showLoading();

      chrome.runtime.sendMessage(
        { type: ALETHEIA.MSG.DETECT_TEXT, text: text },
        function (response) {
          if (chrome.runtime.lastError) {
            ALETHEIA.badge.showError(chrome.runtime.lastError.message);
            return;
          }
          if (!response) {
            ALETHEIA.badge.showError("No response from service worker");
            return;
          }
          if (response.success) {
            ALETHEIA.badge.showResult(response.data);
          } else {
            ALETHEIA.badge.showError(response.error);
          }
        }
      );
    });
  }

  // Listen for manual detect requests from popup
  chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
    if (message.type === ALETHEIA.MSG.MANUAL_DETECT) {
      detected = false;
      ALETHEIA.badge.remove();
      runDetection(true, true);
      sendResponse({ ok: true });
    }
  });

  // Auto-detect on page load
  runDetection(false, false);
})();
