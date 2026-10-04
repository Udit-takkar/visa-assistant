// Broad document questions need an overview of eligible records, not an AND search
// for filler words such as "what", "do" and "need".
export function wantsDocumentOverview(question: string) {
  const text = question.toLowerCase().replace(/[^a-z0-9 ]/g, " ");
  if (/\b(bank|insurance|contracts?|invoices?|noc|itr|cover letter|passport|flights?|hotels?)\b/.test(text)) return false;
  return /\b(document|documents|docs|paperwork)\b/.test(text) &&
    /\b(what|which|need|needed|required|list|prepare|bring|submit|submitted|carry)\b/.test(text) ||
    /\b(checklist|document list)\b/.test(text);
}


// Country/profile are separate filters; search phrases should name the document.
// Canonical phrases are authored by code, never treated as visa requirements.
export function documentSearchTerms(question: string): string[] {
  const mappings: [RegExp, string][] = [
    [/\b(bank statements?|account statements?|financial proof)\b/i, "bank statements"],
    [/\b(cover(ing)? letters?)\b/i, "cover letter"],
    [/\b(noc|no objection certificate|employer permission)\b/i, "NOC"],
    [/\b(itr|income tax returns?|tax returns?)\b/i, "ITR"],
    [/\b(contracts?)\b/i, "contracts"],
    [/\b(invoices?)\b/i, "invoices"],
    [/\b(insurances?)\b/i, "insurance"],
    [/\b(invitation|host letter)\b/i, "invitation"],
    [/\b(hotels?|accommodation)\b/i, "hotel"],
    [/\b(flights?)\b/i, "flight"],
    [/\b(passports?)\b/i, "passport"],
    [/\b(salary slips?|payslips?)\b/i, "salary slips"],
    [/\b(itinerar(y|ies))\b/i, "itinerary"],
  ];
  return mappings.filter(([pattern]) => pattern.test(question)).map(([, term]) => term).slice(0, 3);
}


export function contextualDocumentTerms(question: string, history: string[]) {
  const explicit = documentSearchTerms(question);
  if (explicit.length) return explicit;
  // Resolve a narrow reference to the previous document; never recycle prior
  // topics for an independently specified question such as today's weather.
  if (!/^(how many( months| years| days)?|did they|did he|did she|were they|was it|what about (them|it)|what did they)\b/i.test(question.trim())) return [];
  for (const previous of [...history].reverse()) {
    const terms = documentSearchTerms(previous);
    if (terms.length) return terms;
  }
  return [];
}


export function asksOfficialRequirements(question: string) {
  return /\b(official(ly)?|mandatory|required|requirements?|must)\b/i.test(question);
}


export function asksApprovalPrediction(question: string) {
  return /\b(guarantee[ds]?|guaranteed|chances?|probability|likelihood)\b.*\b(visa|approv[a-z]*)\b/i.test(question) ||
    /\b(visa|approv[a-z]*)\b.*\b(guarantee[ds]?|guaranteed|chances?|probability|likelihood)\b/i.test(question) ||
    /\bwill\b.*\b(visa|i|we)\b.*\b(approved|approval)\b/i.test(question);
}

// Template requests need the shared letter, rather than a document-list mention.
export function wantsCoverLetterTemplate(question: string, history: string[] = []) {
  const explicit = documentSearchTerms(question);
  return /\b(format|templates?|samples?|examples?)\b/i.test(question) &&
    (explicit.includes("cover letter") ||
      (!explicit.length && /^(what|which|show|share|give|can|how)\b/i.test(question.trim()) &&
        documentSearchTerms(history.at(-1) ?? "").includes("cover letter")));
}
