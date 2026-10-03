import { config } from "dotenv";
import { mkdir, writeFile } from "node:fs/promises";
import { suggestObservations, answerWithEvidence } from "../../../apps/web/src/lib/model-gateway";
config({ path: "../../.env", quiet: true });
const fixtures = [
  {
    name: "missing facts stay unknown",
    text: "Synthetic applicant report: I submitted travel insurance. I have not shared my destination or occupation.",
    expectedAction: "submitted",
    expectedProfile: "unknown",
    expectedCountry: "unknown",
  },
  {
    name: "carried is distinct from submitted",
    text: "Synthetic report: I am a freelancer applying to Switzerland. I carried my client contracts to the appointment but did not submit those contracts.",
    expectedAction: "carried",
    expectedProfile: "freelancer",
    expectedCountry: "CH",
  },
  {
    name: "suggestion is not an official requirement",
    text: "Synthetic freelancer comment: I suggest carrying client invoices, but I do not know whether they are required. I have not said which country I applied to.",
    expectedAction: "suggested",
    expectedProfile: "freelancer",
    expectedCountry: "unknown",
  },
];
const results = [];
for (const fixture of fixtures) {
  const started = Date.now();
  try {
    const observations = await suggestObservations(fixture.text);
    const classificationsSupported = observations.every(
      (row) =>
        (row.country === "unknown" ||
          row.country === fixture.expectedCountry) &&
        (row.profile === "unknown" || row.profile === fixture.expectedProfile)
    );
    const matched =
      classificationsSupported &&
      observations.some(
        (row) =>
          row.action === fixture.expectedAction &&
          row.profile === fixture.expectedProfile &&
          row.country === fixture.expectedCountry
      );
    const result = {
      name: fixture.name,
      durationMs: Date.now() - started,
      passed: matched,
      observations,
    };
    results.push(result);
    console.log(
      `${matched ? "PASS" : "FAIL"} ${fixture.name}: ${result.durationMs}ms; ${
        observations.length
      } candidates`
    );
  } catch (error) {
    results.push({
      name: fixture.name,
      durationMs: Date.now() - started,
      passed: false,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    console.log(`FAIL ${fixture.name}: extraction unavailable or invalid`);
  }
}
const chatStarted = Date.now();
try {
  const statements = await answerWithEvidence("Did they submit the client contracts?", [{
    id: "synthetic-contracts", summary: "The freelancer carried contracts but did not submit them.",
    quote: "I carried my client contracts to the appointment but did not submit those contracts.",
    subject: "original_poster", country: "CH", profile: "freelancer", action: "carried"
  }], ["What documents did this freelancer carry?"]);
  const passed = statements.length > 0 && statements.some(row => /not submit|didn't submit|not.*submitted|did not.*submit/i.test(row.text));
  results.push({ name: "cited conversational answer", passed, durationMs: Date.now() - chatStarted, statements });
  console.log(`${passed ? "PASS" : "FAIL"} cited conversational answer`);
} catch (error) {
  results.push({ name: "cited conversational answer", passed: false, durationMs: Date.now() - chatStarted, error: String(error) });
}
await mkdir("../../.local/evaluations", { recursive: true });
await writeFile(
  "../../.local/evaluations/qwen-smoke.json",
  JSON.stringify(
    {
      model: process.env.OLLAMA_MODEL,
      evaluatedAt: new Date().toISOString(),
      scope:
        "Four synthetic smoke fixtures, not a quality benchmark or visa validation.",
      results,
    },
    null,
    2
  )
);
if (results.some((result) => !result.passed)) process.exitCode = 1;
