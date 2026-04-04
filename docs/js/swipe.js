/* Namerl - Swipe gesture handling via Pointer Events */
"use strict";

const Swipe = (() => {
  const THRESHOLD = 80;     // px to trigger action
  const MAX_ROTATION = 12;  // degrees at full drag

  // Swipe feedback colors (read once from CSS tokens)
  let likeRgb = "16, 185, 129";
  let dislikeRgb = "239, 68, 68";

  function parseHexToRgb(hex) {
    const h = hex.replace("#", "");
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)].join(", ");
  }

  let card = null;
  let onSwipe = null;       // callback(direction: "like"|"dislike")
  let startX = 0;
  let deltaX = 0;
  let dragging = false;

  function init(cardEl, callback) {
    card = cardEl;
    onSwipe = callback;

    // Read swipe colors from CSS tokens
    const s = getComputedStyle(document.documentElement);
    const like = s.getPropertyValue("--color-like").trim();
    const dislike = s.getPropertyValue("--color-dislike").trim();
    if (like.startsWith("#")) likeRgb = parseHexToRgb(like);
    if (dislike.startsWith("#")) dislikeRgb = parseHexToRgb(dislike);

    card.addEventListener("pointerdown", onPointerDown);
    card.addEventListener("pointermove", onPointerMove);
    card.addEventListener("pointerup", onPointerUp);
    card.addEventListener("pointercancel", onPointerUp);
  }

  function onPointerDown(e) {
    // Only primary pointer (left mouse / single touch)
    if (e.button !== 0) return;
    // Don't start swipe when interacting with the chart
    if (e.target.tagName === "CANVAS") return;
    dragging = true;
    startX = e.clientX;
    deltaX = 0;
    card.setPointerCapture(e.pointerId);
    card.style.transition = "none";
  }

  function onPointerMove(e) {
    if (!dragging) return;
    deltaX = e.clientX - startX;
    const rotation = (deltaX / window.innerWidth) * MAX_ROTATION;
    card.style.transform = `translateX(${deltaX}px) rotate(${rotation}deg)`;

    const pct = Math.min(Math.abs(deltaX) / THRESHOLD, 1);
    if (deltaX > 0) {
      card.style.boxShadow = `inset -4px 0 0 rgba(${likeRgb}, ${pct * 0.5})`;
    } else if (deltaX < 0) {
      card.style.boxShadow = `inset 4px 0 0 rgba(${dislikeRgb}, ${pct * 0.5})`;
    }
  }

  function onPointerUp() {
    if (!dragging) return;
    dragging = false;

    if (Math.abs(deltaX) >= THRESHOLD) {
      // Fly out
      const direction = deltaX > 0 ? "like" : "dislike";
      const flyX = deltaX > 0 ? window.innerWidth : -window.innerWidth;
      card.style.transition = "transform 0.3s cubic-bezier(0.25, 1, 0.5, 1), opacity 0.3s cubic-bezier(0.25, 1, 0.5, 1)";
      card.style.transform = `translateX(${flyX}px) rotate(${deltaX > 0 ? 30 : -30}deg)`;
      card.style.opacity = "0";

      setTimeout(() => {
        card.style.transition = "none";
        card.style.transform = "";
        card.style.opacity = "";
        card.style.boxShadow = "";
        if (onSwipe) onSwipe(direction);
        // Re-enable transitions after reset
        requestAnimationFrame(() => {
          card.style.transition = "";
        });
      }, 300);
    } else {
      // Snap back
      card.style.transition = "transform 0.25s cubic-bezier(0.25, 1, 0.5, 1), box-shadow 0.25s cubic-bezier(0.25, 1, 0.5, 1)";
      card.style.transform = "";
      card.style.boxShadow = "";
    }
  }

  return { init };
})();
