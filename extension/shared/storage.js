var ALETHEIA = globalThis.ALETHEIA || {};

var LOCAL_KEYS = { jevApiKey: true };

function storageError(reject) {
  if (chrome.runtime.lastError) {
    reject(new Error(chrome.runtime.lastError.message));
    return true;
  }
  return false;
}

ALETHEIA.storage = {
  get: function () {
    return new Promise(function (resolve) {
      chrome.storage.sync.get(ALETHEIA.DEFAULTS, function (items) {
        if (items.localEngine !== "jev") items.localEngine = ALETHEIA.DEFAULTS.localEngine;
        chrome.storage.local.get({ jevApiKey: "" }, function (localItems) {
          items.jevApiKey = localItems.jevApiKey || "";
          resolve(items);
        });
      });
    });
  },

  set: function (data) {
    var syncData = {};
    var localData = {};
    var hasSync = false;
    var hasLocal = false;
    Object.keys(data).forEach(function (key) {
      if (LOCAL_KEYS[key]) {
        localData[key] = data[key];
        hasLocal = true;
      } else {
        syncData[key] = data[key];
        hasSync = true;
      }
    });

    var jobs = [];
    if (hasSync) {
      jobs.push(new Promise(function (resolve, reject) {
        chrome.storage.sync.set(syncData, function () {
          if (!storageError(reject)) resolve();
        });
      }));
    }
    if (hasLocal) {
      jobs.push(new Promise(function (resolve, reject) {
        chrome.storage.local.set(localData, function () {
          if (!storageError(reject)) resolve();
        });
      }));
    }
    return Promise.all(jobs).then(function () {});
  },

  onChanged: function (callback) {
    chrome.storage.onChanged.addListener(function (changes, area) {
      if (area === "sync") {
        callback(changes);
      }
    });
  }
};
