/* Namerl - Main application logic */
"use strict";

const App = (() => {
  // Column indices in the JSON data array
  const COL = { NAME: 0, PCT_TOTAL: 1, ABS_TOTAL: 2, ABS_RECENT: 3, PCT_RECENT: 4, YEARLY: 5 };
  const DATA_START_YEAR = 1984;
  const RECENT_YEARS = 5;
  const LOCALE = "de-AT";

  function fmtInt(n) { return n.toLocaleString(LOCALE); }
  function fmtPct(n) { return n.toLocaleString(LOCALE, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + "%"; }

  // State
  let allNames = [];       // Full dataset for current gender [{name, pctTotal, absTotal, absRecent, pctRecent, yearly}]
  let filteredNames = [];   // After filters applied
  let currentIndex = 0;
  let liked = new Set();
  let disliked = new Set();
  let history = [];         // Undo stack: [{name, action}]
  let gender = "boys";
  let randomSeed = Math.random();
  let dataMaxYear = 0;            // Actual last year in the dataset

  // DOM references
  const els = {};

  function init() {
    cacheDom();
    bindEvents();
    loadState();

    Swipe.init(els.card, (direction) => act(direction));

    // Auto-open filter sidebar on wide screens
    if (isDesktop()) toggleDrawer(true);

    loadData(gender);
  }

  function cacheDom() {
    els.nameDisplay = document.getElementById("name-display");
    els.nameStats = document.getElementById("name-stats");
    els.nameChart = document.getElementById("name-chart");
    els.card = document.getElementById("name-card");
    els.btnLike = document.getElementById("btn-like");
    els.btnDislike = document.getElementById("btn-dislike");
    els.btnUndo = document.getElementById("btn-undo");
    els.progressFill = document.getElementById("progress-fill");
    els.progressText = document.getElementById("progress-text");
    els.likedSection = document.getElementById("liked-section");
    els.likedHeading = document.getElementById("liked-heading");
    els.likedList = document.getElementById("liked-list");
    els.btnApply = document.getElementById("btn-apply");
    els.btnShuffle = document.getElementById("btn-shuffle");
    els.btnReset = document.getElementById("btn-reset");
    els.btnExport = document.getElementById("btn-export");
    els.btnImport = document.getElementById("btn-import");
    els.filterFab = document.getElementById("filter-fab");
    els.filterDrawer = document.getElementById("filter-drawer");
    els.drawerBackdrop = document.getElementById("drawer-backdrop");
    els.drawerClose = document.getElementById("drawer-close");
    els.randomnessSlider = document.getElementById("f-randomness");
    els.randomnessValue = document.getElementById("f-randomness-value");
    els.themeToggle = document.getElementById("theme-toggle");
  }

  function bindEvents() {
    // Like / dislike / undo
    els.btnLike.addEventListener("click", () => act("like"));
    els.btnDislike.addEventListener("click", () => act("dislike"));
    els.btnUndo.addEventListener("click", undo);

    // Keyboard shortcuts
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        toggleDrawer(false);
        document.querySelectorAll(".stat__tooltip--visible").forEach((t) => t.classList.remove("stat__tooltip--visible"));
        return;
      }
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
      if (e.key === "?") toggleShortcuts();
      else if (e.key === "d") toggleTheme();
      else if (e.key === "f") { const open = els.filterDrawer.getAttribute("aria-hidden") !== "false"; toggleDrawer(open); }
      else if (e.key === "g") switchGender(gender === "boys" ? "girls" : "boys");
      else if (e.key === "ArrowRight") act("like");
      else if (e.key === "ArrowLeft") act("dislike");
      else if ((e.key === "z" || e.key === "Z") && (e.ctrlKey || e.metaKey)) undo();
    });

    // Shortcuts dialog
    const shortcutsDialog = document.getElementById("shortcuts-dialog");
    document.getElementById("shortcuts-close").addEventListener("click", () => shortcutsDialog.close());

    // Gender toggle
    document.querySelectorAll(".gender-toggle__btn").forEach((btn) => {
      btn.addEventListener("click", () => switchGender(btn.dataset.gender));
    });

    // Filter drawer
    els.filterFab.addEventListener("click", () => toggleDrawer(true));
    els.drawerBackdrop.addEventListener("click", () => toggleDrawer(false));
    els.drawerClose.addEventListener("click", () => toggleDrawer(false));

    // Filter actions
    els.btnApply.addEventListener("click", () => { applyFilters(); if (!isDesktop()) toggleDrawer(false); });
    els.btnShuffle.addEventListener("click", () => { randomSeed = Math.random(); applyFilters(); });
    els.btnReset.addEventListener("click", resetProgress);

    // Randomness slider label
    els.randomnessSlider.addEventListener("input", (e) => {
      els.randomnessValue.textContent = e.target.value;
    });

    // Theme toggle
    els.themeToggle.addEventListener("click", toggleTheme);

    // Export / import
    els.btnExport.addEventListener("click", exportLiked);
    els.btnImport.addEventListener("change", importData);

    // Touch support for stat tooltips (tap to toggle)
    document.addEventListener("click", (e) => {
      const info = e.target.closest(".stat__info");
      if (info) {
        const tooltip = info.nextElementSibling;
        if (tooltip) tooltip.classList.toggle("stat__tooltip--visible");
        e.stopPropagation();
        return;
      }
      // Dismiss all open tooltips on outside tap
      document.querySelectorAll(".stat__tooltip--visible").forEach((t) => {
        t.classList.remove("stat__tooltip--visible");
      });
    });
  }

  function isDesktop() {
    return window.matchMedia("(min-width: 768px)").matches;
  }

  function toggleDrawer(open) {
    const wasOpen = els.filterDrawer.getAttribute("aria-hidden") === "false";
    els.filterDrawer.setAttribute("aria-hidden", !open);
    document.body.classList.toggle("drawer-open", open);

    if (open && !wasOpen) {
      // On mobile overlay: trap focus. On desktop sidebar: leave focus alone.
      if (!isDesktop()) {
        const first = els.filterDrawer.querySelector("input, button");
        if (first) first.focus();

        els.filterDrawer._trapFocus = (e) => {
          if (e.key !== "Tab") return;
          const focusable = els.filterDrawer.querySelectorAll('input, button, [tabindex]:not([tabindex="-1"])');
          const firstEl = focusable[0];
          const lastEl = focusable[focusable.length - 1];
          if (e.shiftKey && document.activeElement === firstEl) {
            e.preventDefault();
            lastEl.focus();
          } else if (!e.shiftKey && document.activeElement === lastEl) {
            e.preventDefault();
            firstEl.focus();
          }
        };
        els.filterDrawer.addEventListener("keydown", els.filterDrawer._trapFocus);
      }
    } else if (!open && wasOpen) {
      if (els.filterDrawer._trapFocus) {
        els.filterDrawer.removeEventListener("keydown", els.filterDrawer._trapFocus);
      }
      els.filterFab.focus();
    }
  }

  function toggleTheme() {
    const next = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("bns_theme", next);
    renderCard();
  }

  function toggleShortcuts() {
    const dialog = document.getElementById("shortcuts-dialog");
    if (dialog.open) dialog.close();
    else dialog.showModal();
  }

  // --- Data Loading ---

  async function loadData(g) {
    els.nameDisplay.textContent = "Loading...";
    els.nameStats.innerHTML = "";

    try {
      const res = await fetch(`data/${g}.json`);
      const json = await res.json();
      allNames = json.data.map((row) => ({
        name: row[COL.NAME],
        pctTotal: row[COL.PCT_TOTAL],
        absTotal: row[COL.ABS_TOTAL],
        absRecent: row[COL.ABS_RECENT],
        pctRecent: row[COL.PCT_RECENT],
        yearly: row[COL.YEARLY],
      }));
      if (allNames.length > 0 && allNames[0].yearly) {
        dataMaxYear = Math.max(...Object.keys(allNames[0].yearly).map(Number));
        Chart.setMaxYear(dataMaxYear);
      }
      applyFilters();
    } catch (err) {
      els.nameDisplay.textContent = "Failed to load data";
      console.error("Data load error:", err);
    }
  }

  // --- Actions ---

  function act(action) {
    if (currentIndex >= filteredNames.length) return;

    const entry = filteredNames[currentIndex];
    if (action === "like") {
      liked.add(entry.name);
    } else {
      disliked.add(entry.name);
    }

    history.push({ name: entry.name, action });
    currentIndex++;

    saveState();
    render();
  }

  function undo() {
    if (history.length === 0) return;

    const last = history.pop();
    if (last.action === "like") liked.delete(last.name);
    else disliked.delete(last.name);

    currentIndex = Math.max(0, currentIndex - 1);
    saveState();
    render();
  }

  // --- Filters ---

  function getFilterValues() {
    return {
      startsWith: document.getElementById("f-starts").value,
      notStartsWith: document.getElementById("f-not-starts").value,
      endsWith: document.getElementById("f-ends").value,
      notEndsWith: document.getElementById("f-not-ends").value,
      contains: document.getElementById("f-contains").value,
      notContains: document.getElementById("f-not-contains").value,
      minLength: parseInt(document.getElementById("f-min-len").value) || 1,
      maxLength: parseInt(document.getElementById("f-max-len").value) || 0,
      minOccurrences: parseInt(document.getElementById("f-min-occ").value) || 0,
      skipTopN: parseInt(document.getElementById("f-skip-top").value) || 0,
      noHyphens: document.getElementById("f-no-hyphens").checked,
      noSpecialChars: document.getElementById("f-no-special").checked,
      randomness: parseFloat(document.getElementById("f-randomness").value),
    };
  }

  function applyFilters() {
    const f = getFilterValues();
    let names = allNames.slice();

    // Apply all filters (defined in filters.js)
    names = Filters.apply(names, f);

    // Smart ordering
    names = Filters.order(names, f.randomness, randomSeed);

    // Remove already reviewed names
    filteredNames = names.filter((n) => !liked.has(n.name) && !disliked.has(n.name));
    currentIndex = 0;
    history = [];

    saveState();
    render();
  }

  // --- Gender ---

  function switchGender(g) {
    if (g === gender) return;

    saveState();
    gender = g;

    // Update toggle UI — move sliding pill
    document.querySelector(".gender-toggle").dataset.active = g;
    document.querySelectorAll(".gender-toggle__btn").forEach((btn) => {
      const active = btn.dataset.gender === g;
      btn.classList.toggle("gender-toggle__btn--active", active);
      btn.setAttribute("aria-checked", active);
    });

    loadState();
    loadData(g);
  }

  // --- Persistence ---

  function storageKey(suffix) {
    return `bns_${gender}_${suffix}`;
  }

  function saveState() {
    localStorage.setItem(storageKey("liked"), JSON.stringify([...liked]));
    localStorage.setItem(storageKey("disliked"), JSON.stringify([...disliked]));
    localStorage.setItem(storageKey("seed"), String(randomSeed));
  }

  function loadState() {
    try {
      const l = localStorage.getItem(storageKey("liked"));
      const d = localStorage.getItem(storageKey("disliked"));
      const s = localStorage.getItem(storageKey("seed"));
      liked = l ? new Set(JSON.parse(l)) : new Set();
      disliked = d ? new Set(JSON.parse(d)) : new Set();
      if (s) randomSeed = parseFloat(s);
    } catch {
      liked = new Set();
      disliked = new Set();
    }
    history = [];
  }

  function resetProgress() {
    if (!confirm("Reset all progress for " + gender + "?")) return;
    liked = new Set();
    disliked = new Set();
    history = [];
    localStorage.removeItem(storageKey("liked"));
    localStorage.removeItem(storageKey("disliked"));
    applyFilters();
  }

  // --- Export / Import ---

  function exportLiked() {
    const data = {
      gender,
      liked: [...liked].sort(),
      exported: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `baby_names_${gender}_liked.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function importData(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target.result);
        if (data.liked && Array.isArray(data.liked)) {
          data.liked.forEach((name) => liked.add(name));
          saveState();
          render();
        }
      } catch (err) {
        console.error("Import error:", err);
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  // --- Name Sizing ---

  function fitName(el) {
    // Reset to CSS default size, then shrink if it overflows
    el.style.fontSize = "";
    if (el.scrollWidth > el.clientWidth) {
      const base = parseFloat(getComputedStyle(el).fontSize);
      el.style.fontSize = Math.floor(base * el.clientWidth / el.scrollWidth) + "px";
    }
  }

  // --- Rendering ---

  function render() {
    renderCard();
    renderProgress();
    renderLiked();
    els.btnUndo.disabled = history.length === 0;

    // Trigger card entrance animation
    els.card.classList.remove("card--entering");
    void els.card.offsetWidth; // force reflow to restart animation
    els.card.classList.add("card--entering");
  }

  function renderCard() {
    if (filteredNames.length === 0) {
      els.nameDisplay.textContent = "No names match filters";
      els.nameStats.innerHTML = "";
      Chart.clear(els.nameChart);
      return;
    }

    if (currentIndex >= filteredNames.length) {
      els.nameDisplay.textContent = "All done!";
      els.nameStats.innerHTML = '<div class="state-message"><div class="state-message__text">You reviewed all names matching your filters.</div></div>';
      Chart.clear(els.nameChart);
      return;
    }

    const entry = filteredNames[currentIndex];

    els.nameDisplay.textContent = entry.name;
    fitName(els.nameDisplay);

    const recentStart = dataMaxYear - RECENT_YEARS + 1;

    els.nameStats.innerHTML = `
      <div class="stat">
        <div class="stat__value">${fmtInt(entry.absTotal)}</div>
        <div class="stat__label">Total <span class="stat__info" tabindex="0" role="button" aria-label="Info">i</span>
          <div class="stat__tooltip">Babies given this name in Austria from ${DATA_START_YEAR} to ${dataMaxYear}</div>
        </div>
      </div>
      <div class="stat">
        <div class="stat__value">${fmtPct(entry.pctTotal)}</div>
        <div class="stat__label">Total % <span class="stat__info" tabindex="0" role="button" aria-label="Info">i</span>
          <div class="stat__tooltip">Share of all babies of this gender since ${DATA_START_YEAR}</div>
        </div>
      </div>
      <div class="stat">
        <div class="stat__value">${fmtInt(entry.absRecent)}</div>
        <div class="stat__label">Recent <span class="stat__info" tabindex="0" role="button" aria-label="Info">i</span>
          <div class="stat__tooltip">Babies given this name in the last ${RECENT_YEARS} years (${recentStart}\u2013${dataMaxYear})</div>
        </div>
      </div>
      <div class="stat">
        <div class="stat__value">${fmtPct(entry.pctRecent)}</div>
        <div class="stat__label">Recent % <span class="stat__info" tabindex="0" role="button" aria-label="Info">i</span>
          <div class="stat__tooltip">Share of all babies of this gender in the last ${RECENT_YEARS} years</div>
        </div>
      </div>
    `;

    Chart.draw(els.nameChart, entry.yearly);

    const trend = entry.absRecent > 0
      ? `${fmtInt(entry.absRecent)} births in the last ${RECENT_YEARS} years`
      : "No recent births";
    els.nameChart.setAttribute("aria-label", `Yearly frequency chart for ${entry.name}. ${trend}`);
  }

  function renderProgress() {
    const total = filteredNames.length;

    if (total === 0) {
      els.progressFill.style.width = "0%";
      els.progressText.textContent = "";
      return;
    }

    const pct = Math.round((currentIndex / total) * 100);
    els.progressFill.style.width = pct + "%";
    els.progressText.textContent = `${fmtInt(currentIndex)}/${fmtInt(total)} (${pct}%)`;
  }

  function renderLiked() {
    const hasLiked = liked.size > 0;
    els.likedSection.hidden = !hasLiked;
    els.btnExport.hidden = !hasLiked;

    if (hasLiked) {
      els.likedHeading.textContent = `Liked (${liked.size})`;
      els.likedList.innerHTML = "";
      for (const n of [...liked].sort()) {
        const li = document.createElement("li");
        li.textContent = n;
        els.likedList.appendChild(li);
      }
    }
  }

  // Public API
  return { init };
})();

document.addEventListener("DOMContentLoaded", App.init);
