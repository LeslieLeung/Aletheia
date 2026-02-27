var ALETHEIA = self.ALETHEIA || {};

ALETHEIA.storage = {
  get: function () {
    return new Promise(function (resolve) {
      chrome.storage.sync.get(ALETHEIA.DEFAULTS, function (items) {
        resolve(items);
      });
    });
  },

  set: function (data) {
    return new Promise(function (resolve, reject) {
      chrome.storage.sync.set(data, function () {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve();
        }
      });
    });
  },

  onChanged: function (callback) {
    chrome.storage.onChanged.addListener(function (changes, area) {
      if (area === "sync") {
        callback(changes);
      }
    });
  }
};
