var ALETHEIA = globalThis.ALETHEIA || {};

ALETHEIA.questions = (function () {
  var TEXT_BUDGET = 6000;

  var aiGenerated = Object.freeze({
    type: "noul",
    instructions: "Was this text written by an AI language model rather than a human?",
    criteria: Object.freeze({
      true: "The text was written by an AI language model.",
      false: "The text was written by a human."
    })
  });

  var contentType = Object.freeze({
    type: "choice",
    instructions: "Classify this page into exactly one category: original writing, reposted content, or an advertisement.",
    criteria: Object.freeze({
      original: "原创: first-hand writing with the author's own reporting, experience, or analysis.",
      repost: "搬运: copied, aggregated, or lightly rewritten from another source, with little original reporting.",
      ad: "广告: promotional content. Includes 软广 (reads like an article or review but promotes a brand, product, or service) and 硬广 (explicit sales pitch, price, coupon, or purchase call-to-action)."
    })
  });

  function guessLang(text) {
    var sample = String(text || "").slice(0, 2000);
    var cjk = sample.match(/[\u4e00-\u9fff]/g);
    return cjk && cjk.length >= 8 ? "zh" : "en";
  }

  function buildState(message) {
    var state = { text: String(message.text || "").slice(0, TEXT_BUDGET) };
    var title = String(message.title || "").trim();
    var url = String(message.url || "").trim();
    if (title) state.title = title;
    if (url) state.url = url;
    return state;
  }

  function forSettings(settings) {
    var questions = { ai_generated: aiGenerated };
    if (settings.localContent) questions.content_type = contentType;
    return questions;
  }

  function choiceConfidence(choice) {
    if (typeof choice.confidence === "number") return choice.confidence;
    var probs = choice.probabilities || {};
    if (typeof probs[choice.choice] === "number") return probs[choice.choice];
    return 0;
  }

  function toDetectResponse(engineName, modelId, lang, answers) {
    var noul = answers && answers.ai_generated;
    if (!noul || typeof noul.noul !== "number") {
      throw new Error(ALETHEIA.t("missingAiJudgment"));
    }
    var probability = noul.noul;
    var label = probability >= 0.5 ? "ai" : "human";
    var score = label === "ai" ? probability : 1 - probability;
    var data = {
      label: label,
      score: score,
      model_id: modelId || engineName,
      detected_lang: lang,
      num_chunks: 1,
      detector: engineName
    };
    var choice = answers.content_type;
    if (choice && choice.choice) {
      data.content = {
        engine: engineName,
        model_id: modelId || engineName,
        label: choice.choice,
        confidence: choiceConfidence(choice),
        probabilities: choice.probabilities || {}
      };
    }
    return data;
  }

  return {
    TEXT_BUDGET: TEXT_BUDGET,
    aiGenerated: aiGenerated,
    contentType: contentType,
    guessLang: guessLang,
    buildState: buildState,
    forSettings: forSettings,
    toDetectResponse: toDetectResponse
  };
})();
