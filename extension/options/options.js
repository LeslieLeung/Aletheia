(function () {
  ALETHEIA.applyI18n();

  var testBtn = document.getElementById("testBtn");
  var testLabel = document.getElementById("testLabel");
  var testStatus = document.getElementById("testStatus");
  var connectionBadge = document.getElementById("connectionBadge");
  var jevBaseUrlEl = document.getElementById("jevBaseUrl");
  var jevApiKeyEl = document.getElementById("jevApiKey");
  var toggleKeyBtn = document.getElementById("toggleKeyBtn");
  var localContentEl = document.getElementById("localContent");
  var classifyConfig = document.getElementById("classifyConfig");
  var categoryList = document.getElementById("categoryList");
  var categoryCount = document.getElementById("categoryCount");
  var addCategoryBtn = document.getElementById("addCategoryBtn");
  var promptText = document.getElementById("promptText");
  var showBadgePercentEl = document.getElementById("showBadgePercent");
  var minTextLengthEl = document.getElementById("minTextLength");
  var domainInputEl = document.getElementById("domainInput");
  var domainTargetEl = document.getElementById("domainTarget");
  var domainAddBtn = document.getElementById("domainAddBtn");
  var domainSearchEl = document.getElementById("domainSearch");
  var domainFilterEl = document.getElementById("domainFilter");
  var domainItemsEl = document.getElementById("domainItems");
  var domainEmptyEl = document.getElementById("domainEmpty");
  var domainCountEl = document.getElementById("domainCount");
  var saveBar = document.getElementById("saveBar");
  var saveHint = document.getElementById("saveHint");
  var saveBtn = document.getElementById("saveBtn");
  var resetBtn = document.getElementById("resetBtn");
  var saveStatus = document.getElementById("saveStatus");

  var categories = ALETHEIA.questions.defaultContentCategories();
  var savedCategories = categories;
  var domains = { whitelist: [], blacklist: [] };
  var domainFilter = "all";
  var flashDomains = [];
  var savedSnapshot = null;

  var isMac = /Mac|iPhone|iPad/.test(navigator.platform || "");
  saveBtn.title = isMac ? "\u2318S" : "Ctrl+S";
  domainTargetEl.setAttribute("aria-label", ALETHEIA.t("domainListLabel"));
  setDomainFilter("all");

  ALETHEIA.storage.get().then(function (s) {
    jevBaseUrlEl.value = s.jevBaseUrl || ALETHEIA.DEFAULTS.jevBaseUrl;
    jevApiKeyEl.value = s.jevApiKey || "";
    localContentEl.checked = !!s.localContent;
    showBadgePercentEl.checked = !!s.showBadgePercent;
    minTextLengthEl.value = s.minTextLength;
    domains = normalizeDomains(s);
    categories = ALETHEIA.questions.sanitizeCategories(s.contentCategories);
    savedCategories = categories;
    renderCategories();
    renderDomains();
    syncClassifyVisibility();
    markSaved();
  });

  // Unsaved-change tracking

  function snapshot() {
    var rows = categoryList.querySelectorAll(".category-row");
    var cats = [];
    for (var i = 0; i < rows.length; i++) {
      cats.push([
        rows[i].querySelector(".category-label").value,
        rows[i].querySelector(".category-desc").value
      ]);
    }
    return JSON.stringify([
      jevBaseUrlEl.value.trim(),
      jevApiKeyEl.value.trim(),
      localContentEl.checked,
      showBadgePercentEl.checked,
      minTextLengthEl.value,
      cats
    ]);
  }

  function isDirty() {
    return savedSnapshot !== null && snapshot() !== savedSnapshot;
  }

  function updateDirty() {
    var dirty = isDirty();
    saveBar.classList.toggle("dirty", dirty);
    saveBtn.disabled = !dirty;
    saveHint.textContent = ALETHEIA.t(dirty ? "unsavedChanges" : "allSaved");
  }

  function markSaved() {
    savedSnapshot = snapshot();
    updateDirty();
  }

  document.addEventListener("input", function (e) {
    if (e.target === jevBaseUrlEl) jevBaseUrlEl.classList.remove("invalid");
    if (e.target === jevBaseUrlEl || e.target === jevApiKeyEl) {
      connectionBadge.hidden = true;
    }
    updateDirty();
  });
  document.addEventListener("change", updateDirty);

  document.addEventListener("keydown", function (e) {
    if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "s") {
      e.preventDefault();
      if (isDirty()) save();
    }
  });

  window.addEventListener("beforeunload", function (e) {
    if (!isDirty()) return;
    e.preventDefault();
    e.returnValue = "";
  });

  // API key visibility

  toggleKeyBtn.addEventListener("click", function () {
    var show = jevApiKeyEl.type === "password";
    jevApiKeyEl.type = show ? "text" : "password";
    toggleKeyBtn.setAttribute("aria-pressed", show ? "true" : "false");
    var title = ALETHEIA.t(show ? "hideKey" : "showKey");
    toggleKeyBtn.title = title;
    toggleKeyBtn.setAttribute("aria-label", title);
  });

  // Content categories

  localContentEl.addEventListener("change", syncClassifyVisibility);

  function syncClassifyVisibility() {
    classifyConfig.hidden = !localContentEl.checked;
  }

  function renderCategories() {
    categoryList.innerHTML = "";
    categories.forEach(function (category, index) {
      categoryList.appendChild(buildCategoryRow(category, index));
    });
    updateCategoryControls();
    updatePrompt();
    updateDirty();
  }

  function buildCategoryRow(category, index) {
    var row = document.createElement("div");
    row.className = "category-row";
    row.dataset.id = category.id;

    var head = document.createElement("div");
    head.className = "category-head";

    var indexEl = document.createElement("span");
    indexEl.className = "category-index";
    indexEl.textContent = String(index + 1);

    var labelEl = document.createElement("input");
    labelEl.type = "text";
    labelEl.className = "category-label";
    labelEl.maxLength = 40;
    labelEl.value = category.label;
    labelEl.placeholder = ALETHEIA.t("categoryNamePlaceholder");
    labelEl.setAttribute("aria-label", ALETHEIA.t("categoryName"));
    labelEl.addEventListener("input", function () {
      categories[index].label = labelEl.value;
      updatePrompt();
    });

    var removeEl = document.createElement("button");
    removeEl.type = "button";
    removeEl.className = "category-remove";
    removeEl.textContent = "\u00d7";
    removeEl.title = ALETHEIA.t("removeCategory");
    removeEl.setAttribute("aria-label", ALETHEIA.t("removeCategory"));
    removeEl.addEventListener("click", function () {
      if (categories.length <= 1) return;
      categories.splice(index, 1);
      renderCategories();
    });

    var descEl = document.createElement("textarea");
    descEl.className = "category-desc";
    descEl.rows = 2;
    descEl.value = category.description;
    descEl.placeholder = ALETHEIA.t("categoryDescriptionPlaceholder");
    descEl.setAttribute("aria-label", ALETHEIA.t("categoryDescription"));
    descEl.addEventListener("input", function () {
      categories[index].description = descEl.value;
    });

    head.appendChild(indexEl);
    head.appendChild(labelEl);
    head.appendChild(removeEl);
    row.appendChild(head);
    row.appendChild(descEl);
    return row;
  }

  function updateCategoryControls() {
    var onlyOne = categories.length <= 1;
    var removeButtons = categoryList.querySelectorAll(".category-remove");
    for (var i = 0; i < removeButtons.length; i++) {
      removeButtons[i].disabled = onlyOne;
    }
    addCategoryBtn.disabled = categories.length >= ALETHEIA.questions.MAX_CATEGORIES;
    categoryCount.textContent = categories.length + " / " + ALETHEIA.questions.MAX_CATEGORIES;
  }

  function updatePrompt() {
    var named = categories.filter(function (category) {
      return category.label.trim().length > 0;
    });
    promptText.textContent = named.length
      ? ALETHEIA.questions.contentTypeFor(named).instructions
      : ALETHEIA.t("categoryRequired");
  }

  addCategoryBtn.addEventListener("click", function () {
    if (categories.length >= ALETHEIA.questions.MAX_CATEGORIES) return;
    categories.push({
      id: ALETHEIA.questions.nextCategoryId(categories),
      label: "",
      description: ""
    });
    renderCategories();
    var rows = categoryList.querySelectorAll(".category-row");
    var last = rows[rows.length - 1];
    if (last) last.querySelector(".category-label").focus();
  });

  function collectCategories() {
    var rows = categoryList.querySelectorAll(".category-row");
    var result = [];
    for (var i = 0; i < rows.length; i++) {
      var label = rows[i].querySelector(".category-label").value.trim();
      var description = rows[i].querySelector(".category-desc").value.trim();
      if (!label) {
        if (description) return null;
        continue;
      }
      result.push({
        id: rows[i].dataset.id,
        label: label,
        description: description
      });
    }
    return result.length ? result : null;
  }

  // Connection test

  testBtn.addEventListener("click", function () {
    var baseUrl = jevBaseUrlEl.value.trim() || ALETHEIA.DEFAULTS.jevBaseUrl;
    var urlError = validateUrl(baseUrl);
    if (urlError) {
      jevBaseUrlEl.classList.add("invalid");
      showTestStatus(urlError, false);
      return;
    }

    testBtn.disabled = true;
    testBtn.classList.add("loading");
    testLabel.textContent = ALETHEIA.t("testing");
    testStatus.className = "test-status";
    connectionBadge.hidden = true;

    ALETHEIA.jev.test(baseUrl, jevApiKeyEl.value.trim()).then(function () {
      showTestStatus(ALETHEIA.t("connectedOk"), true);
    }).catch(function (err) {
      showTestStatus(ALETHEIA.t("connectionFailed") + err.message, false);
    }).finally(function () {
      testBtn.disabled = false;
      testBtn.classList.remove("loading");
      testLabel.textContent = ALETHEIA.t("testConnection");
    });
  });

  function validateUrl(value) {
    if (!value) return ALETHEIA.t("invalidUrl");
    try {
      var parsed = new URL(value);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        return ALETHEIA.t("urlMustHttp");
      }
    } catch (e) {
      return ALETHEIA.t("invalidUrl");
    }
    return "";
  }

  function showTestStatus(msg, ok) {
    testStatus.textContent = msg;
    testStatus.className = "test-status show " + (ok ? "ok" : "fail");
    connectionBadge.textContent = ALETHEIA.t(ok ? "connected" : "notConnected");
    connectionBadge.className = "pill " + (ok ? "ok" : "fail");
    connectionBadge.hidden = false;
  }

  // Domains

  function normalizeDomains(source) {
    var whitelist = (source.whitelist || [])
      .map(ALETHEIA.domains.normalize)
      .filter(uniqueDomain);
    var blacklist = (source.blacklist || [])
      .map(ALETHEIA.domains.normalize)
      .filter(function (domain) {
        return whitelist.indexOf(domain) === -1;
      })
      .filter(uniqueDomain);
    return { whitelist: whitelist.sort(), blacklist: blacklist.sort() };
  }

  function uniqueDomain(domain, index, list) {
    return !!domain && list.indexOf(domain) === index;
  }

  function allDomains() {
    var items = [];
    ["whitelist", "blacklist"].forEach(function (list) {
      domains[list].forEach(function (domain) {
        items.push({ domain: domain, list: list });
      });
    });
    return items.sort(function (a, b) {
      return a.domain.localeCompare(b.domain);
    });
  }

  function renderDomains() {
    var items = allDomains();
    var query = domainSearchEl.value.trim().toLowerCase();
    var visible = items.filter(function (item) {
      if (domainFilter !== "all" && item.list !== domainFilter) return false;
      return !query || item.domain.indexOf(query) !== -1;
    });

    domainItemsEl.innerHTML = "";
    var firstFlash = null;
    visible.forEach(function (item) {
      var row = buildDomainRow(item);
      if (flashDomains.indexOf(item.domain) !== -1) {
        row.classList.add("flash");
        if (!firstFlash) firstFlash = row;
      }
      domainItemsEl.appendChild(row);
    });
    flashDomains = [];
    if (firstFlash) firstFlash.scrollIntoView({ block: "nearest" });

    domainEmptyEl.hidden = visible.length > 0;
    domainEmptyEl.textContent = ALETHEIA.t(items.length ? "noDomainMatches" : "noDomains");
    domainCountEl.textContent = ALETHEIA.t("domainCount", [
      String(domains.whitelist.length),
      String(domains.blacklist.length)
    ]);
  }

  function buildDomainRow(item) {
    var row = document.createElement("li");
    row.className = "domain-item";

    var dot = document.createElement("span");
    dot.className = "domain-dot " + item.list;

    var name = document.createElement("span");
    name.className = "domain-name";
    name.textContent = item.domain;
    name.title = item.domain;

    var select = document.createElement("select");
    select.className = "domain-list-select " + item.list;
    select.setAttribute("aria-label", ALETHEIA.t("domainListLabel"));
    [["whitelist", "whitelistOption"], ["blacklist", "blacklistOption"]].forEach(function (pair) {
      var option = document.createElement("option");
      option.value = pair[0];
      option.textContent = ALETHEIA.t(pair[1]);
      select.appendChild(option);
    });
    select.value = item.list;
    select.addEventListener("change", function (e) {
      e.stopPropagation();
      flashDomains = [item.domain];
      moveDomain(item.domain, select.value);
    });

    var remove = document.createElement("button");
    remove.type = "button";
    remove.className = "domain-remove";
    remove.textContent = "\u00d7";
    remove.title = ALETHEIA.t("removeDomain");
    remove.setAttribute("aria-label", ALETHEIA.t("removeDomain"));
    remove.addEventListener("click", function () {
      moveDomain(item.domain, "");
    });

    row.appendChild(dot);
    row.appendChild(name);
    row.appendChild(select);
    row.appendChild(remove);
    return row;
  }

  function moveDomain(domain, list) {
    var next = ALETHEIA.domains.apply(domains, domain, list);
    domains.whitelist = next.whitelist;
    domains.blacklist = next.blacklist;
    saveDomains();
  }

  function saveDomains() {
    domains.whitelist.sort();
    domains.blacklist.sort();
    renderDomains();
    ALETHEIA.storage.set({
      whitelist: domains.whitelist.slice(),
      blacklist: domains.blacklist.slice()
    }).then(function () {
      toast(ALETHEIA.t("domainSaved"), false);
    }).catch(function (err) {
      toast(err.message, true);
    });
  }

  function addDomain() {
    var list = domainTargetEl.value === "whitelist" ? "whitelist" : "blacklist";
    var candidates = domainInputEl.value
      .split(/[\s,]+/)
      .map(ALETHEIA.domains.normalize)
      .filter(uniqueDomain);
    if (!candidates.length) {
      domainInputEl.classList.add("invalid");
      toast(ALETHEIA.t("invalidDomain"), true);
      domainInputEl.focus();
      return;
    }

    var added = [];
    candidates.forEach(function (domain) {
      if (domains[list].indexOf(domain) !== -1) return;
      var next = ALETHEIA.domains.apply(domains, domain, list);
      domains.whitelist = next.whitelist;
      domains.blacklist = next.blacklist;
      added.push(domain);
    });

    domainInputEl.value = "";
    domainSearchEl.value = "";
    if (domainFilter !== "all" && domainFilter !== list) setDomainFilter("all");
    flashDomains = added.length ? added : candidates;
    if (!added.length) {
      renderDomains();
      toast(ALETHEIA.t("domainAlreadyListed"), false);
      return;
    }
    saveDomains();
  }

  function setDomainFilter(filter) {
    domainFilter = filter;
    var tabs = domainFilterEl.querySelectorAll(".filter-tab");
    for (var i = 0; i < tabs.length; i++) {
      var active = tabs[i].dataset.filter === filter;
      tabs[i].classList.toggle("active", active);
      tabs[i].setAttribute("aria-pressed", active ? "true" : "false");
    }
  }

  domainFilterEl.addEventListener("click", function (e) {
    var tab = e.target.closest(".filter-tab");
    if (!tab) return;
    setDomainFilter(tab.dataset.filter);
    renderDomains();
  });

  domainAddBtn.addEventListener("click", addDomain);
  domainInputEl.addEventListener("input", function () {
    domainInputEl.classList.remove("invalid");
  });
  domainInputEl.addEventListener("keydown", function (e) {
    if (e.key === "Enter") {
      e.preventDefault();
      addDomain();
    }
  });
  domainSearchEl.addEventListener("input", renderDomains);

  // Save / reset

  var toastTimer;
  function toast(message, failed) {
    saveStatus.textContent = message;
    saveStatus.className = "toast show" + (failed ? " fail" : "");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      saveStatus.className = "toast" + (failed ? " fail" : "");
    }, failed ? 3500 : 2000);
  }

  function save() {
    var baseUrl = jevBaseUrlEl.value.trim() || ALETHEIA.DEFAULTS.jevBaseUrl;
    var urlError = validateUrl(baseUrl);
    if (urlError) {
      jevBaseUrlEl.classList.add("invalid");
      jevBaseUrlEl.focus();
      toast(urlError, true);
      return;
    }

    var collected = collectCategories();
    if (!collected && localContentEl.checked) {
      toast(ALETHEIA.t("categoryRequired"), true);
      return;
    }

    var minLength = parseInt(minTextLengthEl.value, 10) || ALETHEIA.DEFAULTS.minTextLength;
    minLength = Math.min(5000, Math.max(50, minLength));

    saveBtn.disabled = true;
    ALETHEIA.storage.set({
      jevBaseUrl: baseUrl,
      jevApiKey: jevApiKeyEl.value.trim(),
      localContent: localContentEl.checked,
      contentCategories: collected || savedCategories,
      showBadgePercent: showBadgePercentEl.checked,
      minTextLength: minLength,
      blacklist: domains.blacklist.slice(),
      whitelist: domains.whitelist.slice()
    }).then(function () {
      jevBaseUrlEl.value = baseUrl;
      minTextLengthEl.value = minLength;
      if (collected) {
        categories = collected;
        savedCategories = collected;
        renderCategories();
      }
      markSaved();
      toast(ALETHEIA.t("settingsSaved"), false);
    }).catch(function (err) {
      updateDirty();
      toast(err.message, true);
    });
  }

  saveBtn.addEventListener("click", save);

  resetBtn.addEventListener("click", function () {
    if (!confirm(ALETHEIA.t("confirmReset"))) return;

    var d = ALETHEIA.DEFAULTS;
    jevBaseUrlEl.value = d.jevBaseUrl;
    jevApiKeyEl.value = "";
    localContentEl.checked = d.localContent;
    showBadgePercentEl.checked = d.showBadgePercent;
    minTextLengthEl.value = d.minTextLength;
    testStatus.className = "test-status";
    connectionBadge.hidden = true;
    jevBaseUrlEl.classList.remove("invalid");

    domains = normalizeDomains(d);
    setDomainFilter("all");
    renderDomains();
    categories = ALETHEIA.questions.defaultContentCategories();
    savedCategories = categories;
    renderCategories();
    syncClassifyVisibility();

    ALETHEIA.storage.set({
      jevBaseUrl: d.jevBaseUrl,
      jevApiKey: "",
      localContent: d.localContent,
      contentCategories: categories,
      showBadgePercent: d.showBadgePercent,
      minTextLength: d.minTextLength,
      blacklist: domains.blacklist.slice(),
      whitelist: domains.whitelist.slice(),
      enabled: true
    }).then(function () {
      markSaved();
      toast(ALETHEIA.t("settingsReset"), false);
    });
  });
})();
