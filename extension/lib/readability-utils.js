var ALETHEIA = self.ALETHEIA || {};

ALETHEIA.extractArticle = function (options) {
  var skipCheck = options && options.skipReadabilityCheck;

  if (!skipCheck && typeof isProbablyReaderable === "function" && !isProbablyReaderable(document)) {
    return { skipped: true, reason: ALETHEIA.t("notAnArticle") };
  }

  var docClone = document.cloneNode(true);
  var reader = new Readability(docClone, { url: document.URL });
  var article = reader.parse();

  if (!article || !article.textContent) {
    return { skipped: true, reason: ALETHEIA.t("couldNotExtract") };
  }

  return {
    title: article.title || "",
    textContent: article.textContent.trim(),
    excerpt: article.excerpt || "",
    byline: article.byline || "",
    siteName: article.siteName || "",
    length: article.length || 0
  };
};
