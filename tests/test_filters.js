/* Tests for filters.js - run with: node tests/test_filters.js */
"use strict";

// Load filters module by evaluating it in Node context
const fs = require("fs");

const code = fs.readFileSync("docs/js/filters.js", "utf-8");
const Filters = new Function(code + "\nreturn Filters;")();

let passed = 0;
let failed = 0;

function assert(condition, msg) {
  if (condition) {
    passed++;
  } else {
    failed++;
    console.error("FAIL:", msg);
  }
}

function assertEq(actual, expected, msg) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    passed++;
  } else {
    failed++;
    console.error(`FAIL: ${msg}\n  expected: ${e}\n  actual:   ${a}`);
  }
}

// --- Test data ---
const names = [
  { name: "Alexander", absTotal: 1000, pctTotal: 2.0, absRecent: 200, pctRecent: 1.5, yearly: {} },
  { name: "Anna", absTotal: 900, pctTotal: 1.8, absRecent: 180, pctRecent: 1.3, yearly: {} },
  { name: "Björn", absTotal: 500, pctTotal: 1.0, absRecent: 50, pctRecent: 0.3, yearly: {} },
  { name: "Eva-Maria", absTotal: 300, pctTotal: 0.6, absRecent: 30, pctRecent: 0.2, yearly: {} },
  { name: "Max", absTotal: 800, pctTotal: 1.6, absRecent: 160, pctRecent: 1.1, yearly: {} },
  { name: "Sophia", absTotal: 700, pctTotal: 1.4, absRecent: 140, pctRecent: 1.0, yearly: {} },
  { name: "Ömer", absTotal: 400, pctTotal: 0.8, absRecent: 80, pctRecent: 0.6, yearly: {} },
  { name: "Li", absTotal: 100, pctTotal: 0.2, absRecent: 10, pctRecent: 0.1, yearly: {} },
];

function noFilter() {
  return {
    startsWith: "", notStartsWith: "", endsWith: "", notEndsWith: "",
    contains: "", notContains: "",
    minLength: 1, maxLength: 0, minOccurrences: 0, skipTopN: 0,
    noHyphens: false, noSpecialChars: false, randomness: 0,
  };
}

// --- parseLetters ---
assertEq(Filters.parseLetters("A, B, C"), ["A", "B", "C"], "parseLetters: basic");
assertEq(Filters.parseLetters("a"), ["A"], "parseLetters: lowercase");
assertEq(Filters.parseLetters(""), [], "parseLetters: empty");
assertEq(Filters.parseLetters("  X , Y  "), ["X", "Y"], "parseLetters: whitespace");

// --- startsWith ---
{
  const f = noFilter();
  f.startsWith = "A";
  const result = Filters.apply(names, f);
  assert(result.length === 2, "startsWith A: count");
  assert(result.every((n) => n.name[0].toUpperCase() === "A"), "startsWith A: all match");
}

// --- notStartsWith ---
{
  const f = noFilter();
  f.notStartsWith = "A";
  const result = Filters.apply(names, f);
  assert(result.every((n) => n.name[0].toUpperCase() !== "A"), "notStartsWith A: none match");
  assert(result.length === 6, "notStartsWith A: count");
}

// --- endsWith ---
{
  const f = noFilter();
  f.endsWith = "A";
  const result = Filters.apply(names, f);
  const expected = ["Anna", "Eva-Maria", "Sophia"];
  assertEq(result.map((n) => n.name).sort(), expected, "endsWith A: names");
}

// --- notEndsWith ---
{
  const f = noFilter();
  f.notEndsWith = "A";
  const result = Filters.apply(names, f);
  assert(result.every((n) => !n.name.toUpperCase().endsWith("A")), "notEndsWith A: none end with A");
}

// --- contains ---
{
  const f = noFilter();
  f.contains = "AN";
  const result = Filters.apply(names, f);
  assert(result.length === 2, "contains AN: count");
  assert(result.some((n) => n.name === "Alexander"), "contains AN: Alexander");
  assert(result.some((n) => n.name === "Anna"), "contains AN: Anna");
}

// --- notContains ---
{
  const f = noFilter();
  f.notContains = "AN";
  const result = Filters.apply(names, f);
  assert(result.every((n) => !n.name.toUpperCase().includes("AN")), "notContains AN: none contain AN");
}

// --- minLength ---
{
  const f = noFilter();
  f.minLength = 4;
  const result = Filters.apply(names, f);
  assert(result.every((n) => n.name.length >= 4), "minLength 4: all >= 4");
  assert(!result.some((n) => n.name === "Max"), "minLength 4: Max excluded");
  assert(!result.some((n) => n.name === "Li"), "minLength 4: Li excluded");
}

// --- maxLength ---
{
  const f = noFilter();
  f.maxLength = 4;
  const result = Filters.apply(names, f);
  assert(result.every((n) => n.name.length <= 4), "maxLength 4: all <= 4");
  assertEq(result.map((n) => n.name).sort(), ["Anna", "Li", "Max", "Ömer"], "maxLength 4: names");
}

// --- minOccurrences ---
{
  const f = noFilter();
  f.minOccurrences = 500;
  const result = Filters.apply(names, f);
  assert(result.every((n) => n.absTotal >= 500), "minOccurrences 500: all >= 500");
  assert(result.length === 5, "minOccurrences 500: count");
}

// --- skipTopN ---
{
  const f = noFilter();
  f.skipTopN = 2;
  const result = Filters.apply(names, f);
  // Data is sorted by absTotal desc: Alexander(1000), Anna(900), Max(800)...
  // skipTopN skips first 2 → starts from Max
  assert(result.length === 6, "skipTopN 2: count");
  assert(!result.some((n) => n.name === "Alexander"), "skipTopN 2: Alexander skipped");
  assert(!result.some((n) => n.name === "Anna"), "skipTopN 2: Anna skipped");
}

// --- noHyphens ---
{
  const f = noFilter();
  f.noHyphens = true;
  const result = Filters.apply(names, f);
  assert(result.every((n) => !n.name.includes("-")), "noHyphens: none have hyphens");
  assert(!result.some((n) => n.name === "Eva-Maria"), "noHyphens: Eva-Maria excluded");
}

// --- noSpecialChars ---
{
  const f = noFilter();
  f.noSpecialChars = true;
  const result = Filters.apply(names, f);
  assert(result.every((n) => /^[a-zA-Z]+$/.test(n.name)), "noSpecialChars: all ASCII");
  assert(!result.some((n) => n.name === "Björn"), "noSpecialChars: Björn excluded");
  assert(!result.some((n) => n.name === "Ömer"), "noSpecialChars: Ömer excluded");
  assert(!result.some((n) => n.name === "Eva-Maria"), "noSpecialChars: Eva-Maria excluded (hyphen)");
}

// --- combined filters ---
{
  const f = noFilter();
  f.startsWith = "A";
  f.minLength = 5;
  const result = Filters.apply(names, f);
  assertEq(result.map((n) => n.name), ["Alexander"], "combined: starts with A + min 5");
}

// --- order: pure popularity (randomness=0) ---
{
  const ordered = Filters.order(names.slice(), 0, 42);
  const totals = ordered.map((n) => n.absTotal);
  for (let i = 1; i < totals.length; i++) {
    assert(totals[i] <= totals[i - 1], "order randomness=0: sorted by popularity desc");
  }
}

// --- order: deterministic with same seed ---
{
  const a = Filters.order(names.slice(), 0.5, 12345);
  const b = Filters.order(names.slice(), 0.5, 12345);
  assertEq(a.map((n) => n.name), b.map((n) => n.name), "order: same seed = same result");
}

// --- order: different seed = different result ---
{
  const a = Filters.order(names.slice(), 0.8, 111);
  const b = Filters.order(names.slice(), 0.8, 999);
  const same = a.every((n, i) => n.name === b[i].name);
  assert(!same, "order: different seeds produce different order");
}

// Report
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
