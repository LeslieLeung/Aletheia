var ALETHEIA = self.ALETHEIA || {};

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
      :host { all: initial; font-family: system-ui, -apple-system, sans-serif; } \
      .badge-pill { \
        display: inline-flex; \
        align-items: center; \
        gap: 6px; \
        padding: 8px 14px; \
        border-radius: 999px; \
        font-size: 13px; \
        font-weight: 700; \
        cursor: pointer; \
        box-shadow: 0 2px 8px rgba(0,0,0,0.15); \
        transition: all 0.2s ease; \
        user-select: none; \
        text-transform: uppercase; \
        letter-spacing: 0.5px; \
        line-height: 1; \
      } \
      .badge-pill:hover { \
        box-shadow: 0 4px 12px rgba(0,0,0,0.25); \
        transform: translateY(-1px); \
      } \
      .badge-pill.loading { \
        background: #f3f4f6; color: #6b7280; \
        cursor: default; \
      } \
      .badge-pill.human { background: #dcfce7; color: #166534; } \
      .badge-pill.ai { background: #fee2e2; color: #991b1b; } \
      .badge-pill.error { background: #fef3c7; color: #92400e; } \
      .spinner { \
        width: 14px; height: 14px; \
        border: 2px solid #d1d5db; \
        border-top-color: #6b7280; \
        border-radius: 50%; \
        animation: spin 0.8s linear infinite; \
      } \
      @keyframes spin { to { transform: rotate(360deg); } } \
      .panel { \
        position: absolute; \
        bottom: calc(100% + 8px); \
        right: 0; \
        background: #fff; \
        border-radius: 12px; \
        box-shadow: 0 4px 20px rgba(0,0,0,0.15); \
        padding: 16px; \
        min-width: 280px; \
        font-size: 13px; \
        color: #333; \
        display: none; \
        line-height: 1.5; \
      } \
      .panel.show { display: block; } \
      .panel-title { \
        font-size: 14px; font-weight: 700; \
        margin-bottom: 10px; \
        display: flex; align-items: center; gap: 8px; \
      } \
      .panel-label { \
        display: inline-block; \
        padding: 2px 8px; \
        border-radius: 999px; \
        font-size: 12px; \
        font-weight: 700; \
        text-transform: uppercase; \
      } \
      .panel-label.human { background: #dcfce7; color: #166534; } \
      .panel-label.ai { background: #fee2e2; color: #991b1b; } \
      .panel-row { \
        display: flex; \
        justify-content: space-between; \
        padding: 4px 0; \
        border-bottom: 1px solid #f3f4f6; \
      } \
      .panel-row:last-child { border-bottom: none; } \
      .panel-key { color: #666; } \
      .panel-val { font-weight: 600; color: #333; } \
      .close-btn { \
        position: absolute; top: 8px; right: 10px; \
        background: none; border: none; \
        font-size: 18px; color: #999; cursor: pointer; \
        line-height: 1; padding: 2px 4px; \
      } \
      .close-btn:hover { color: #333; } \
      .tooltip { \
        display: none; \
        position: absolute; \
        bottom: calc(100% + 4px); \
        right: 0; \
        background: #1f2937; \
        color: #fff; \
        padding: 6px 10px; \
        border-radius: 6px; \
        font-size: 12px; \
        white-space: nowrap; \
        pointer-events: none; \
      } \
      .badge-pill.error:hover ~ .tooltip { display: block; } \
    ';
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
    wrapper.style.position = "relative";
    wrapper.style.display = "inline-flex";
    wrapper.style.flexDirection = "column";
    wrapper.style.alignItems = "flex-end";
    shadow.appendChild(wrapper);

    document.body.appendChild(host);
  }

  function getWrapper() {
    return shadow.querySelector("div");
  }

  function showLoading() {
    create();
    expanded = false;
    currentResult = null;
    var wrapper = getWrapper();
    wrapper.innerHTML =
      '<div class="badge-pill loading">' +
        '<div class="spinner"></div>' +
        '<span>Detecting\u2026</span>' +
      '</div>';
  }

  var CONTENT_LABELS = {
    original: "\u539f\u521b",
    repost: "\u642c\u8fd0",
    ad: "\u5e7f\u544a"
  };

  function contentRow(data) {
    if (!data.content || !data.content.label) return "";
    var name = CONTENT_LABELS[data.content.label] || data.content.label;
    var confidence = (data.content.confidence * 100).toFixed(1);
    return '<div class="panel-row"><span class="panel-key">\u5185\u5bb9</span><span class="panel-val">' +
      esc(name) + " " + confidence + "%</span></div>";
  }

  function showResult(data) {
    create();
    currentResult = data;
    var label = data.label;
    var score = (data.score * 100).toFixed(1);
    var cls = label === "human" ? "human" : "ai";

    var wrapper = getWrapper();
    wrapper.innerHTML =
      '<div class="panel" id="panel">' +
        '<button class="close-btn" id="close-panel">\u00d7</button>' +
        '<div class="panel-title">' +
          '<span class="panel-label ' + cls + '">' + esc(label) + '</span>' +
          '<span>Detection Result</span>' +
        '</div>' +
        '<div class="panel-row"><span class="panel-key">Confidence</span><span class="panel-val">' + score + '%</span></div>' +
        contentRow(data) +
        '<div class="panel-row"><span class="panel-key">Language</span><span class="panel-val">' + esc(data.detected_lang) + '</span></div>' +
        '<div class="panel-row"><span class="panel-key">Model</span><span class="panel-val">' + esc(data.model_id) + '</span></div>' +
        '<div class="panel-row"><span class="panel-key">Chunks</span><span class="panel-val">' + esc(String(data.num_chunks)) + '</span></div>' +
      '</div>' +
      '<div class="badge-pill ' + cls + '" id="pill">' +
        '<span>' + label.toUpperCase() + ' ' + score + '%</span>' +
      '</div>';

    var pill = shadow.getElementById("pill");
    var panel = shadow.getElementById("panel");
    var closeBtn = shadow.getElementById("close-panel");

    pill.addEventListener("click", function () {
      expanded = !expanded;
      panel.classList.toggle("show", expanded);
    });

    closeBtn.addEventListener("click", function (e) {
      e.stopPropagation();
      expanded = false;
      panel.classList.remove("show");
    });
  }

  function showError(msg) {
    create();
    currentResult = null;
    var wrapper = getWrapper();
    wrapper.innerHTML =
      '<div class="badge-pill error">' +
        '<span>Detection failed</span>' +
      '</div>' +
      '<div class="tooltip">' + esc(msg || "Detection failed") + '</div>';
  }

  function remove() {
    if (host && host.parentNode) {
      host.parentNode.removeChild(host);
    }
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
