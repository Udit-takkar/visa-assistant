import { answerWithEvidence, type CitedStatement } from "@/lib/model-gateway";
import {
  retrieveHybrid,
  hybridEvidenceStillCurrent,
  hasReviewedEvidence,
  reviewReadiness,
  profiles,
  SourceError,
} from "@schengen/db";
import { apiError, readInput, stringField } from "@/lib/api-utils";
import { asksApprovalPrediction, asksOfficialRequirements, contextualDocumentTerms, wantsDocumentOverview } from "@/lib/evidence-intent";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  try {
    const input = await readInput(request);
    const query = stringField(input, "question", 4000).trim();
    const country = stringField(input, "country", 10),
      profile = stringField(input, "profile", 30);
    if (
      !query ||
      !/^(unknown|[A-Z]{2})$/.test(country) ||
      !profiles.includes(profile as (typeof profiles)[number])
    )
      throw new SourceError("Check the question and filters.", 400);
    const history = input.history ?? [];
    if (!Array.isArray(history) || history.length > 6 || history.some(q => typeof q !== "string" || !q.trim() || q.length > 4000))
      throw new SourceError("Chat history must contain at most six previous questions.", 400);
    const overview = wantsDocumentOverview(query);
    const documentTerms = contextualDocumentTerms(query, history);
    const retrievalQuery = documentTerms.length ? `${query} ${documentTerms.join(" ")}` : query;
    const retrieval = await retrieveHybrid(retrievalQuery, country, profile, overview, documentTerms.length ? documentTerms.join(" OR ") : query);
    let evidence = retrieval.evidence;
    const searchedTerms = [retrievalQuery];
    let modelNotice = retrieval.notice;
    // Repeated capture/review submissions are one piece of evidence, not corroboration.
    evidence = [...new Map(evidence.map(row => [JSON.stringify([row.sourceId, row.subject, row.quote, row.country, row.profile, row.action]), row])).values()];
    let statements: CitedStatement[] = [];
    const requirementQuestion = asksOfficialRequirements(query);
    const approvalQuestion = asksApprovalPrediction(query);
    let answerUnsupported = false;
    const genericOverview = /^(what documents do i need|which documents do i need|document list|visa checklist)[?.!]*$/i.test(query.trim());
    const compiledOverview = overview && genericOverview && evidence.length > 0 && evidence.every(row => row.reviewStatus === "reviewed") && !requirementQuestion && !approvalQuestion;
    if (compiledOverview) {
      // Already reviewed summaries are the answer to an overview request.
      // A second paraphrase adds latency and another opportunity for invented rules.
      statements = evidence.slice(0, 5).map(row => ({ text: row.summary, evidenceIds: [row.id] }));
      modelNotice = "Overview assembled from reviewed observations, with their original quotes and source links.";
    }
    if (!statements.length && !approvalQuestion && !requirementQuestion && evidence.length && process.env.OLLAMA_MODEL) {
      try {
        const modelQuestion = overview ? "Give a partial overview of documents explicitly reported in these applicant passages. Use lists unless the quoted passage explicitly states submitted or carried; do not prescribe documents for the user. Respect the destination and scenario in the user question; do not present reports from a different scenario as a match. User question: " + query : query;
        statements = await answerWithEvidence(modelQuestion, evidence, history, overview ? 3 : 1);
        answerUnsupported = statements.length === 0;
        modelNotice = retrieval.notice + " Qwen answered from these passages; check its interpretation against the quotes.";
      } catch (error) {
        console.warn("Evidence answer unavailable:", error instanceof Error ? error.message : "unknown error");
        modelNotice = retrieval.notice + " The model explanation was unavailable or failed citation validation. Inspect the source passages below.";
      }
    }
    if (!(await hybridEvidenceStillCurrent(evidence)))
      throw new SourceError("Evidence changed while answering. Send the question again to use the current review.", 409);
    const readiness = evidence.length ? null : await reviewReadiness();
    const gapReason = approvalQuestion ? "approval_prediction_unavailable" : requirementQuestion ? "official_guidance_missing" : answerUnsupported ? "answer_gap" : evidence.length ? null : retrieval.kind === "hybrid" && retrieval.captureCount ? (retrieval.filteredCaptureCount ? "search_gap" : "filter_gap") : !readiness?.approved ? "nothing_reviewed" :
      !(await hasReviewedEvidence(country, profile)) ? "filter_gap" : "search_gap";
    const message = approvalQuestion
      ? "I cannot predict or guarantee visa approval from applicant reports. I can help inspect reported documents and their sources, but individual experiences do not establish your approval chances."
      : requirementQuestion
      ? "I cannot confirm official requirements from applicant experiences. This knowledge bank has no reviewed official country checklist yet. The related passages below show what applicants reported, not what you must submit."
      : answerUnsupported
      ? "I found related applicant reports, but they do not answer this question. The passages below are context, not proof of the requested fact or current official requirements."
      : evidence.length
      ? overview
        ? "These passages describe captured applicant experiences, including unreviewed reports. This is a partial report, not your official document checklist. Tell me your destination and work situation in your message for more context."
        : "These captured applicant passages match your search; each result shows its review status. They describe individual experiences; they do not establish current visa requirements or predict approval."
      : gapReason === "nothing_reviewed"
        ? readiness?.drafts
          ? `No matching passages were retrieved. The knowledge bank also has ${readiness.drafts} draft summaries. Captured text is searchable with embeddings without approving these drafts; check the model notice for any retrieval problem.`
          : "No matching captured passages or reviewed observations were found. Capture a relevant source and check that the local embedding model is available."
        : gapReason === "filter_gap"
          ? "No matching passages have explicit classifications for these country and profile filters. Describe your destination and work situation in your message, or add sources matching your situation."
          : "No current passage matches this question closely enough. Captured reports may not cover this topic yet. Add relevant sources or ask about a document mentioned in the library.";
    return Response.json({
      gapReason,
      reviewSources: readiness?.reviewSources ?? [],
      contextPrompt: overview ? "You can describe your destination and whether you are salaried, self-employed, a freelancer, or a student in your next message. Official country checklists still need to be added before this app can establish requirements." : "",
      answerMode: compiledOverview && statements.length ? "reviewed_overview" : statements.length ? "model_explanation" : "evidence_gap_or_fallback",
      retrievalKind: retrieval.kind,
      statements,
      steps: [retrieval.kind === "hybrid" ? "Embedded the question and combined semantic and text matches" : "Embeddings unavailable; searched reviewed observations", `Found ${evidence.length} current passages or observations`,
        approvalQuestion ? "Did not predict approval from applicant reports" : requirementQuestion ? "Official checklist unavailable; returned no requirement advice" : compiledOverview && statements.length ? "Compiled reviewed observations with citations" : statements.length ? "Generated a cited Qwen explanation" : "Returned source passages or an evidence gap"],
      mode: "captured_and_reviewed_evidence",
      searchedTerms: overview ? [] : searchedTerms,
      modelNotice,
      message: evidence.length ? message : message + " This knowledge bank cannot establish the current official checklist.",
      evidence,
    });
  } catch (error) {
    return apiError(error);
  }
}
