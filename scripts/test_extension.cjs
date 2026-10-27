const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
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
        local: { get: (defaults, callback) => callback({ ...defaults, ...localStored }) }
      },
      i18n: { getMessage: key => key }
    },
    AbortSignal,
    URL,
    location: { hostname: "example.com", href: "https://example.com/article" }
  });
  // Firefox content-script globals inherit DOM APIs from a distinct window.
  // Chrome content scripts and extension pages use the window as their global.
  context.self = separateWindow ? { location: context.location } : context;
  context.window = context.self;
  return { context, listeners, sent };
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
