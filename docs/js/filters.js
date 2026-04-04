/* Baby Name Swiper - Filter logic (ported from Python) */
"use strict";

const Filters = (() => {
  function parseLetters(text) {
    if (!text || !text.trim()) return [];
    return text.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean);
  }

  function letterFilter(names, value, position, negate) {
    const letters = parseLetters(value);
    if (letters.length === 0) return names;

    return names.filter((entry) => {
      const upper = entry.name.toUpperCase();
      let match;

      if (position === "start") {
        match = letters.includes(upper[0]);
      } else if (position === "end") {
        match = letters.includes(upper[upper.length - 1]);
      } else {
        // "contains": ALL letters must be present
        match = letters.every((l) => upper.includes(l));
      }

      return negate ? !match : match;
    });
  }

  function apply(names, f) {
    let result = names;

    // Letter filters
    result = letterFilter(result, f.startsWith, "start", false);
    result = letterFilter(result, f.notStartsWith, "start", true);
    result = letterFilter(result, f.endsWith, "end", false);
    result = letterFilter(result, f.notEndsWith, "end", true);
    result = letterFilter(result, f.contains, "contains", false);
    result = letterFilter(result, f.notContains, "contains", true);

    // Length filters
    if (f.minLength > 0) {
      result = result.filter((n) => n.name.length >= f.minLength);
    }
    if (f.maxLength > 0) {
      result = result.filter((n) => n.name.length <= f.maxLength);
    }

    // Popularity filters
    if (f.minOccurrences > 0) {
      result = result.filter((n) => n.absTotal >= f.minOccurrences);
    }
    if (f.skipTopN > 0) {
      result = result.slice(f.skipTopN);
    }

    // Character filters
    if (f.noHyphens) {
      result = result.filter((n) => !n.name.includes("-"));
    }
    if (f.noSpecialChars) {
      result = result.filter((n) => /^[a-zA-Z]+$/.test(n.name));
    }

    return result;
  }

  // Seeded PRNG (mulberry32) for reproducible shuffles
  function mulberry32(seed) {
    return function () {
      seed |= 0;
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function order(names, randomness, seed) {
    if (names.length === 0) return names;

    const rng = mulberry32(Math.floor(seed * 2147483647));

    const maxPop = Math.max(...names.map((n) => n.absTotal));
    const minPop = Math.min(...names.map((n) => n.absTotal));
    const popRange = maxPop - minPop || 1;

    const scored = names.map((entry) => {
      const popNorm = (entry.absTotal - minPop) / popRange;
      const score = popNorm * (1 - randomness) + rng() * randomness;
      return { entry, score };
    });

    scored.sort((a, b) => b.score - a.score);
    return scored.map((s) => s.entry);
  }

  return { apply, order, parseLetters };
})();
