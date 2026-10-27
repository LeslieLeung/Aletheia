var ALETHEIA = globalThis.ALETHEIA || {};

ALETHEIA.badge = (function () {
  var host = null;
  var shadow = null;
  var expanded = false;
  var currentResult = null;

  function esc(str) {
    var el = document.createElement("span");
    el.textContent = str;
    return el.innerHTML;
  }

  function getStyles() {
    return '\
      * { box-sizing: border-box; margin: 0; padding: 0; } \
      :host { \
        all: initial; \
        font-family: system-ui, -apple-system, "Segoe UI", sans-serif; \
        --surface: #ffffff; \
        --text: #1f1f26; \
        --muted: #6b6b78; \
        --line: #efeff4; \
        --track: #ececf2; \
        --shadow: 0 10px 30px rgba(15, 15, 30, 0.16), 0 2px 6px rgba(15, 15, 30, 0.08); \
        --human-bg: #dcfce7; --human-fg: #166534; --human-bar: #22c55e; \
        --ai-bg: #fee2e2; --ai-fg: #991b1b; --ai-bar: #ef4444; \
        --err-bg: #fef3c7; --err-fg: #92400e; \
        --load-bg: #f3f4f6; --load-fg: #6b7280; \
      } \
      @media (prefers-color-scheme: dark) { \
        :host { \
          --surface: #1f1f27; \
          --text: #ececf1; \
          --muted: #a1a1ad; \
          --line: #2d2d39; \
          --track: #33333f; \
          --shadow: 0 10px 30px rgba(0, 0, 0, 0.5); \
          --human-bg: #14532d; --human-fg: #bbf7d0; --human-bar: #4ade80; \
          --ai-bg: #7f1d1d; --ai-fg: #fecaca; --ai-bar: #f87171; \
          --err-bg: #78350f; --err-fg: #fde68a; \
          --load-bg: #2a2a33; --load-fg: #c4c4cf; \
        } \
      } \
      .wrap { \
        position: relative; \
        display: inline-flex; \
        flex-direction: column; \
        align-items: flex-end; \
        animation: rise 0.25s cubic-bezier(0.2, 0.8, 0.3, 1); \
      } \
      @keyframes rise { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } } \
      .badge-pill { \
        display: inline-flex; \
        align-items: center; \
        justify-content: center; \
        gap: 7px; \
        width: 200px; \
        height: 34px; \
        padding: 0 14px; \
        border: none; \
        border-radius: 999px; \
        font: inherit; \
        font-size: 13px; \
        font-weight: 700; \
        line-height: 1; \
        white-space: nowrap; \
        font-variant-numeric: tabular-nums; \
        cursor: pointer; \
        user-select: none; \
        box-shadow: 0 2px 10px rgba(0,0,0,0.14); \
        transition: box-shadow 0.2s ease, transform 0.2s ease; \
      } \
      .badge-pill:hover { box-shadow: 0 6px 16px rgba(0,0,0,0.2); transform: translateY(-1px); } \
      .badge-pill:active { transform: translateY(0); } \
      .badge-pill:focus-visible { outline: 2px solid currentColor; outline-offset: 2px; } \
      .badge-pill.loading { cursor: default; background: var(--load-bg); color: var(--load-fg); font-weight: 600; } \
      .badge-pill.loading:hover { box-shadow: 0 2px 10px rgba(0,0,0,0.14); transform: none; } \
      .badge-pill.human { background: var(--human-bg); color: var(--human-fg); } \
      .badge-pill.ai { background: var(--ai-bg); color: var(--ai-fg); } \
      .badge-pill.error { background: var(--err-bg); color: var(--err-fg); } \
      .badge-pill .dot { \
        width: 7px; height: 7px; flex: 0 0 7px; \
        border-radius: 50%; background: currentColor; \
      } \
      .badge-pill.ai .dot { animation: pulse 2s ease-in-out infinite; } \
      @keyframes pulse { 50% { opacity: 0.35; } } \
      .badge-pill .sep { width: 1px; height: 12px; background: currentColor; opacity: 0.35; flex: 0 0 1px; } \
      .badge-pill .content-name { max-width: 110px; overflow: hidden; text-overflow: ellipsis; font-weight: 600; } \
      .badge-pill .err-text { overflow: hidden; text-overflow: ellipsis; } \
      .spinner { \
        width: 13px; height: 13px; \
        border: 2px solid currentColor; \
        border-right-color: transparent; \
        border-radius: 50%; \
        animation: spin 0.7s linear infinite; \
      } \
      @keyframes spin { to { transform: rotate(360deg); } } \
      .dismiss { \
        position: absolute; \
        top: -6px; left: -6px; \
        width: 20px; height: 20px; \
        display: grid; place-items: center; \
        border: none; border-radius: 50%; \
        background: var(--surface); color: var(--muted); \
        box-shadow: 0 1px 4px rgba(0,0,0,0.2); \
        font: inherit; font-size: 13px; line-height: 1; \
        cursor: pointer; \
        opacity: 0; transform: scale(0.8); \
        transition: opacity 0.15s, transform 0.15s; \
      } \
      .wrap:hover .dismiss, .dismiss:focus-visible { opacity: 1; transform: none; } \
      .dismiss:hover { color: var(--text); } \
      .panel { \
        position: absolute; \
        bottom: calc(100% + 10px); \
        right: 0; \
        width: 290px; \
        padding: 16px; \
        border-radius: 14px; \
        background: var(--surface); \
        color: var(--text); \
        box-shadow: var(--shadow); \
        font-size: 13px; \
        line-height: 1.5; \
        opacity: 0; \
        visibility: hidden; \
        transform: translateY(6px) scale(0.98); \
        transform-origin: bottom right; \
        transition: opacity 0.18s ease, transform 0.18s ease, visibility 0s linear 0.18s; \
      } \
      .panel.show { \
        opacity: 1; visibility: visible; transform: none; \
        transition: opacity 0.18s ease, transform 0.18s ease; \
      } \
      .panel-title { \
        display: flex; align-items: center; gap: 8px; \
        padding-right: 22px; \
        font-size: 14px; font-weight: 700; \
      } \
      .panel-label { \
        display: inline-block; \
        padding: 2px 9px; \
        border-radius: 999px; \
        font-size: 12px; font-weight: 700; \
      } \
      .panel-label.human { background: var(--human-bg); color: var(--human-fg); } \
      .panel-label.ai { background: var(--ai-bg); color: var(--ai-fg); } \
      .panel-label.error { background: var(--err-bg); color: var(--err-fg); } \
      .meter { margin: 14px 0 10px; } \
      .meter-head { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 6px; } \
      .meter-key { color: var(--muted); font-size: 12px; } \
      .meter-val { font-size: 20px; font-weight: 700; font-variant-numeric: tabular-nums; letter-spacing: -0.02em; } \
      .meter-track { height: 6px; border-radius: 999px; background: var(--track); overflow: hidden; } \
      .meter-fill { height: 100%; border-radius: inherit; width: 0; transition: width 0.6s cubic-bezier(0.2, 0.8, 0.3, 1); } \
      .meter-fill.human { background: var(--human-bar); } \
      .meter-fill.ai { background: var(--ai-bar); } \
      .panel-row { \
        display: flex; justify-content: space-between; gap: 12px; \
        padding: 6px 0; \
        border-top: 1px solid var(--line); \
        font-size: 12.5px; \
      } \
      .panel-key { color: var(--muted); flex: 0 0 auto; } \
      .panel-val { font-weight: 600; text-align: right; min-width: 0; overflow-wrap: anywhere; } \
      .panel-msg { margin-top: 10px; color: var(--muted); font-size: 12.5px; overflow-wrap: anywhere; } \
      .close-btn { \
        position: absolute; top: 10px; right: 10px; \
        width: 24px; height: 24px; \
        display: grid; place-items: center; \
        border: none; border-radius: 6px; \
        background: none; color: var(--muted); \
        font: inherit; font-size: 17px; line-height: 1; \
        cursor: pointer; \
      } \
      .close-btn:hover { background: var(--line); color: var(--text); } \
      @media (prefers-reduced-motion: reduce) { \
        *, .wrap, .panel { animation: none !important; transition: none !important; } \
      } \
    ';
  }

  function onDocumentPointer(e) {
    if (!expanded || !host) return;
    var path = e.composedPath ? e.composedPath() : [];
    if (path.indexOf(host) === -1) setExpanded(false);
  }

  function onDocumentKey(e) {
    if (expanded && e.key === "Escape") setExpanded(false);
  }

  function create() {
    if (host) return;
    host = document.createElement("div");
    host.id = "aletheia-badge-host";
    shadow = host.attachShadow({ mode: "closed" });

    var style = document.createElement("style");
    style.textContent = getStyles();
    shadow.appendChild(style);

    var wrapper = document.createElement("div");
    wrapper.className = "wrap";
    shadow.appendChild(wrapper);

    document.body.appendChild(host);
    document.addEventListener("pointerdown", onDocumentPointer, true);
    document.addEventListener("keydown", onDocumentKey, true);
  }

  function getWrapper() {
    return shadow.querySelector(".wrap");
  }

  function setExpanded(next) {
    expanded = next;
    if (!shadow) return;
    var panel = shadow.getElementById("panel");
    var pill = shadow.getElementById("pill");
    if (panel) panel.classList.toggle("show", expanded);
    if (pill) pill.setAttribute("aria-expanded", expanded ? "true" : "false");
    if (expanded) {
      var fill = shadow.getElementById("meter-fill");
      if (fill) {
        requestAnimationFrame(function () {
          fill.style.width = fill.dataset.width;
        });
      }
    }
  }

  function dismissButton() {
    var label = esc(ALETHEIA.t("hideBadge"));
    return '<button type="button" class="dismiss" id="dismiss" title="' + label + '" aria-label="' + label + '">\u00d7</button>';
  }

  function bindCommon() {
    var pill = shadow.getElementById("pill");
    var closeBtn = shadow.getElementById("close-panel");
    var dismiss = shadow.getElementById("dismiss");

    if (pill) {
      pill.addEventListener("click", function () {
        setExpanded(!expanded);
      });
    }
    if (closeBtn) {
      closeBtn.addEventListener("click", function (e) {
        e.stopPropagation();
        setExpanded(false);
        if (pill) pill.focus();
      });
    }
    if (dismiss) {
      dismiss.addEventListener("click", function (e) {
        e.stopPropagation();
        remove();
      });
    }
  }

  function showLoading() {
    create();
    expanded = false;
    currentResult = null;
    var wrapper = getWrapper();
    wrapper.innerHTML =
      '<div class="badge-pill loading" role="status">' +
        '<div class="spinner"></div>' +
        '<span>' + esc(ALETHEIA.t("detecting")) + '</span>' +
      '</div>';
  }

  var CONTENT_KEYS = {
    original: "contentOriginal",
    repost: "contentRepost",
    ad: "contentAd"
  };

  function resultLabel(label) {
    if (label === "human") return ALETHEIA.t("labelHuman");
    if (label === "ai") return ALETHEIA.t("labelAi");
    return label;
  }

  function contentInfo(data) {
    if (!data.content || !data.content.label) return null;
    var key = CONTENT_KEYS[data.content.label];
    var name = data.content.name || (key ? ALETHEIA.t(key) : data.content.label);
    return {
      name: name,
      confidence: (data.content.confidence * 100).toFixed(1)
    };
  }

  function row(key, value) {
    return '<div class="panel-row"><span class="panel-key">' + esc(ALETHEIA.t(key)) +
      '</span><span class="panel-val">' + esc(value) + '</span></div>';
  }

  function contentRow(data) {
    var info = contentInfo(data);
    if (!info) return "";
    return row("content", info.name + " · " + info.confidence + "%");
  }

  function languageRow(data) {
    if (!data.detected_lang) return "";
    return row("language", data.detected_lang);
  }

  function modelRow(data) {
    if (!data.model_id) return "";
    return row("model", data.model_id);
  }

  function chunksRow(data) {
    if (typeof data.num_chunks !== "number") return "";
    return row("chunks", String(data.num_chunks));
  }

  function pillInner(displayLabel, score, data, showPercent) {
    var info = contentInfo(data);
    var labelText = showPercent ? displayLabel + " " + score + "%" : displayLabel;
    var html = '<span class="dot"></span><span>' + esc(labelText) + "</span>";
    if (!info) return html;
    return html + '<span class="sep"></span><span class="content-name">' + esc(info.name) + "</span>";
  }

  function showResult(data, options) {
    create();
    currentResult = data;
    expanded = false;
    var label = data.label;
    var displayLabel = resultLabel(label);
    var score = (data.score * 100).toFixed(1);
    var showPercent = !!(options && options.showPercent);
    var cls = label === "human" ? "human" : "ai";

    var wrapper = getWrapper();
    wrapper.innerHTML =
      '<div class="panel" id="panel" role="dialog" aria-labelledby="panel-title">' +
        '<button type="button" class="close-btn" id="close-panel" aria-label="' + esc(ALETHEIA.t("close")) + '">\u00d7</button>' +
        '<div class="panel-title" id="panel-title">' +
          '<span class="panel-label ' + cls + '">' + esc(displayLabel) + '</span>' +
          '<span>' + esc(ALETHEIA.t("detectionResult")) + '</span>' +
        '</div>' +
        '<div class="meter">' +
          '<div class="meter-head">' +
            '<span class="meter-key">' + esc(ALETHEIA.t("confidence")) + '</span>' +
            '<span class="meter-val">' + score + '%</span>' +
          '</div>' +
          '<div class="meter-track"><div class="meter-fill ' + cls + '" id="meter-fill" data-width="' + score + '%"></div></div>' +
        '</div>' +
        contentRow(data) +
        languageRow(data) +
        modelRow(data) +
        chunksRow(data) +
      '</div>' +
      '<button type="button" class="badge-pill ' + cls + '" id="pill" aria-haspopup="dialog" aria-expanded="false">' +
        pillInner(displayLabel, score, data, showPercent) +
      '</button>' +
      dismissButton();

    bindCommon();
  }

  function showError(msg) {
    create();
    currentResult = null;
    expanded = false;
    var wrapper = getWrapper();
    var failed = ALETHEIA.t("detectionFailed");
    wrapper.innerHTML =
      '<div class="panel" id="panel" role="dialog" aria-labelledby="panel-title">' +
        '<button type="button" class="close-btn" id="close-panel" aria-label="' + esc(ALETHEIA.t("close")) + '">\u00d7</button>' +
        '<div class="panel-title" id="panel-title">' +
          '<span class="panel-label error">' + esc(failed) + '</span>' +
        '</div>' +
        '<p class="panel-msg">' + esc(msg || failed) + '</p>' +
      '</div>' +
      '<button type="button" class="badge-pill error" id="pill" title="' + esc(msg || failed) + '" aria-haspopup="dialog" aria-expanded="false">' +
        '<span class="dot"></span>' +
        '<span class="err-text">' + esc(failed) + '</span>' +
      '</button>' +
      dismissButton();

    bindCommon();
  }

  function remove() {
    if (host && host.parentNode) {
      host.parentNode.removeChild(host);
    }
    document.removeEventListener("pointerdown", onDocumentPointer, true);
    document.removeEventListener("keydown", onDocumentKey, true);
    host = null;
    shadow = null;
    expanded = false;
    currentResult = null;
  }

  return {
    showLoading: showLoading,
    showResult: showResult,
    showError: showError,
    remove: remove
  };
})();
