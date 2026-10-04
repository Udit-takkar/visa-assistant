"use client";
import { useState, type FormEvent } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  BookOpen,
  MessageCircle,
  Send,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from "@/components/ai/conversation";
import { Message, MessageContent } from "@/components/ai/message";
import { sourceRequest } from "@/lib/source-store";
type Evidence = {
  id: string;
  summary: string;
  quote: string;
  url: string;
  title: string;
  country: string;
  profile: string;
  action: string;
  subject: string;
  sourceId: string;
  reviewStatus?: "reviewed" | "captured_unreviewed";
};
type Answer = {
  message: string;
  contextPrompt?: string;
  reviewSources?: { sourceId: string; title: string; draftCount: number }[];
  statements?: { text: string; evidenceIds: string[] }[];
  steps?: string[];
  evidence: Evidence[];
  searchedTerms?: string[];
  modelNotice?: string;
};
const starters = ["freelance contracts", "bank statements", "cover letter"];
export function AssistantPanel() {
  const [draft, setDraft] = useState("");
  const [turns, setTurns] = useState<
    { question: string; answer: Answer }[]
  >([]);
  const [pendingQuestion, setPendingQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function ask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft.trim() || busy) return;
    const question = draft.trim();
    setPendingQuestion(question);
    setBusy(true);
    setError("");
    try {
      const answer = await sourceRequest<Answer>("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question,
          country: "unknown",
          profile: "unknown",
          history: turns.slice(-6).map(t => t.question),
        }),
      });
      setTurns(previous => [...previous, { question, answer }]);
      setDraft(current => current.trim() === question ? "" : current);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not search evidence.");
    } finally {
      setBusy(false);
      setPendingQuestion("");
    }
  }
  return (
    <div className="assistant-page">
      <div className="eyebrow">YOUR VISA RESEARCH COMPANION</div>
      <div className="section-heading assistant-heading">
        <div>
          <h1>
            Ask with context.
            <br />
            Answer with evidence.
          </h1>
          <p>Discuss your situation using captured reports and linked evidence.</p>
        </div>
        <span className="status">
          <span /> Local Qwen agent
        </span>
      </div>
      <div className="assistant-layout">
        <section className="chat-panel" aria-label="Evidence assistant">
          <div className="chat-panel-header">
            <span>
              <MessageCircle size={16} /> Visa assistant
            </span>
            <small>Semantic retrieval + Qwen</small>
          </div>
          <Conversation className="chat-conversation">
            <ConversationContent>
              {!turns.length ? (
                <ConversationEmptyState
                  icon={<Sparkles size={27} />}
                  title="Start with a document or circumstance."
                  description="Search specific terms, such as freelance contracts or insurance. Semantic search finds current source passages, including unreviewed reports. Each answer links to its source."
                />
              ) : (
                turns.map((turn, index) => (
                  <div key={index}>
                    <Message from="user">
                      <MessageContent>
                        <p>{turn.question}</p>
                      </MessageContent>
                    </Message>
                    <Message from="assistant">
                      <MessageContent>
                        <p>{turn.answer.message}</p>
                        {turn.answer.contextPrompt && <p>{turn.answer.contextPrompt}</p>}
                        {turn.answer.reviewSources?.map(source => <p key={source.sourceId}>
                          <Link className="review-action" href={`/sources/${source.sourceId}`}>Review {source.title} · {source.draftCount} drafts ↗</Link>
                        </p>)}
                        {turn.answer.statements?.map((statement, i) => (
                          <div key={i} className="cited-statement">
                            <p>{statement.text}</p>
                            {statement.evidenceIds.map(id => {
                              const row = turn.answer.evidence.find(item => item.id === id);
                              return row ? <a key={id} href={row.url} target="_blank" rel="noopener noreferrer">[{turn.answer.evidence.indexOf(row) + 1}] {row.title} ↗</a> : null;
                            })}
                          </div>
                        ))}
                        {turn.answer.steps && <details className="agent-steps"><summary>Agent activity</summary><ol>{turn.answer.steps.map(step => <li key={step}>{step}</li>)}</ol></details>}
                        {turn.answer.modelNotice && (
                          <p>{turn.answer.modelNotice}</p>
                        )}
                        {!!turn.answer.searchedTerms?.length && (
                          <small>
                            Search terms:{" "}
                            {turn.answer.searchedTerms.join(" · ")}
                          </small>
                        )}
                        {turn.answer.evidence.map((row) => (
                          <article key={row.id} className="answer-evidence">
                            <h4>{row.summary}</h4><small>{row.reviewStatus === "captured_unreviewed" ? "Captured report · not manually reviewed" : "Reviewed observation"}</small>
                            <blockquote>{row.quote}</blockquote>
                            <p>
                              {row.country} · {row.profile} · {row.action} ·{" "}
                              {row.subject}
                            </p>
                            <a
                              href={row.url}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              Source: {row.title} ↗
                            </a>
                            <Link href={`/sources/${row.sourceId}`}>
                              Inspect capture and review
                            </Link>
                          </article>
                        ))}
                        <small>
                          Results are a snapshot of this search. Search again
                          after changing a capture or review.
                        </small>
                      </MessageContent>
                    </Message>
                  </div>
                ))
              )}
              {busy && <div role="status" aria-live="polite" className="agent-pending"><p>{pendingQuestion}</p><small>Searching source passages and preparing an answer with local Qwen…</small></div>}
            </ConversationContent>
            <ConversationScrollButton />
          </Conversation>
          <div className="chat-starters">
            {starters.map((starter) => (
              <Button
                key={starter}
                variant="outline"
                onClick={() => setDraft(starter)}
              >
                {starter}
                <ArrowUpRight size={12} />
              </Button>
            ))}
          </div>
          <form onSubmit={ask} className="chat-composer">
            <label className="sr-only" htmlFor="question-draft">
              Your visa question
            </label>
            <Textarea
              id="question-draft"
              placeholder="Describe your destination, work situation, and visa question…"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              maxLength={4000}
            />
            {error && (
              <p role="alert" className="error-text">
                {error}
              </p>
            )}
            <div>
              <small>
                Local conversation. Every answer checks current source versions.
              </small>
              <Button disabled={!draft.trim() || busy} type="submit">
                {busy ? "Thinking…" : "Send message"}
                <Send size={14} />
              </Button>
            </div>
          </form>
        </section>
        <aside className="chat-evidence">
          <div className="context-card">
            <span className="little-icon">
              <BookOpen size={18} />
            </span>
            <h3>Evidence you can inspect.</h3>
            <p>
              Each result contains a captured passage or reviewed observation, an exact quote, and
              original Reddit permalink. Describe your destination and work situation in your question.
            </p>
            <p>
              These are applicant experiences. Official country checklists still
              need to be added and maintained.
            </p>
            <Button variant="outline" render={<Link href="/" />}>
              Open source library
              <ArrowUpRight size={14} />
            </Button>
          </div>
          <div className="context-note">
            <BookOpen size={18} />
            <p>
              Captured passages are labelled unreviewed. Reviewed summaries are checked interpretations; stale captures are excluded.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
