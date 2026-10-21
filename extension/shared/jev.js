var ALETHEIA = self.ALETHEIA || {};

ALETHEIA.jev = (function () {
  function trimBase(url) {
    return String(url || "").trim().replace(/\/+$/, "");
  }

  function endpoint(baseUrl, path) {
    var base = trimBase(baseUrl);
    if (path === "/v1/systemone" && /\/v1\/systemone$/i.test(base)) return base;
    if (path === "/v1/models" && /\/v1\/models$/i.test(base)) return base;
    return base + path;
  }

  function readError(response) {
    return response.text().then(function (text) {
      try {
        var data = JSON.parse(text);
        if (typeof data.detail === "string") return data.detail;
        if (data.error && typeof data.error.message === "string") return data.error.message;
        if (typeof data.message === "string") return data.message;
      } catch (e) {
        /* body is not JSON */
      }
      var trimmed = String(text || "").trim();
      return trimmed.slice(0, 300) || response.statusText || ALETHEIA.t("apiError");
    });
  }

  function fail(response) {
    if (response.status === 401 || response.status === 403) {
      return Promise.reject(new Error(ALETHEIA.t("jevAuthFailed")));
    }
    return readError(response).then(function (detail) {
      throw new Error(detail);
    });
  }

  function detect(settings, state, questions) {
    var key = String(settings.jevApiKey || "").trim();
    if (!key) return Promise.reject(new Error(ALETHEIA.t("missingJevKey")));
    var base = trimBase(settings.jevBaseUrl);
    if (!base) return Promise.reject(new Error(ALETHEIA.t("missingJevUrl")));

    return fetch(endpoint(base, "/v1/systemone"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + key
      },
      body: JSON.stringify({
        model: "jev-latest",
        state: state,
        questions: questions
      }),
      signal: AbortSignal.timeout(30000)
    }).then(function (response) {
      if (!response.ok) return fail(response);
      return response.json();
    }).then(function (data) {
      if (!data || !data.answers) throw new Error(ALETHEIA.t("missingAiJudgment"));
      return {
        success: true,
        data: ALETHEIA.questions.toDetectResponse(
          "jev",
          data.model || "jev-latest",
          ALETHEIA.questions.guessLang(state.text || ""),
          data.answers
        )
      };
    });
  }

  function test(baseUrl, apiKey) {
    var key = String(apiKey || "").trim();
    if (!key) return Promise.reject(new Error(ALETHEIA.t("missingJevKey")));
    var base = trimBase(baseUrl);
    if (!base) return Promise.reject(new Error(ALETHEIA.t("missingJevUrl")));

    return fetch(endpoint(base, "/v1/models"), {
      method: "GET",
      headers: { Authorization: "Bearer " + key },
      signal: AbortSignal.timeout(15000)
    }).then(function (response) {
      if (!response.ok) return fail(response);
      return true;
    });
  }

  return { detect: detect, test: test };
})();
