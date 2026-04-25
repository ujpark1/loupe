#!/usr/bin/env node
// Manual test for /api/generate-criteria.
// Run the dev server in another terminal first:
//   npm run dev
// Then:
//   node --env-file=.env.local scripts/test-criteria.mjs
//   PORT=3000 TOPIC="..." HINT="..." node --env-file=.env.local scripts/test-criteria.mjs

const PORT = process.env.PORT || "3000";
const HOST = process.env.HOST || "127.0.0.1";
const TOPIC = process.env.TOPIC || "AI product design";
const HINT = process.env.HINT || "focused on real software products, not research";

const url = `http://${HOST}:${PORT}/api/generate-criteria`;

const body = { topic: TOPIC, hint: HINT };
console.log(`POST ${url}`);
console.log(`body: ${JSON.stringify(body)}`);
console.log("---");

const start = Date.now();
let res;
try {
  res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
} catch (err) {
  console.error(`fetch failed: ${err.message}`);
  console.error(`Is the dev server running on ${HOST}:${PORT}?`);
  process.exit(1);
}
const elapsed = ((Date.now() - start) / 1000).toFixed(1);

const text = await res.text();
let json;
try {
  json = JSON.parse(text);
} catch {
  console.error(`Non-JSON response (${res.status}) after ${elapsed}s:`);
  console.error(text);
  process.exit(1);
}

console.log(`status: ${res.status}  elapsed: ${elapsed}s`);
console.log("---");

if (!json.ok) {
  console.error("ERROR:", json.error);
  process.exit(1);
}

const r = json.rubric;
console.log(`topic:      ${r.topic}`);
if (r.hint) console.log(`hint:       ${r.hint}`);
console.log(`archetype:  ${r.archetype}`);
console.log(`generated:  ${r.generatedAt}`);
console.log("");
console.log("CRITERIA:");
let totalWeight = 0;
for (const c of r.criteria) {
  totalWeight += c.weight;
  console.log(`  [${String(c.weight).padStart(3)}]  ${c.label}`);
  console.log(`         id: ${c.id}`);
  console.log(`         ${c.description}`);
  console.log(`         examples: ${c.examples.map((h) => "@" + h).join(", ")}`);
  console.log(`         verify:   ${c.verificationSources.join(", ")}`);
  console.log("");
}
console.log(`(weight sum: ${totalWeight})`);
console.log("");
console.log("SEARCH QUERIES:");
for (const q of r.searchQueries) {
  console.log(`  - ${q}`);
}
