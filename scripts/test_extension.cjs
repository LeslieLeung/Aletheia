const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { webcrypto } = require("node:crypto");
const { test } = require("node:test");

const extensionDir = path.join(__dirname, "../extension");
const manifest = JSON.parse(fs.readFileSync(path.join(extensionDir, "manifest.json")));
const tick = () => new Promise(setImmediate);

function load(context, file) {
  vm.runInContext(fs.readFileSync(path.join(extensionDir, file), "utf8"), context, {
    filename: file
  });
}

function environment(separateWindow, stored) {
  const syncStored = (stored && stored.sync) || {};
  const localStored = (stored && stored.local) || {};
  const sessionStored = (stored && stored.session) || {};
  const listeners = [];
  const sent = [];
  const context = vm.createContext({
    chrome: {
      runtime: {
        onMessage: { addListener: listener => listeners.push(listener) },
        sendMessage(message, callback) {
          sent.push(message);
          callback({ success: true, data: { label: "human", score: 0.9 } });
        }
      },
      storage: {
        sync: {
          get(defaults, callback) {
            callback({ ...defaults, blacklist: ["example.com"], ...syncStored });
          }
        },
        local: { get: (defaults, callback) => callback({ ...defaults, ...localStored }) },
        session: {
          get(key, callback) { callback(structuredClone(sessionStored)); },
          set(items, callback) {
            Object.assign(sessionStored, structuredClone(items));
            callback();
          }
        }
      },
      i18n: { getMessage: key => key }
    },
    AbortSignal,
    crypto: webcrypto,
    TextEncoder,
    URL,
    location: { hostname: "example.com", href: "https://example.com/article" }
  });
  // Firefox content-script globals inherit DOM APIs from a distinct window.
  // Chrome content scripts and extension pages use the window as their global.
  context.self = separateWindow ? { location: context.location } : context;
  context.window = context.self;
  return { context, listeners, sent, sessionStored };
}

function loadBackground(context, separateWindow) {
  if (separateWindow) {
    for (const file of manifest.background.scripts) load(context, file);
    return;
  }
  context.importScripts = (...files) => {
    for (const file of files) load(context, path.posix.join("background", file));
  };
  load(context, manifest.background.service_worker);
}

function detectViaBackground(listeners, message) {
  return new Promise(resolve => {
    const pending = listeners[0]({ type: "DETECT_TEXT", ...message }, {}, resolve);
    assert.equal(pending, true);
  });
}

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

function jevResponse(probability = 0.1) {
  return {
    ok: true,
    json: async () => ({ answers: { ai_generated: { noul: probability } } })
  };
}

function keysReady(context, count) {
  const ready = deferred();
  let completed = 0;
  context.crypto = {
    subtle: {
      async digest(...args) {
        const result = await webcrypto.subtle.digest(...args);
        if (++completed === count) ready.resolve();
        return result;
      }
    }
  };
  // Let key consumers finish their promise continuations before releasing fetch.
  return ready.promise.then(tick);
}

test("settings own credentials and the popup stays a quick action", () => {
  const optionsHtml = fs.readFileSync(path.join(extensionDir, "options/options.html"), "utf8");
  const popupHtml = fs.readFileSync(path.join(extensionDir, "popup/popup.html"), "utf8");

  assert.match(optionsHtml, /id="jevBaseUrl"/);
  assert.match(optionsHtml, /id="jevApiKey"/);
  assert.match(optionsHtml, /class="toggle-row"[\s\S]*id="localContent"/);
  assert.match(optionsHtml, /id="classifyConfig"[\s\S]*id="categoryList"[\s\S]*id="addCategoryBtn"/);
  assert.match(optionsHtml, /id="domainInput"[\s\S]*id="domainSearch"[\s\S]*id="domainItems"/);
  assert.doesNotMatch(optionsHtml, /id="apiUrl"|id="modeServer"|id="modeLocal"/);
  assert.doesNotMatch(optionsHtml, /<textarea id="whitelist"|<textarea id="blacklist"/);

  assert.match(popupHtml, /class="toggle"[\s\S]*id="localContent"/);
  assert.match(popupHtml, /id="siteRule"[\s\S]*id="allowSiteBtn"[\s\S]*id="blockSiteBtn"/);
  assert.doesNotMatch(popupHtml, /jevBaseUrl|jevApiKey|apiUrl|modeServer|modeLocal|categoryList|addCategoryBtn/);
});

test("domain rules accept URLs and let the whitelist win", () => {
  const context = vm.createContext({ URL });
  load(context, "shared/domains.js");
  const domains = context.ALETHEIA.domains;

  assert.equal(domains.normalize("https://www.Example.com/articles/1"), "example.com");
  assert.equal(domains.normalize("*.example.com"), "example.com");
  assert.equal(domains.normalize("example.com:8080"), "example.com");
  assert.equal(domains.normalize("not a domain"), "");
  assert.equal(domains.hostOf("https://blog.example.com/post"), "blog.example.com");
  assert.equal(domains.status("blog.example.com", { whitelist: ["example.com"], blacklist: ["example.com"] }), "whitelist");

  const moved = domains.apply({ whitelist: ["a.com"], blacklist: ["b.com"] }, "b.com", "whitelist");
  assert.deepEqual(Array.from(moved.whitelist).sort(), ["a.com", "b.com"]);
  assert.deepEqual(Array.from(moved.blacklist), []);

  const removed = domains.apply({ whitelist: ["a.com"], blacklist: [] }, "a.com", "");
  assert.deepEqual(Array.from(removed.whitelist), []);
});

for (const separateWindow of [true, false]) {
  const browser = separateWindow ? "Firefox" : "Chrome";
  test(`${browser}: content scripts retain helpers and respond to manual detection`, async () => {
    const { context, listeners, sent } = environment(separateWindow);
    for (const file of manifest.content_scripts[0].js) load(context, file);
    await tick();

    const api = context.ALETHEIA;
    assert.equal(api.DEFAULTS.jevBaseUrl, "https://api.typesafe.ai");
    assert.equal("apiUrl" in api.DEFAULTS, false);
    assert.equal("runMode" in api.DEFAULTS, false);
    assert.equal(typeof api.storage.get, "function");
    assert.equal(typeof api.t, "function");
    assert.equal(typeof api.extractArticle, "function");
    assert.equal(typeof api.badge.showResult, "function");
    assert.equal(listeners.length, 1);
    assert.equal(sent.length, 0, "automatic detection respects the blacklist");

    const text = "An article with enough text for manual detection. ".repeat(10);
    let result;
    api.extractArticle = options => {
      assert.equal(options.skipReadabilityCheck, true);
      return { title: "Article", textContent: text };
    };
    api.badge = {
      remove() {},
      showLoading() {},
      showResult(data) { result = data; },
      showError(message) { assert.fail(message); }
    };
    let response;
    listeners[0]({ type: api.MSG.MANUAL_DETECT }, {}, value => { response = value; });
    assert.equal(response.ok, true);
    await tick();
    assert.equal(sent.length, 1);
    assert.equal(sent[0].type, api.MSG.DETECT_TEXT);
    assert.equal(sent[0].text, text);
    assert.equal(sent[0].forceRerun, true, "manual detection bypasses completed results");
    assert.equal(result.label, "human");
  });

  test(`${browser}: background dependencies send Jev detection requests`, async () => {
    const { context, listeners } = environment(false, {
      sync: { localContent: true },
      local: { jevApiKey: "test-key" }
    });
    let requested = "";
    let payload = null;
    context.fetch = async (url, options) => {
      requested = String(url);
      payload = JSON.parse(options.body);
      return {
        ok: true,
        json: async () => ({
          model: "jev-latest",
          answers: {
            ai_generated: { noul: 0.1 },
            content_type: {
              choice: "original",
              confidence: 0.8,
              probabilities: { original: 0.8 }
            }
          }
        })
      };
    };
    loadBackground(context, separateWindow);
    assert.equal(typeof context.ALETHEIA.questions.buildState, "function");
    assert.equal(typeof context.ALETHEIA.jev.detect, "function");
    const response = await detectViaBackground(listeners, {
      text: "Article",
      title: "Title",
      url: "https://example.com/article"
    });
    assert.match(requested, /\/v1\/systemone$/);
    assert.equal(payload.questions.ai_generated.type, "noul");
    assert.equal(payload.questions.content_type.type, "choice");
    assert.equal(payload.state.title, "Title");
    assert.equal(response.success, true);
    assert.equal(response.data.label, "human");
    assert.equal(response.data.detector, "jev");
    assert.equal(response.data.content.label, "original");
    assert.equal(response.data.content.name, "contentOriginal");
  });

  test(`${browser}: custom categories build the classification prompt`, async () => {
    const { context, listeners } = environment(false, {
      sync: {
        localContent: true,
        contentCategories: [
          { id: "news", label: "News", description: "Reports on current events." },
          { id: "opinion", label: "Opinion", description: "" }
        ]
      },
      local: { jevApiKey: "test-key" }
    });
    let payload = null;
    context.fetch = async (url, options) => {
      payload = JSON.parse(options.body);
      return {
        ok: true,
        json: async () => ({
          model: "jev-latest",
          answers: {
            ai_generated: { noul: 0.9 },
            content_type: {
              choice: "opinion",
              confidence: 0.7,
              probabilities: { opinion: 0.7 }
            }
          }
        })
      };
    };
    loadBackground(context, separateWindow);
    const response = await detectViaBackground(listeners, { text: "Article" });

    assert.equal(payload.questions.content_type.type, "choice");
    assert.equal(
      payload.questions.content_type.instructions,
      "Classify this page into exactly one category: News, or Opinion."
    );
    assert.equal(
      payload.questions.content_type.criteria.news,
      "News: Reports on current events."
    );
    assert.equal(payload.questions.content_type.criteria.opinion, "Opinion");
    assert.equal(response.data.content.label, "opinion");
    assert.equal(response.data.content.name, "Opinion");

    const sanitized = context.ALETHEIA.questions.sanitizeCategories([
      { label: "First" },
      { label: "  " },
      { id: "news", label: "News", description: "Duplicate id handled" },
      { label: "Second", description: "Still here" }
    ]);
    assert.equal(
      sanitized.map(category => category.id).join(","),
      "category_1,news,category_2"
    );
    assert.equal(sanitized.length, 3);
  });
}

for (const separateWindow of [true, false]) {
  const browser = separateWindow ? "Firefox" : "Chrome";

  test(`${browser}: results are reused across URLs and survive background restart`, async () => {
    const stored = { local: { jevApiKey: "private-credential" }, session: {} };
    const first = environment(false, stored);
    let calls = 0;
    first.context.fetch = async () => { calls++; return jevResponse(); };
    loadBackground(first.context, separateWindow);
    const message = { text: "Full article body", title: "Title", url: "https://a.example/1" };
    const response = await detectViaBackground(first.listeners, message);
    const reused = await detectViaBackground(first.listeners, {
      ...message, title: "Another title", url: "https://b.example/2"
    });
    assert.deepEqual(reused, response);
    assert.equal(calls, 1);
    assert.doesNotMatch(JSON.stringify(stored.session), /Full article body|private-credential|a\.example/);

    const restarted = environment(false, stored);
    restarted.context.fetch = () => assert.fail("a restarted background should reuse the session cache");
    loadBackground(restarted.context, separateWindow);
    assert.equal((await detectViaBackground(restarted.listeners, message)).data.label, "human");
  });

  test(`${browser}: cache identity follows full text and detection configuration`, async () => {
    const stored = { sync: {}, local: { jevApiKey: "key-one" } };
    const { context, listeners } = environment(false, stored);
    let calls = 0;
    context.fetch = async () => { calls++; return jevResponse(); };
    loadBackground(context, separateWindow);
    const message = { text: "x".repeat(6000) + "tail one" };
    await detectViaBackground(listeners, message);
    await detectViaBackground(listeners, { text: "x".repeat(6000) + "tail two" });
    assert.equal(calls, 2, "text beyond the API budget still partitions the cache");

    Object.assign(stored.sync, {
      showBadgePercent: true, minTextLength: 400, whitelist: ["example.com"],
      contentCategories: [{ id: "news", label: "News", description: "Reporting" }]
    });
    await detectViaBackground(listeners, message);
    assert.equal(calls, 2, "display settings and unused categories do not invalidate results");

    stored.sync.localContent = true;
    await detectViaBackground(listeners, message);
    assert.equal(calls, 3);
    stored.sync.contentCategories[0].description = "First-hand reporting";
    await detectViaBackground(listeners, message);
    assert.equal(calls, 4);
    stored.sync.contentCategories[0].label = "Articles";
    await detectViaBackground(listeners, message);
    assert.equal(calls, 5);
    stored.sync.jevBaseUrl = "https://other.example";
    await detectViaBackground(listeners, message);
    assert.equal(calls, 6);
    stored.local.jevApiKey = "key-two";
    await detectViaBackground(listeners, message);
    assert.equal(calls, 7);

    stored.sync.jevBaseUrl += "/";
    stored.local.jevApiKey = " key-two ";
    await detectViaBackground(listeners, message);
    assert.equal(calls, 7, "credentials and base URL use the same trimming as the client");

    stored.local.jevApiKey = "";
    const missingKey = await detectViaBackground(listeners, message);
    assert.equal(missingKey.success, false);
    assert.equal(missingKey.error, "missingJevKey");
    assert.equal(calls, 7, "old cached results cannot mask removed credentials");
  });

  test(`${browser}: concurrent identical requests share one fetch and reruns refresh the cache`, async () => {
    const { context, listeners } = environment(false, { local: { jevApiKey: "key" } });
    const started = deferred();
    const release = deferred();
    const refreshStarted = deferred();
    const refreshRelease = deferred();
    let calls = 0;
    context.fetch = async () => {
      calls++;
      if (calls === 1) {
        started.resolve();
        await release.promise;
      }
      if (calls === 2) {
        refreshStarted.resolve();
        await refreshRelease.promise;
      }
      return jevResponse(calls === 1 ? 0.1 : 0.9);
    };
    loadBackground(context, separateWindow);
    const joined = keysReady(context, 9);
    const message = { text: "Same body" };
    const first = detectViaBackground(listeners, message);
    await started.promise;
    // Multiple automatic/manual callers, including different tabs.
    const requests = Array.from({ length: 8 }, (_, i) => detectViaBackground(listeners, {
      ...message, url: `https://example.com/${i}`, forceRerun: i % 2 === 0
    }));
    await joined;
    release.resolve();
    const responses = await Promise.all([first, ...requests]);
    assert.equal(calls, 1);
    assert.ok(responses.every(response => response.success && response.data.label === "human"));

    const refreshJoined = keysReady(context, 3);
    const rerun = detectViaBackground(listeners, { ...message, forceRerun: true });
    await refreshStarted.promise;
    const duringRefresh = [
      detectViaBackground(listeners, message),
      detectViaBackground(listeners, { ...message, forceRerun: true })
    ];
    await refreshJoined;
    refreshRelease.resolve();
    const [refreshed, ...joinedResults] = await Promise.all([rerun, ...duringRefresh]);
    assert.equal(calls, 2);
    assert.equal(refreshed.data.label, "ai");
    assert.ok(joinedResults.every(response => response.data.label === "ai"), "callers await the refresh instead of receiving stale cache");
    const cached = await detectViaBackground(listeners, message);
    assert.equal(calls, 2);
    assert.deepEqual(cached, refreshed);
  });

  test(`${browser}: different bodies and configurations run independently`, async () => {
    const stored = { sync: {}, local: { jevApiKey: "key" } };
    const { context, listeners } = environment(false, stored);
    const firstStarted = deferred();
    const release = deferred();
    const payloads = [];
    context.fetch = async (url, options) => {
      payloads.push(JSON.parse(options.body));
      firstStarted.resolve();
      await release.promise;
      return jevResponse();
    };
    loadBackground(context, separateWindow);
    const joined = keysReady(context, 3);
    const first = detectViaBackground(listeners, { text: "body one" });
    await firstStarted.promise;
    const second = detectViaBackground(listeners, { text: "body two" });
    // Wait until the second request has read the previous settings snapshot.
    await tick();
    stored.sync.localContent = true;
    const third = detectViaBackground(listeners, { text: "body one" });
    await joined;
    assert.equal(payloads.length, 3);
    assert.equal(payloads.filter(payload => payload.questions.content_type).length, 1);
    release.resolve();
    assert.ok((await Promise.all([first, second, third])).every(response => response.success));
  });

  test(`${browser}: concurrent failures are shared and failed results can be retried`, async () => {
    const { context, listeners } = environment(false, { local: { jevApiKey: "key" } });
    let calls = 0;
    const release = deferred();
    context.fetch = async () => {
      calls++;
      if (calls === 1) {
        await release.promise;
        throw new Error("offline");
      }
      return jevResponse();
    };
    loadBackground(context, separateWindow);
    const joined = keysReady(context, 2);
    const message = { text: "Retry body" };
    const pending = [detectViaBackground(listeners, message), detectViaBackground(listeners, message)];
    await joined;
    release.resolve();
    const failures = await Promise.all(pending);
    assert.equal(calls, 1);
    assert.ok(failures.every(response => !response.success && response.error === "offline"));
    assert.equal((await detectViaBackground(listeners, message)).success, true);
    assert.equal(calls, 2);
  });

  test(`${browser}: cache expires and evicts the least recently used body`, async () => {
    const { context, listeners, sessionStored } = environment(false, { local: { jevApiKey: "key" } });
    let now = 1_000_000;
    context.Date = { now: () => now };
    let calls = 0;
    context.fetch = async () => { calls++; return jevResponse(); };
    loadBackground(context, separateWindow);
    await detectViaBackground(listeners, { text: "expires" });
    now += 24 * 60 * 60 * 1000 - 1;
    await detectViaBackground(listeners, { text: "expires" });
    assert.equal(calls, 1);
    now++;
    await detectViaBackground(listeners, { text: "expires" });
    assert.equal(calls, 2);
    for (let i = 0; i < 99; i++) await detectViaBackground(listeners, { text: `body ${i}` });
    await detectViaBackground(listeners, { text: "expires" });
    await detectViaBackground(listeners, { text: "one more body" });
    const before = calls;
    await detectViaBackground(listeners, { text: "expires" });
    assert.equal(calls, before, "a recently used entry survives eviction");
    await detectViaBackground(listeners, { text: "body 0" });
    assert.equal(calls, before + 1);
    assert.equal(sessionStored.detectionResultsV1.length, 100);
  });

  test(`${browser}: session storage failures fall back to memory`, async () => {
    for (const mode of ["absent", "error", "throw"]) {
      const { context, listeners } = environment(false, { local: { jevApiKey: "key" } });
      if (mode === "absent") delete context.chrome.storage.session;
      if (mode === "error") {
        const fail = (items, callback) => {
          context.chrome.runtime.lastError = { message: "storage unavailable" };
          callback();
          delete context.chrome.runtime.lastError;
        };
        context.chrome.storage.session = { get: fail, set: fail };
      }
      if (mode === "throw") {
        const fail = () => { throw new Error("storage unavailable"); };
        context.chrome.storage.session = { get: fail, set: fail };
      }
      let calls = 0;
      context.fetch = async () => { calls++; return jevResponse(); };
      loadBackground(context, separateWindow);
      assert.equal((await detectViaBackground(listeners, { text: "body" })).success, true);
      assert.equal((await detectViaBackground(listeners, { text: "body" })).success, true);
      assert.equal(calls, 1, mode);
    }
  });
}
