/* Baby Name Swiper - Canvas frequency chart */
"use strict";

const Chart = (() => {
  const PADDING = { top: 10, right: 10, bottom: 24, left: 36 };
  // Read colors from CSS custom properties so they stay in sync with tokens
  function getColors() {
    const s = getComputedStyle(document.documentElement);
    const accent = s.getPropertyValue("--color-accent").trim();
    return {
      line: accent,
      fill: accent.startsWith("#") ? accent + "26" : "rgba(99, 102, 241, 0.15)",
      text: s.getPropertyValue("--color-text-muted").trim(),
      grid: s.getPropertyValue("--color-border").trim(),
      hoverLine: accent.startsWith("#") ? accent + "66" : "rgba(99, 102, 241, 0.4)",
      recentBg: s.getPropertyValue("--color-accent-bg").trim(),
    };
  }
  const FIXED_MIN_YEAR = 1984;
  let maxYear = new Date().getFullYear(); // overridden by setMaxYear()

  // State for hover interaction
  let hoverEntries = null;
  let hoverMaxCount = 0;
  let hoverYearlyData = null;

  function fmtNum(n) {
    return n.toLocaleString("de-AT");
  }

  function clear(canvas) {
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    removeListeners(canvas);
    hideTooltip(canvas);
    hoverEntries = null;
  }

  function buildFullSeries(yearlyData) {
    const entries = [];
    for (let y = FIXED_MIN_YEAR; y <= maxYear; y++) {
      entries.push([y, yearlyData[String(y)] || 0]);
    }
    return entries;
  }

  function draw(canvas, yearlyData, hoveredYear) {
    if (!yearlyData || typeof yearlyData !== "object" || Object.keys(yearlyData).length === 0) {
      clear(canvas);
      return;
    }

    const COLORS = getColors();
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    const ctx = canvas.getContext("2d");
    ctx.scale(dpr, dpr);

    const w = rect.width;
    const h = rect.height;

    const entries = buildFullSeries(yearlyData);
    const counts = entries.map((e) => e[1]);
    const maxCount = Math.max(...counts);

    hoverEntries = entries;
    hoverMaxCount = maxCount;
    hoverYearlyData = yearlyData;

    const plotW = w - PADDING.left - PADDING.right;
    const plotH = h - PADDING.top - PADDING.bottom;
    // X-axis scale goes to maxYear (even if data ends earlier)
    const xScale = (year) => PADDING.left + ((year - FIXED_MIN_YEAR) / (maxYear - FIXED_MIN_YEAR)) * plotW;
    const yScale = (count) => PADDING.top + plotH - (count / (maxCount || 1)) * plotH;

    ctx.clearRect(0, 0, w, h);

    // Recent-period background band
    const recentStart = maxYear - 5 + 1;
    const rx0 = xScale(recentStart);
    const rx1 = xScale(maxYear);
    ctx.fillStyle = COLORS.recentBg;
    ctx.fillRect(rx0, PADDING.top, rx1 - rx0, plotH);

    // Grid lines
    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1;
    for (let i = 1; i <= 3; i++) {
      const y = PADDING.top + (plotH / 4) * i;
      ctx.beginPath();
      ctx.moveTo(PADDING.left, y);
      ctx.lineTo(w - PADDING.right, y);
      ctx.stroke();
    }

    // Stepped area fill (only through data years)
    ctx.beginPath();
    ctx.moveTo(xScale(entries[0][0]), yScale(0));
    for (let i = 0; i < entries.length; i++) {
      const x = xScale(entries[i][0]);
      const y = yScale(entries[i][1]);
      if (i > 0) ctx.lineTo(x, yScale(entries[i - 1][1]));
      ctx.lineTo(x, y);
    }
    ctx.lineTo(xScale(entries[entries.length - 1][0]), yScale(0));
    ctx.closePath();
    ctx.fillStyle = COLORS.fill;
    ctx.fill();

    // Stepped line
    ctx.beginPath();
    ctx.strokeStyle = COLORS.line;
    ctx.lineWidth = 1.5;
    for (let i = 0; i < entries.length; i++) {
      const x = xScale(entries[i][0]);
      const y = yScale(entries[i][1]);
      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, yScale(entries[i - 1][1]));
        ctx.lineTo(x, y);
      }
    }
    ctx.stroke();

    // X-axis labels — avoid overlap near the end
    ctx.fillStyle = COLORS.text;
    ctx.font = "10px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    const labelY = h - PADDING.bottom + 6;

    const yearSpan = maxYear - FIXED_MIN_YEAR;
    const step = Math.max(1, Math.round(yearSpan / 5));
    const minLabelGap = 30;
    let lastLabelX = -Infinity;

    for (let y = FIXED_MIN_YEAR; y <= maxYear; y += step) {
      const lx = xScale(y);
      if (lx - lastLabelX >= minLabelGap) {
        ctx.fillText(y, lx, labelY);
        lastLabelX = lx;
      }
    }
    const endX = xScale(maxYear);
    if (endX - lastLabelX >= minLabelGap) {
      ctx.fillText(maxYear, endX, labelY);
    }

    // Y-axis labels
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    ctx.fillText(fmtNum(maxCount), PADDING.left - 4, PADDING.top);
    ctx.fillText("0", PADDING.left - 4, PADDING.top + plotH);

    // Hover crosshair + dot
    if (hoveredYear != null) {
      const idx = hoveredYear - FIXED_MIN_YEAR;
      if (idx >= 0 && idx < entries.length) {
        const hx = xScale(hoveredYear);
        const hy = yScale(entries[idx][1]);

        ctx.save();
        ctx.strokeStyle = COLORS.hoverLine;
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 3]);
        ctx.beginPath();
        ctx.moveTo(hx, PADDING.top);
        ctx.lineTo(hx, h - PADDING.bottom);
        ctx.stroke();
        ctx.restore();

        ctx.beginPath();
        ctx.arc(hx, hy, 3.5, 0, Math.PI * 2);
        ctx.fillStyle = COLORS.line;
        ctx.fill();
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    }

    if (hoveredYear == null) setupListeners(canvas);
  }

  // --- Hover / touch interaction ---

  function getYearFromPointer(canvas, clientX) {
    const rect = canvas.getBoundingClientRect();
    const mouseX = clientX - rect.left;
    const w = rect.width;
    const plotW = w - PADDING.left - PADDING.right;
    const yearFrac = FIXED_MIN_YEAR + ((mouseX - PADDING.left) / plotW) * (maxYear - FIXED_MIN_YEAR);
    const year = Math.round(yearFrac);
    if (year < FIXED_MIN_YEAR || year > maxYear) return null;
    return year;
  }

  function setupListeners(canvas) {
    removeListeners(canvas);
    canvas._chartMove = (e) => onMove(canvas, e);
    canvas._chartLeave = () => onLeave(canvas);
    canvas._chartDown = (e) => {
      e.preventDefault();
      canvas.setPointerCapture(e.pointerId);
      onMove(canvas, e);
    };
    canvas._chartUp = () => onLeave(canvas);
    canvas.addEventListener("pointermove", canvas._chartMove);
    canvas.addEventListener("pointerleave", canvas._chartLeave);
    canvas.addEventListener("pointerdown", canvas._chartDown);
    canvas.addEventListener("pointerup", canvas._chartUp);
    canvas.addEventListener("pointercancel", canvas._chartUp);
  }

  function removeListeners(canvas) {
    if (canvas._chartMove) {
      canvas.removeEventListener("pointermove", canvas._chartMove);
      canvas.removeEventListener("pointerleave", canvas._chartLeave);
      canvas.removeEventListener("pointerdown", canvas._chartDown);
      canvas.removeEventListener("pointerup", canvas._chartUp);
      canvas.removeEventListener("pointercancel", canvas._chartUp);
      canvas._chartMove = null;
    }
  }

  function onMove(canvas, e) {
    if (!hoverEntries || !hoverYearlyData) return;

    const year = getYearFromPointer(canvas, e.clientX);
    if (year == null) {
      onLeave(canvas);
      return;
    }

    const idx = year - FIXED_MIN_YEAR;
    draw(canvas, hoverYearlyData, year);

    const rect = canvas.getBoundingClientRect();
    const plotW = rect.width - PADDING.left - PADDING.right;
    const plotH = rect.height - PADDING.top - PADDING.bottom;
    const xPx = PADDING.left + ((year - FIXED_MIN_YEAR) / (maxYear - FIXED_MIN_YEAR)) * plotW;
    const yPx = PADDING.top + plotH - (hoverEntries[idx][1] / (hoverMaxCount || 1)) * plotH;

    showTooltip(canvas, xPx, yPx, `${year}: ${fmtNum(hoverEntries[idx][1])}`);
  }

  function onLeave(canvas) {
    hideTooltip(canvas);
    if (hoverYearlyData) {
      draw(canvas, hoverYearlyData);
    }
  }

  function showTooltip(canvas, x, y, text) {
    const parent = canvas.parentElement;
    let el = parent.querySelector(".chart-tooltip");
    if (!el) {
      el = document.createElement("div");
      el.className = "chart-tooltip";
      el.style.cssText = "position:absolute;pointer-events:none;background:var(--color-text);color:var(--color-surface);font-size:0.7rem;font-weight:600;padding:3px 7px;border-radius:4px;white-space:nowrap;z-index:5;transform:translateX(-50%);";
      parent.style.position = "relative";
      parent.appendChild(el);
    }
    el.textContent = text;

    const offsetX = canvas.offsetLeft;
    const offsetY = canvas.offsetTop;

    let left = offsetX + x;
    let top = offsetY + y - 28;
    top = Math.max(0, top);

    el.style.left = left + "px";
    el.style.top = top + "px";
    el.style.display = "block";
  }

  function hideTooltip(canvas) {
    const el = canvas.parentElement && canvas.parentElement.querySelector(".chart-tooltip");
    if (el) el.style.display = "none";
  }

  function setMaxYear(y) { maxYear = y; }

  return { draw, clear, setMaxYear };
})();
