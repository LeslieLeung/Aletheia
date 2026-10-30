var ALETHEIA = globalThis.ALETHEIA || {};

// Each adapter owns its endpoint, request options and response envelope. The
// detection pipeline only sees typed System One questions and normalized results.
ALETHEIA.providers = (function () {
  function trim(value) { return String(value || "").trim(); }
  function trimBase(value) { return trim(value).replace(/\/+$/, ""); }

  function systemOneEndpoint(base, path) {
    return base.replace(/\/v1(?:\/(?:systemone|models))?$/i, "") + "/v1/" + path;
  }

  var adapters = {
    jev: {
      name: "Jev", baseUrl: "https://api.typesafe.ai", model: "jev-latest",
      models: ["jev-latest", "jev-preview"], requiresKey: true,
      endpoint: function (config) { return systemOneEndpoint(config.baseUrl, "systemone"); },
      testEndpoint: function (config) { return systemOneEndpoint(config.baseUrl, "models"); }
    },
    clef: {
      name: "Clef (Cloudflare)", model: "clef-flash",
      models: ["clef-flash", "clef"], requiresKey: true,
      endpoint: function (config) {
        return "https://api.cloudflare.com/client/v4/accounts/" +
          encodeURIComponent(config.accountId) + "/ai/run/@cf/cloudflare/" + config.model;
      },
      unwrap: function (data) {
        if (data && data.success === false) throw new Error(errorDetail(data));
        return data && data.result ? data.result : data;
      }
    },
    laya: {
      name: "Laya", baseUrl: "http://localhost:8000", model: "multilingual",
      models: ["multilingual", "english", "typed-decisions"], requiresKey: false,
      timeout: 60000,
      endpoint: function (config) { return systemOneEndpoint(config.baseUrl, "systemone"); },
      requestOptions: function (config) {
        // The multilingual checkpoint defaults to 1,024 tokens. Use its larger
        // window so a 6,000-character article is not silently cut to its opening.
        return config.model === "multilingual" ? { max_len: 8192 } : {};
      }
    }
  };

  function adapterFor(id) {
    if (!Object.prototype.hasOwnProperty.call(adapters, id)) {
      throw new Error(ALETHEIA.t("unknownProvider"));
    }
    return adapters[id];
  }

  function config(settings, providerId) {
    settings = settings || {};
    var id = providerId || settings.modelProvider || "jev";
    var adapter = adapterFor(id);
    var profiles = settings.providerConfigs || {};
    var profile = profiles[id] || {};
    var keys = settings.providerApiKeys || {};
    var key = Object.prototype.hasOwnProperty.call(keys, id) ? keys[id]
      : id === "jev" ? settings.jevApiKey : "";
    return {
      provider: id,
      baseUrl: id === "clef" ? "" : trimBase(profile.baseUrl ||
        (id === "jev" && !profiles.jev ? settings.jevBaseUrl : "") || adapter.baseUrl),
      model: trim(profile.model) || adapter.model,
      accountId: id === "clef" ? trim(profile.accountId) : "",
      apiKey: trim(key)
    };
  }

  function validate(settings, options) {
    var connection = config(settings);
    var adapter = adapterFor(connection.provider);
    if (connection.provider === "clef") {
      if (!/^[a-f0-9]{32}$/i.test(connection.accountId)) throw new Error(ALETHEIA.t("invalidAccountId"));
      if (adapter.models.indexOf(connection.model) === -1) throw new Error(ALETHEIA.t("invalidClefModel"));
    } else {
      var parsed;
      try { parsed = new URL(connection.baseUrl); }
      catch (e) { throw new Error(ALETHEIA.t("invalidUrl")); }
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") throw new Error(ALETHEIA.t("urlMustHttp"));
      if (parsed.username || parsed.password || parsed.search || parsed.hash) throw new Error(ALETHEIA.t("invalidUrl"));
    }
    if (adapter.requiresKey && !connection.apiKey && !(options && options.allowMissingKey)) {
      throw new Error(ALETHEIA.t("missingApiKey"));
    }
    return connection;
  }

  function isConfigured(settings) {
    try { validate(settings); return true; }
    catch (e) { return false; }
  }

  function errorDetail(data) {
    if (!data) return ALETHEIA.t("apiError");
    if (Array.isArray(data.errors) && data.errors.length) {
      return data.errors.map(function (item) { return item.message || String(item.code || ""); }).join("; ").slice(0, 300);
    }
    if (typeof data.detail === "string") return data.detail;
    if (data.error && typeof data.error.message === "string") return data.error.message;
    if (typeof data.message === "string") return data.message;
    return ALETHEIA.t("apiError");
  }

  async function readResponse(response) {
    if (response.status === 401 || response.status === 403) throw new Error(ALETHEIA.t("providerAuthFailed"));
    if (!response.ok) {
      var body = await response.text();
      var detail;
      try { detail = errorDetail(JSON.parse(body)); }
      catch (e) { detail = trim(body).slice(0, 300); }
      throw new Error(detail || response.statusText || ALETHEIA.t("apiError"));
    }
    return response.json();
  }

  function identity(settings) {
    var connection = validate(settings);
    var adapter = adapterFor(connection.provider);
    return {
      provider: connection.provider, endpoint: adapter.endpoint(connection),
      apiKey: connection.apiKey, model: connection.model,
      options: adapter.requestOptions ? adapter.requestOptions(connection) : {}
    };
  }

  async function request(settings, state, questions) {
    var connection = validate(settings);
    var adapter = adapterFor(connection.provider);
    var headers = { "Content-Type": "application/json" };
    if (connection.apiKey) headers.Authorization = "Bearer " + connection.apiKey;
    var body = Object.assign({ model: connection.model, state: state, questions: questions },
      adapter.requestOptions ? adapter.requestOptions(connection) : {});
    var response = await fetch(adapter.endpoint(connection), {
      method: "POST", headers: headers, body: JSON.stringify(body),
      signal: AbortSignal.timeout(adapter.timeout || 30000)
    });
    var data = await readResponse(response);
    if (adapter.unwrap) data = adapter.unwrap(data);
    if (!data || !data.answers) throw new Error(ALETHEIA.t("missingAiJudgment"));
    return { connection: connection, data: data };
  }

  async function detect(settings, state, questions) {
    var result = await request(settings, state, questions);
    return {
      success: true,
      data: ALETHEIA.questions.toDetectResponse(result.connection.provider,
        result.data.model || result.connection.model, result.data.answers,
        ALETHEIA.questions.categoriesFrom(settings))
    };
  }

  async function test(settings) {
    var connection = validate(settings);
    var adapter = adapterFor(connection.provider);
    if (adapter.testEndpoint) {
      var response = await fetch(adapter.testEndpoint(connection), {
        method: "GET", headers: { Authorization: "Bearer " + connection.apiKey },
        signal: AbortSignal.timeout(15000)
      });
      await readResponse(response);
    } else {
      // Validate the actual inference route, model, auth and answer schema.
      await detect(settings, { text: "This is a connection test." }, {
        ai_generated: { type: "noul", instructions: "Does the text describe a connection test?" }
      });
    }
    return true;
  }

  return {
    list: function () { return Object.keys(adapters); },
    info: adapterFor, config: config, validate: validate,
    isConfigured: isConfigured, identity: identity, detect: detect, test: test
  };
})();
