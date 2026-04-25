#!/usr/bin/env node
// Smoke test for /api/run. POSTs a hand-rolled minimal RunRequest and reads
// the SSE stream, printing each event with elapsed-ms timing. Exits non-zero
// if any `error` event is observed (or if any required event is missing).

const URL = process.env.LOUPE_URL ?? "http://localhost:3000/api/run";

const rubric = {
  topic: "AI product design",
  hint: "designers shipping AI features in production",
  archetype: "industry-professional",
  generatedAt: new Date().toISOString(),
  searchQueries: [
    "AI UX patterns",
    "shipping AI features in product",
    "designing with LLMs",
  ],
  criteria: [
    {
      id: "ships-ai-products",
      label: "Has shipped AI-powered products",
      description: "Demonstrably shipped a customer-facing AI/LLM feature in a real product.",
      weight: 35,
      examples: ["karpathy", "swyx", "simonw", "shl", "rauchg"],
      verificationSources: ["twitter", "github", "personal-site"],
    },
    {
      id: "writes-on-ai-design",
      label: "Writes about AI design publicly",
      description: "Publishes essays, threads, or talks on AI/UX patterns.",
      weight: 30,
      examples: ["maggieappleton", "fchollet", "natfriedman", "swyx", "geoffreylitt"],
      verificationSources: ["twitter", "personal-site", "web-search"],
    },
    {
      id: "engaged-design-community",
      label: "Engaged with the AI design community",
      description: "Active participant in conversations about AI product design.",
      weight: 35,
      examples: ["maggieappleton", "soleio", "drewolanoff", "jasonshen", "shl"],
      verificationSources: ["twitter", "web-search"],
    },
  ],
};

const body = {
  rubric,
  modes: ["discover"],
};

function fmt(ms) {
  return `${String(ms).padStart(6)}ms`;
}

async function main() {
  console.log(`POST ${URL}`);
  const start = Date.now();
  const res = await fetch(URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.error(`HTTP ${res.status}: ${text}`);
    process.exit(1);
  }
  if (!res.body) {
    console.error("response had no body");
    process.exit(1);
  }

  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buffer = "";
  let sawError = false;
  let sawDone = false;
  let candidateCount = 0;

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += dec.decode(value, { stream: true });
    let idx;
    while ((idx = buffer.indexOf("\n\n")) >= 0) {
      const chunk = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      for (const line of chunk.split("\n")) {
        if (!line.startsWith("data:")) continue;
        const json = line.slice(5).trim();
        if (!json) continue;
        let event;
        try {
          event = JSON.parse(json);
        } catch (err) {
          console.error("bad JSON:", json);
          continue;
        }
        const elapsed = Date.now() - start;
        if (event.type === "candidate") {
          candidateCount++;
          const c = event.candidate;
          console.log(
            `${fmt(elapsed)}  candidate  @${c.profile.handle.padEnd(18)} fit=${String(c.fitScore).padStart(3)} pass=${c.passCount}/${rubric.criteria.length} strength=${c.averageVerificationStrength} src=${c.source}`,
          );
        } else if (event.type === "phase") {
          console.log(
            `${fmt(elapsed)}  phase[${event.mode}] ${event.phase}${event.detail ? `: ${event.detail}` : ""}`,
          );
        } else if (event.type === "done") {
          sawDone = true;
          console.log(`${fmt(elapsed)}  done[${event.mode}] total=${event.total}`);
        } else if (event.type === "error") {
          sawError = true;
          console.log(`${fmt(elapsed)}  ERROR[${event.mode}] ${event.message}`);
        } else {
          console.log(`${fmt(elapsed)}  ?  ${json}`);
        }
      }
    }
  }

  console.log(`\nsummary: ${candidateCount} candidates, sawDone=${sawDone}, sawError=${sawError}`);
  if (sawError) process.exit(2);
  if (!sawDone) process.exit(3);
  process.exit(0);
}

main().catch((err) => {
  console.error("fatal:", err);
  process.exit(1);
});
