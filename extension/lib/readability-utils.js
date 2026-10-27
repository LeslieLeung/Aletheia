var ALETHEIA = globalThis.ALETHEIA || {};

// Auto-detect gate. Manual detect sets skipReadabilityCheck and bypasses it.
// isProbablyReaderable only checks that some readable text exists, so the gate
// also requires the page to be shaped like an article before showing a badge.

var PROSE_SELECTOR = "p, blockquote, div, section";
var BLOCK_MIN = 80;
var LONG_BLOCK = 140;
var MAX_LINK_DENSITY = 0.5;

var SHELL_SEGMENTS = {
  login: 1,
  signin: 1,
  "sign-in": 1,
  signup: 1,
  "sign-up": 1,
  register: 1,
  cart: 1,
  checkout: 1,
  account: 1,
  settings: 1,
  admin: 1,
  dashboard: 1,
  notifications: 1,
  messages: 1
};

var INDEX_SEGMENTS = {
  tag: 1,
  tags: 1,
  category: 1,
  categories: 1,
  author: 1,
  authors: 1,
  archive: 1,
  archives: 1,
  search: 1
};

var NON_ARTICLE_OG = {
  product: 1,
  profile: 1,
  book: 1,
  "video.other": 1,
  "video.movie": 1,
  "video.episode": 1,
  "video.tv_show": 1,
  "music.song": 1,
  "music.album": 1,
  "music.playlist": 1
};

var BLOCKED_SCHEMA = {
  Product: 1,
  ItemList: 1,
  CollectionPage: 1,
  SearchResultsPage: 1,
  ProfilePage: 1,
  CheckoutPage: 1,
  ItemPage: 1,
  OfferCatalog: 1,
  VideoObject: 1,
  SoftwareApplication: 1
};

var COMMERCE_ACTION = /add to cart|add to bag|buy now|buy it now|加入购物车|立即购买|立即下单|马上抢/i;

function plain(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function pageHref(doc) {
  if (doc.URL) return doc.URL;
  if (doc.location && doc.location.href) return doc.location.href;
  // document.URL is always set in a browser. baseURI covers DOM implementations
  // that only expose the document address there.
  return doc.baseURI || "";
}

function shown(node) {
  if (typeof isNodeVisible === "function") return isNodeVisible(node);
  return true;
}

function inBoilerplate(node) {
  return !!(
    node.closest &&
    node.closest("nav, header, footer, aside, [role='navigation'], [role='banner'], [role='contentinfo']")
  );
}

function isBareHomePath(pathname) {
  var path = String(pathname || "").replace(/\/+$/, "");
  return path === "" || /^\/index\.(?:html?|php)$/i.test(path);
}

function parsePageUrl(href) {
  try {
    return new URL(href);
  } catch (err) {
    return null;
  }
}

function isNonArticleUrl(href) {
  var url = parsePageUrl(href);
  if (!url) return false;

  var parts = url.pathname.split("/").filter(Boolean);
  var head = (parts[0] || "").toLowerCase();
  if ((SHELL_SEGMENTS[head] || INDEX_SEGMENTS[head]) && parts.length <= 2) return true;
  if (parts.length >= 2 && parts[parts.length - 2].toLowerCase() === "page" && /^\d+$/.test(parts[parts.length - 1])) {
    return true;
  }
  if (!isBareHomePath(url.pathname)) return false;

  var keys = ["s", "q", "query", "search", "wd", "keyword"];
  for (var i = 0; i < keys.length; i++) {
    if (url.searchParams.get(keys[i])) return true;
  }
  return false;
}

function metaContent(doc, name) {
  var node = doc.querySelector('meta[property="' + name + '"], meta[name="' + name + '"]');
  return node ? plain(node.getAttribute("content")).toLowerCase() : "";
}

function schemaKinds(doc) {
  var article = false;
  var blocked = false;
  var scripts = doc.querySelectorAll('script[type="application/ld+json"]');
  var limit = Math.min(scripts.length, 8);
  var typePattern = /"@type"\s*:\s*(\[[^\]]*\]|"[^"]+")/g;

  for (var i = 0; i < limit; i++) {
    var raw = scripts[i].textContent || "";
    if (raw.length > 100000) raw = raw.slice(0, 100000);
    typePattern.lastIndex = 0;
    var match;
    while ((match = typePattern.exec(raw))) {
      var pieces = match[1].split(",");
      for (var j = 0; j < pieces.length; j++) {
        var type = pieces[j].replace(/[\[\]"\s]/g, "").split("/").pop();
        if (!type) continue;
        if (/Article$/.test(type) || type === "BlogPosting" || type === "LiveBlogPosting") {
          article = true;
        } else if (BLOCKED_SCHEMA[type]) {
          blocked = true;
        }
      }
    }
  }

  return { article: article, blocked: blocked && !article };
}

function articleLengths(doc) {
  var nodes = doc.querySelectorAll("article, [role='article']");
  var lengths = [];
  for (var i = 0; i < nodes.length; i++) {
    var node = nodes[i];
    if (node.parentElement && node.parentElement.closest("article, [role='article']")) continue;
    if (!shown(node)) continue;
    var length = plain(node.textContent).length;
    if (length >= BLOCK_MIN) lengths.push(length);
  }
  return lengths;
}

function isCardListing(lengths) {
  if (lengths.length < 3) return false;
  var sorted = lengths.slice().sort(function (a, b) {
    return b - a;
  });
  return sorted[0] < 900 && sorted[0] < sorted[1] * 2.5;
}

function linksOut(heading) {
  var link = heading.querySelector("a[href]");
  if (!link && heading.parentElement && heading.parentElement.tagName === "A") {
    link = heading.parentElement;
  }
  if (!link) return false;
  var href = link.getAttribute("href") || "";
  return href !== "" && href.charAt(0) !== "#";
}

function isHeadingFeed(doc) {
  var headings = doc.querySelectorAll("h1, h2, h3");
  var total = 0;
  var linked = 0;
  for (var i = 0; i < headings.length; i++) {
    var heading = headings[i];
    if (!shown(heading) || inBoilerplate(heading)) continue;
    if (plain(heading.textContent).length < 8) continue;
    total++;
    if (linksOut(heading)) linked++;
  }
  return total >= 4 && linked >= 4 && linked / total >= 0.75;
}

function hasCommerceAction(doc) {
  var nodes = doc.querySelectorAll("button, input[type='submit'], input[type='button'], [role='button']");
  var limit = Math.min(nodes.length, 80);
  for (var i = 0; i < limit; i++) {
    var node = nodes[i];
    var label = plain(node.textContent || node.value || node.getAttribute("aria-label") || "");
    if (COMMERCE_ACTION.test(label)) return true;
  }
  return false;
}

function classifyPage(doc) {
  var href = pageHref(doc);
  var og = metaContent(doc, "og:type");
  var schema = schemaKinds(doc);
  var relaxed = og === "article" || schema.article;
  var lengths = articleLengths(doc);
  var url = parsePageUrl(href);
  var home = !!(url && isBareHomePath(url.pathname));
  var reject = false;

  if (isNonArticleUrl(href) || NON_ARTICLE_OG[og]) {
    reject = true;
  } else if (!relaxed && (schema.blocked || hasCommerceAction(doc))) {
    reject = true;
  } else if (home && lengths.length >= (relaxed ? 3 : 2)) {
    reject = true;
  } else if (!relaxed && (isHeadingFeed(doc) || isCardListing(lengths))) {
    reject = true;
  }

  return { reject: reject, relaxed: relaxed };
}

function blockDensity(node) {
  var textLength = plain(node.textContent).length;
  if (!textLength) return 1;
  var linkLength = 0;
  var links = node.querySelectorAll("a");
  for (var i = 0; i < links.length; i++) {
    linkLength += plain(links[i].textContent).length;
  }
  return Math.min(1, linkLength / textLength);
}

function hasParagraphChild(node) {
  var inner = node.querySelectorAll(PROSE_SELECTOR);
  for (var i = 0; i < inner.length; i++) {
    if (plain(inner[i].textContent).length >= BLOCK_MIN) return true;
  }
  return false;
}

function chunkLengths(node) {
  var html = node.innerHTML || "";
  if (!/<br\b/i.test(html)) {
    var length = plain(node.textContent).length;
    return length >= BLOCK_MIN ? [length] : [];
  }

  var parts = html.split(/<br\s*\/?>/gi);
  var sizes = [];
  for (var i = 0; i < parts.length; i++) {
    var size = plain(parts[i].replace(/<[^>]+>/g, "")).length;
    if (size >= BLOCK_MIN) sizes.push(size);
  }
  return sizes;
}

function proseRoot(html) {
  var parsed = new DOMParser().parseFromString(html, "text/html");
  var body = parsed.body;
  if (body && (body.children.length || plain(body.textContent))) return body;
  return parsed.documentElement || body;
}

function proseStats(html) {
  var root = proseRoot(html);
  if (!root) return null;

  var textLength = plain(root.textContent).length;
  var linkLength = 0;
  var links = root.querySelectorAll("a");
  var i;
  for (i = 0; i < links.length; i++) {
    linkLength += plain(links[i].textContent).length;
  }

  var lengths = [];
  var nodes = root.querySelectorAll(PROSE_SELECTOR);
  for (i = 0; i < nodes.length; i++) {
    var node = nodes[i];
    if (node.closest && node.closest("table, pre, code")) continue;
    if (hasParagraphChild(node) || blockDensity(node) > 0.65) continue;
    var chunks = chunkLengths(node);
    for (var j = 0; j < chunks.length; j++) lengths.push(chunks[j]);
  }

  var chars = 0;
  for (i = 0; i < lengths.length; i++) chars += lengths[i];

  return {
    lengths: lengths,
    count: lengths.length,
    chars: chars,
    density: textLength ? Math.min(1, linkLength / textLength) : 1
  };
}

function countAtLeast(lengths, minimum) {
  var count = 0;
  for (var i = 0; i < lengths.length; i++) {
    if (lengths[i] >= minimum) count++;
  }
  return count;
}

function bodyLooksLikeArticle(html, relaxed) {
  var stats;
  try {
    stats = proseStats(html);
  } catch (err) {
    return false;
  }
  if (!stats || stats.density > MAX_LINK_DENSITY) return false;

  var long = countAtLeast(stats.lengths, LONG_BLOCK);
  if (relaxed) {
    return (long >= 1 && stats.chars >= 280) || (stats.count >= 2 && stats.chars >= 220);
  }
  if (long >= 2 && stats.chars >= 400) return true;
  return stats.count >= 4 && stats.chars >= 480 && stats.chars / stats.count >= 100;
}

ALETHEIA.extractArticle = function (options) {
  var skipCheck = !!(options && options.skipReadabilityCheck);
  var relaxed = false;

  if (!skipCheck) {
    var verdict = classifyPage(document);
    if (verdict.reject) {
      return { skipped: true, reason: ALETHEIA.t("notAnArticle") };
    }
    relaxed = verdict.relaxed;
    if (typeof isProbablyReaderable === "function" && !isProbablyReaderable(document)) {
      return { skipped: true, reason: ALETHEIA.t("notAnArticle") };
    }
  }

  var docClone = document.cloneNode(true);
  var reader = new Readability(docClone, { url: document.URL });
  var article = reader.parse();

  if (!article || !article.textContent) {
    return { skipped: true, reason: ALETHEIA.t("couldNotExtract") };
  }

  if (!skipCheck && !bodyLooksLikeArticle(article.content, relaxed || !!article.publishedTime)) {
    return { skipped: true, reason: ALETHEIA.t("notAnArticle") };
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
