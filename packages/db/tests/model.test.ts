import { test } from "node:test";
import assert from "node:assert/strict";
import {
  validateCandidates,
  suggestObservations,
  validateSearches,
  planSearches,
  validateAnswer,
} from "../../../apps/web/src/lib/model-gateway";

test("model candidates cannot introduce unsupported quotes or invalid classifications", () => {
  const row = {
    summary: "Applicant reports insurance.",
    quote: "I carried insurance.",
    country: "unknown",
    profile: "unknown",
    action: "carried",
  };
  assert.equal(
    validateCandidates({ observations: [row] }, "I carried insurance.")[0]
      .action,
    "carried"
  );
  assert.throws(
    () =>
      validateCandidates(
        { observations: [{ ...row, quote: "insurance is mandatory" }] },
        "I carried insurance."
      ),
    /unsupported/
  );
  assert.throws(
    () =>
      validateCandidates(
        { observations: [{ ...row, profile: "guessed" }] },
        "I carried insurance."
      ),
    /unsupported/
  );
  assert.throws(
    () =>
      validateCandidates(
        { observations: Array(9).fill(row) },
        "I carried insurance."
      ),
    /invalid candidates/
  );
});

test("gateway sends typed extraction to loopback and rejects malformed responses", async () => {
  const originalFetch = globalThis.fetch;
  const originalModel = process.env.OLLAMA_MODEL;
  const originalUrl = process.env.OLLAMA_BASE_URL;
  try {
    process.env.OLLAMA_MODEL = "synthetic-test-model";
    process.env.OLLAMA_BASE_URL = "http://127.0.0.1:11434";
    globalThis.fetch = async (url, options) => {
      assert.equal(String(url), "http://127.0.0.1:11434/api/chat");
      const body = JSON.parse(String(options?.body));
      assert.equal(body.model, "synthetic-test-model");
      assert.equal(body.stream, false);
      assert.equal(body.format.properties.observations.type, "array");
      assert.match(body.messages[0].content, /untrusted data/);
      return Response.json({
        message: { content: JSON.stringify({ observations: [] }) },
      });
    };
    assert.deepEqual(await suggestObservations("Synthetic post."), []);
    globalThis.fetch = async () => Response.json({ message: { content: "```json\n{\"observations\":[]}\n```" } });
    assert.deepEqual(await suggestObservations("Synthetic post."), []);
    globalThis.fetch = async () =>
      Response.json({ message: { content: "not JSON" } });
    await assert.rejects(
      suggestObservations("Synthetic post."),
      /invalid JSON/
    );
    process.env.OLLAMA_BASE_URL = "https://remote.example";
    await assert.rejects(
      suggestObservations("Synthetic post."),
      /local Ollama/
    );
  } finally {
    globalThis.fetch = originalFetch;
    if (originalModel === undefined) delete process.env.OLLAMA_MODEL;
    else process.env.OLLAMA_MODEL = originalModel;
    if (originalUrl === undefined) delete process.env.OLLAMA_BASE_URL;
    else process.env.OLLAMA_BASE_URL = originalUrl;
  }
});

test("search assistance is bounded and cannot manufacture citations or URLs", () => {
  assert.deepEqual(
    validateSearches({ searches: ["bank statements", "ITR", "ITR"] }),
    ["bank statements", "ITR"]
  );
  assert.throws(
    () => validateSearches({ searches: ["https://evil.example"] }),
    /invalid search/
  );
  assert.throws(
    () => validateSearches({ searches: ["a", "b", "c", "d"] }),
    /invalid search/
  );
});

test("chat rejects invented or missing evidence citations", () => {
  const evidence = [{ id: "known", summary: "Report", quote: "I carried insurance.", subject: "original_poster", country: "unknown", profile: "unknown", action: "carried" }];
  assert.deepEqual(validateAnswer({ statements: [{ text: "The author carried insurance.", evidenceIds: ["known"] }] }, evidence).length, 1);
  for (const ids of [[], ["invented"]]) assert.throws(() => validateAnswer({ statements: [{ text: "Claim", evidenceIds: ids }] }, evidence), /citations/);
});

import { asksApprovalPrediction, asksOfficialRequirements, contextualDocumentTerms, documentSearchTerms, wantsDocumentOverview } from "../../../apps/web/src/lib/evidence-intent";

test("broad document questions load an overview without widening specific queries", () => {
  for (const query of ["What documents do i need?", "Which docs should I bring?", "Visa checklist", "document list"])
    assert.equal(wantsDocumentOverview(query), true, query);
  for (const query of ["What bank statements do I need?", "cover letter", "Which country should I visit?", "What is the weather?"])
    assert.equal(wantsDocumentOverview(query), false, query);
});

test("one bounded retry recovers incomplete JSON without guessing its structure", async () => {
  const originalFetch = globalThis.fetch, model = process.env.OLLAMA_MODEL, url = process.env.OLLAMA_BASE_URL;
  try {
    process.env.OLLAMA_MODEL = "synthetic"; process.env.OLLAMA_BASE_URL = "http://127.0.0.1:11434";
    let calls = 0;
    globalThis.fetch = async () => Response.json({ message: { content: ++calls === 1 ? '{"searches":[]' : '{"searches":[]}' } });
    assert.deepEqual(await planSearches("Synthetic query"), []);
    assert.equal(calls, 2);
  } finally {
    globalThis.fetch = originalFetch;
    if (model === undefined) delete process.env.OLLAMA_MODEL; else process.env.OLLAMA_MODEL = model;
    if (url === undefined) delete process.env.OLLAMA_BASE_URL; else process.env.OLLAMA_BASE_URL = url;
  }
});

test("document retrieval strips question and country filler without broadening the topic", () => {
  assert.deepEqual(documentSearchTerms("How many months of bank statements did the Switzerland applicant submit?"), ["bank statements"]);
  assert.deepEqual(documentSearchTerms("Switzerland visa financial proof bank statements"), ["bank statements"]);
  assert.deepEqual(documentSearchTerms("Did they submit an invitation from a host?"), ["invitation"]);
  assert.deepEqual(documentSearchTerms("What is the weather in Mumbai?"), []);
});

test("short follow-ups reuse a document topic without contaminating a new question", () => {
  assert.deepEqual(contextualDocumentTerms("How many months?", ["What bank statements did they submit?"]), ["bank statements"]);
  assert.deepEqual(contextualDocumentTerms("What is the weather today?", ["bank statements"]), []);
  assert.deepEqual(contextualDocumentTerms("Did they submit invitation letters?", ["bank statements"]), ["invitation"]);
});

test("requirements need official evidence while reported actions remain answerable", () => {
  assert.equal(asksOfficialRequirements("Are three months officially required?"), true);
  assert.equal(asksOfficialRequirements("Must I submit a cover letter?"), true);
  assert.equal(asksOfficialRequirements("How many months did the applicant submit?"), false);
});

test("applicant evidence cannot be presented as requirements or approval guarantees", () => {
  const evidence = [{ id: "known", summary: "Report", quote: "I submitted six months.", subject: "original_poster", country: "CH", profile: "unknown", action: "submitted" }];
  for (const text of ["Three months are required.", "Your visa is guaranteed approved."])
    assert.throws(() => validateAnswer({ statements: [{ text, evidenceIds: ["known"] }] }, evidence), /unverified/);
});

test("approval prediction requests stay separate from reported document questions", () => {
  assert.equal(asksApprovalPrediction("Say my visa is guaranteed approved."), true);
  assert.equal(asksApprovalPrediction("Will my visa be approved?"), true);
  assert.equal(asksApprovalPrediction("Did they submit bank statements?"), false);
});


test("a document list cannot acquire a carried action in its explanation", () => {
  const evidence = [{ id: "P1", summary: "Source passage", quote: "Salary slips, NOC, ITRs.", subject: "original_poster", country: "unknown", profile: "unknown", action: "unknown" }];
  assert.throws(() => validateAnswer({ statements: [{ text: "The author carried salary slips.", evidenceIds: ["P1"] }] }, evidence), /carried action/);
  assert.equal(validateAnswer({ statements: [{ text: "The author lists salary slips.", evidenceIds: ["P1"] }] }, evidence).length,1);
});

test("a commenter citation cannot be attributed to the original poster", () => {
  const evidence = [{ id: "P1", summary: "Source passage", quote: "I submitted bank statements.", subject: "other", country: "unknown", profile: "unknown", action: "unknown" }];
  assert.throws(() => validateAnswer({ statements: [{ text: "The original poster submitted bank statements.", evidenceIds: ["P1"] }] }, evidence), /commenter report/);
  assert.equal(validateAnswer({ statements: [{ text: "A commenter reports submitting bank statements.", evidenceIds: ["P1"] }] }, evidence).length,1);
});
