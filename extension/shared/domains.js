var ALETHEIA = globalThis.ALETHEIA || {};

ALETHEIA.domains = {
  // Accepts a bare domain, a URL, or a wildcard like "*.example.com".
  normalize: function (value) {
    var raw = String(value == null ? "" : value).trim().toLowerCase();
    if (!raw) return "";
    raw = raw.replace(/^\*\.?/, "");
    if (!/^[a-z][a-z0-9+.-]*:\/\//.test(raw)) raw = "https://" + raw;

    var host;
    try {
      host = new URL(raw).hostname;
    } catch (e) {
      return "";
    }
    host = host.replace(/^www\./, "").replace(/\.+$/, "");
    return /\s/.test(host) ? "" : host;
  },

  hostOf: function (url) {
    try {
      return new URL(url).hostname.replace(/^www\./, "");
    } catch (e) {
      return "";
    }
  },

  matches: function (domain, list) {
    if (!domain || !Array.isArray(list)) return false;
    return list.some(function (d) {
      return domain === d || domain.endsWith("." + d);
    });
  },

  // Whitelist takes priority over blacklist.
  status: function (domain, settings) {
    if (!domain) return "default";
    if (ALETHEIA.domains.matches(domain, settings.whitelist)) return "whitelist";
    if (ALETHEIA.domains.matches(domain, settings.blacklist)) return "blacklist";
    return "default";
  },

  // Returns a new whitelist/blacklist pair with the domain put in `list`
  // (or removed from both when `list` is falsy).
  apply: function (settings, domain, list) {
    var whitelist = (settings.whitelist || []).filter(function (d) {
      return d !== domain;
    });
    var blacklist = (settings.blacklist || []).filter(function (d) {
      return d !== domain;
    });
    if (list === "whitelist") whitelist.push(domain);
    if (list === "blacklist") blacklist.push(domain);
    return { whitelist: whitelist, blacklist: blacklist };
  }
};
