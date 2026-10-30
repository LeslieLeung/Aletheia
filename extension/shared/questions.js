var ALETHEIA = globalThis.ALETHEIA || {};

ALETHEIA.questions = (function () {
  var TEXT_BUDGET = 6000;
  var MAX_CATEGORIES = 10;

  var aiGenerated = Object.freeze({
    type: "noul",
    instructions: "Was this text written by an AI language model rather than a human?",
    criteria: Object.freeze({
      true: "The text was written by an AI language model.",
      false: "The text was written by a human."
    })
  });

  // Built-in categories. Labels follow the UI language; descriptions are the
  // exact wording sent to the selected model.
  var DEFAULT_CATEGORIES = Object.freeze([
    Object.freeze({
      id: "original",
      labelKey: "contentOriginal",
      description: "first-hand writing with the author's own reporting, experience, or analysis."
    }),
    Object.freeze({
      id: "repost",
      labelKey: "contentRepost",
      description: "copied, aggregated, or lightly rewritten from another source, with little original reporting."
    }),
    Object.freeze({
      id: "ad",
      labelKey: "contentAd",
      description: "promotional content. Includes 软广 (reads like an article or review but promotes a brand, product, or service) and 硬广 (explicit sales pitch, price, coupon, or purchase call-to-action)."
    })
  ]);

  function defaultContentCategories() {
    return DEFAULT_CATEGORIES.map(function (category) {
      return {
        id: category.id,
        label: ALETHEIA.t(category.labelKey),
        description: category.description
      };
    });
  }

  function nextCategoryId(categories) {
    var used = {};
    var i;
    for (i = 0; i < categories.length; i++) used[categories[i].id] = true;
    var n = 1;
    while (used["category_" + n]) n++;
    return "category_" + n;
  }

  function sanitizeCategories(raw) {
    if (!Array.isArray(raw) || raw.length === 0) return defaultContentCategories();

    var used = {};
    var categories = [];
    raw.slice(0, MAX_CATEGORIES).forEach(function (item) {
      var label = String((item && item.label) || "").trim();
      if (!label) return;
      var id = String((item && item.id) || "").trim();
      if (!id || used[id]) id = nextCategoryId(categories);
      used[id] = true;
      categories.push({
        id: id,
        label: label,
        description: String((item && item.description) || "").trim()
      });
    });

    return categories.length ? categories : defaultContentCategories();
  }

  function categoriesFrom(settings) {
    return sanitizeCategories(settings && settings.contentCategories);
  }

  function joinLabels(labels) {
    if (labels.length <= 1) return labels[0] || "";
    return labels.slice(0, -1).join(", ") + ", or " + labels[labels.length - 1];
  }

  // Renders the user's categories into a System One choice question. The criteria
  // keys are the stored category ids; the values are the prompt text.
  function contentTypeFor(categories) {
    var criteria = {};
    var labels = [];
    (categories || []).forEach(function (category) {
      var label = String((category && category.label) || "").trim();
      if (!label) return;
      var id = String(category.id || "").trim() || label;
      var description = String(category.description || "").trim();
      criteria[id] = description ? label + ": " + description : label;
      labels.push(label);
    });

    var instructions = "Classify this page into exactly one category.";
    if (labels.length) {
      instructions = "Classify this page into exactly one category: " + joinLabels(labels) + ".";
    }

    return {
      type: "choice",
      instructions: instructions,
      criteria: criteria
    };
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
    if (settings.localContent) {
      questions.content_type = contentTypeFor(categoriesFrom(settings));
    }
    return questions;
  }

  function categoryName(id, categories) {
    var list = categories || [];
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === id) return list[i].label;
    }
    return id;
  }

  function choiceConfidence(choice) {
    if (typeof choice.confidence === "number") return choice.confidence;
    var probs = choice.probabilities || {};
    if (typeof probs[choice.choice] === "number") return probs[choice.choice];
    return 0;
  }

  function toDetectResponse(engineName, modelId, answers, categories) {
    var noul = answers && answers.ai_generated;
    if (!noul || !Number.isFinite(noul.noul) || noul.noul < 0 || noul.noul > 1) {
      throw new Error(ALETHEIA.t("missingAiJudgment"));
    }
    var probability = noul.noul;
    var label = probability >= 0.5 ? "ai" : "human";
    var score = label === "ai" ? probability : 1 - probability;
    var data = {
      label: label,
      score: score,
      model_id: modelId || engineName,
      detector: engineName
    };
    var choice = answers.content_type;
    if (choice && choice.choice) {
      data.content = {
        engine: engineName,
        model_id: modelId || engineName,
        label: choice.choice,
        name: categoryName(choice.choice, categories || []),
        confidence: choiceConfidence(choice),
        probabilities: choice.probabilities || {}
      };
    }
    return data;
  }

  return {
    TEXT_BUDGET: TEXT_BUDGET,
    MAX_CATEGORIES: MAX_CATEGORIES,
    aiGenerated: aiGenerated,
    defaultContentCategories: defaultContentCategories,
    nextCategoryId: nextCategoryId,
    sanitizeCategories: sanitizeCategories,
    categoriesFrom: categoriesFrom,
    contentTypeFor: contentTypeFor,
    buildState: buildState,
    forSettings: forSettings,
    toDetectResponse: toDetectResponse
  };
})();
