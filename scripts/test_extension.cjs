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

function environment(separateWindow) {
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
            callback({ ...defaults, blacklist: ["example.com"] });
          }
        },
        local: { get: (defaults, callback) => callback({ ...defaults }) }
      },
      i18n: { getMessage: key => key }
    },
    location: { hostname: "example.com", href: "https://example.com/article" }
  });
  // Firefox content-script globals inherit DOM APIs from a distinct window.
  // Chrome content scripts and extension pages use the window as their global.
  context.self = separateWindow ? { location: context.location } : context;
  context.window = context.self;
  return { context, listeners, sent };
}

for (const separateWindow of [true, false]) {
  const browser = separateWindow ? "Firefox" : "Chrome";
  test(`${browser}: content scripts retain helpers and respond to manual detection`, async () => {
    const { context, listeners, sent } = environment(separateWindow);
    for (const file of manifest.content_scripts[0].js) load(context, file);
    await tick();

    const api = context.ALETHEIA;
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

  test(`${browser}: background dependencies handle detection requests`, async () => {
    const { context, listeners } = environment(false);
    context.fetch = async () => ({ ok: true, json: async () => ({ label: "human" }) });
    if (separateWindow) {
      for (const file of manifest.background.scripts) load(context, file);
    } else {
      context.importScripts = (...files) => {
        for (const file of files) load(context, path.posix.join("background", file));
      };
      load(context, manifest.background.service_worker);
    }
    assert.equal(typeof context.ALETHEIA.questions.buildState, "function");
    assert.equal(typeof context.ALETHEIA.jev.detect, "function");
    const response = await new Promise(resolve => {
      const pending = listeners[0]({ type: "DETECT_TEXT", text: "Article" }, {}, resolve);
      assert.equal(pending, true);
    });
    assert.equal(response.success, true);
    assert.equal(response.data.label, "human");
  });
}
