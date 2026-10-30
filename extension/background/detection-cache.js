var ALETHEIA = globalThis.ALETHEIA || {};

ALETHEIA.detection = (function () {
  var CACHE_KEY = "detectionResultsV1";
  var MAX_ENTRIES = 100;
  var TTL_MS = 24 * 60 * 60 * 1000;
  var results = new Map();
  var inFlight = new Map();
  var ready;
  var writes = Promise.resolve();

  function prune() {
    var now = Date.now();
    results.forEach(function (entry, key) {
      if (entry.expiresAt <= now) results.delete(key);
    });
    while (results.size > MAX_ENTRIES) {
      results.delete(results.keys().next().value);
    }
  }

  function load() {
    if (!ready) {
      ready = new Promise(function (resolve) {
        // Session storage survives background suspension without retaining
        // article results after the browser session. Older hosts use memory.
        if (!chrome.storage.session) return resolve();
        chrome.storage.session.get(CACHE_KEY, function (stored) {
          if (!chrome.runtime.lastError) {
            var entries = stored && stored[CACHE_KEY];
            if (Array.isArray(entries)) {
              entries.forEach(function (item) {
                if (!Array.isArray(item)) return;
                var key = item[0];
                var entry = item[1];
                if (typeof key === "string" && /^[a-f0-9]{64}$/.test(key) &&
                    entry && typeof entry.expiresAt === "number" &&
                    entry.response && entry.response.success === true && entry.response.data) {
                  results.set(key, entry);
                }
              });
            }
          }
          resolve();
        });
      }).catch(function () { /* Cache failures must not prevent detection. */ });
    }
    return ready;
  }

  function save() {
    // Serialize snapshots so a slower earlier write cannot overwrite new data.
    writes = writes.then(function () {
      if (!chrome.storage.session) return;
      prune();
      var stored = {};
      stored[CACHE_KEY] = Array.from(results.entries());
      return new Promise(function (resolve, reject) {
        chrome.storage.session.set(stored, function () {
          if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
          else resolve();
        });
      });
    }).catch(function () { /* Keep the in-memory cache if storage is unavailable. */ });
    return writes;
  }

  async function keyFor(settings, message, questions) {
    // Use the complete extracted body, including text beyond the request budget.
    // Titles and URLs deliberately do not partition identical article bodies.
    var identity = JSON.stringify({
      text: String(message.text || ""),
      connection: ALETHEIA.providers.identity(settings),
      questions: questions
    });
    var digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(identity));
    return Array.from(new Uint8Array(digest), function (byte) {
      return byte.toString(16).padStart(2, "0");
    }).join("");
  }

  async function detect(settings, message) {
    var state = ALETHEIA.questions.buildState(message);
    var questions = ALETHEIA.questions.forSettings(settings);
    var key = await keyFor(settings, message, questions);
    await load();
    prune();

    // A manual rerun skips completed results but shares any actual request
    // already running for this body and configuration, including other reruns.
    if (inFlight.has(key)) return inFlight.get(key);
    if (!message.forceRerun && results.has(key)) {
      var cached = results.get(key);
      results.delete(key);
      results.set(key, cached);
      await save();
      return cached.response;
    }

    var request = Promise.resolve().then(function () {
      return ALETHEIA.providers.detect(settings, state, questions);
    }).then(async function (response) {
      if (response && response.success === true) {
        results.delete(key);
        results.set(key, { response: response, expiresAt: Date.now() + TTL_MS });
        prune();
        await save();
      }
      return response;
    }).finally(function () {
      inFlight.delete(key);
    });
    inFlight.set(key, request);
    return request;
  }

  return { detect: detect };
})();
