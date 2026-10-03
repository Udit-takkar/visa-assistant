"use client";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { sourceRequest } from "@/lib/source-store";
type Reply = {
  id: string;
  parentId: string | null;
  attribution: string;
  url: string;
  body: string;
};
type Observation = {
  id: string;
  summary: string;
  quote: string;
  subject: string;
  country: string;
  profile: string;
  action: string;
  commentId: string | null;
  status: string;
  stale: boolean;
};
type Workspace = {
  sourceVersion: number;
  sourceUrl: string;
  sourceTitle: string;
  postBody: string;
  comments: Reply[];
  observations: Observation[];
  coverage: string;
};
type Candidate = {
  summary: string;
  quote: string;
  country: string;
  profile: string;
  action: string;
  sourceVersion?: number;
  commentId?: string;
};
export function EvidenceReview({
  sourceId,
  version,
}: {
  sourceId: string;
  version: number;
}) {
  const [data, setData] = useState<Workspace | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [comment, setComment] = useState({
    url: "",
    body: "",
    parentId: "",
    attribution: "unknown",
  });
  const [claim, setClaim] = useState({
    commentId: "",
    summary: "",
    quote: "",
    country: "unknown",
    profile: "unknown",
    action: "unknown",
  });
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const refresh = useCallback(() => {
    return sourceRequest<Workspace>(`/api/sources/${sourceId}/evidence`)
      .then((result) => {
        setData(result);
        setError("");
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : "Could not load evidence.");
      });
  }, [sourceId]);
  useEffect(() => {
    void refresh();
  }, [refresh, version]);
  async function write(input: Record<string, unknown>) {
    setBusy(true);
    setError("");
    try {
      await sourceRequest(`/api/sources/${sourceId}/evidence`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...input, sourceVersion: data?.sourceVersion }),
      });
      await refresh();
      window.dispatchEvent(new Event("schengen-database-changed"));
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save evidence.");
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function addComment(event: FormEvent) {
    event.preventDefault();
    if (await write({ operation: "comment", ...comment }))
      setComment({ url: "", body: "", parentId: "", attribution: "unknown" });
  }
  async function addClaim(event: FormEvent) {
    event.preventDefault();
    if (await write({ operation: "observation", ...claim }))
      setClaim({ ...claim, summary: "", quote: "" });
  }
  async function extract() {
    setBusy(true);
    setError("");
    setCandidates([]);
    try {
      const result = await sourceRequest<{
        candidates: Candidate[];
        sourceVersion: number;
      }>(`/api/sources/${sourceId}/extract`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          commentId: claim.commentId,
          sourceVersion: data?.sourceVersion,
        }),
      });
      setCandidates(
        result.candidates.map((row) => ({
          ...row,
          sourceVersion: result.sourceVersion,
          commentId: claim.commentId,
        }))
      );
      if (!result.candidates.length)
        setError("The model found no candidate observations in this capture.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Extraction failed.");
    } finally {
      setBusy(false);
    }
  }
  function exportCapture() {
    if (!data) return;
    const snapshot = {
      schemaVersion: 1,
      url: data.sourceUrl,
      title: data.sourceTitle,
      body: data.postBody,
      comments: data.comments.map(({ url, body, parentId, attribution }) => ({
        url,
        body,
        parentId,
        attribution,
      })),
      reviewSnapshot: data.observations,
      provenance: {
        method: "exported database captures",
        coverage: data.coverage,
        exportedAt: new Date().toISOString(),
        sourceVersion: data.sourceVersion,
        note: "Import preserves captures only; review approvals must be performed again.",
      },
    };
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(snapshot, null, 2)], {
        type: "application/json",
      })
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `thread-${sourceId}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }
  const passage = claim.commentId
    ? data?.comments.find((row) => row.id === claim.commentId)?.body
    : data?.postBody;
  return (
    <section
      className="evidence-workspace"
      aria-label="Comments and evidence review"
    >
      <div className="section-heading">
        <div>
          <h2>Comments & evidence review</h2>
          <p>{data?.coverage || "Loading captured evidence…"}</p>
        </div>
        <Button variant="outline" onClick={refresh} disabled={busy}>
          Refresh evidence
        </Button>
      </div>
      {error && (
        <p role="alert" className="error-text">
          {error}
        </p>
      )}
      <Button
        variant="outline"
        disabled={!data || busy}
        onClick={exportCapture}
      >
        Export thread capture
      </Button>
      <div className="review-grid">
        <section className="context-card">
          <h3>Capture a selected comment</h3>
          <p>
            Capture parents before replies. Saved comments are immutable;
            include clarifications as additional comments.
          </p>
          <form onSubmit={addComment} className="review-form">
            <label>
              Comment permalink
              <Input
                value={comment.url}
                onChange={(e) =>
                  setComment({ ...comment, url: e.target.value })
                }
                maxLength={2000}
                required
              />
            </label>
            <label>
              Reply to
              <select
                aria-label="Reply to"
                value={comment.parentId}
                onChange={(e) =>
                  setComment({ ...comment, parentId: e.target.value })
                }
              >
                <option value="">Original post</option>
                {data?.comments.map((row) => (
                  <option key={row.id} value={row.id}>
                    Comment {row.id}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Comment author
              <select
                aria-label="Comment author"
                value={comment.attribution}
                onChange={(e) =>
                  setComment({ ...comment, attribution: e.target.value })
                }
              >
                <option value="unknown">Unknown</option>
                <option value="original_poster">Original poster</option>
                <option value="other">Another commenter</option>
              </select>
            </label>
            <label>
              Exact comment text
              <Textarea
                value={comment.body}
                onChange={(e) =>
                  setComment({ ...comment, body: e.target.value })
                }
                maxLength={50000}
                required
              />
            </label>
            <Button type="submit" disabled={busy || !data?.postBody.trim()}>
              Save comment
            </Button>
          </form>
          <div className="captured-comments">
            {data?.comments.map((row) => (
              <details key={row.id}>
                <summary>
                  Comment {row.id} · {row.attribution.replaceAll("_", " ")}
                </summary>
                <p>Reply to: {row.parentId || "original post"}</p>
                <blockquote>{row.body}</blockquote>
                <a href={row.url} target="_blank" rel="noopener noreferrer">
                  Cross-check comment ↗
                </a>
              </details>
            ))}
          </div>
        </section>
        <section className="context-card">
          <h3>Add an observation</h3>
          <p>
            Summarize one reported fact. Keep missing fields unknown. Approval
            means a person checked this quote and interpretation; it does not
            verify the report.
          </p>
          <form onSubmit={addClaim} className="review-form">
            <label>
              Evidence passage
              <select
                aria-label="Evidence passage"
                value={claim.commentId}
                onChange={(e) => {
                  setClaim({
                    ...claim,
                    commentId: e.target.value,
                    summary: "",
                    quote: "",
                  });
                  setCandidates([]);
                }}
              >
                <option value="">Original post</option>
                {data?.comments.map((row) => (
                  <option key={row.id} value={row.id}>
                    Comment {row.id}
                  </option>
                ))}
              </select>
            </label>
            <details>
              <summary>Read selected capture</summary>
              <blockquote>{passage || "Capture post text first."}</blockquote>
            </details>
            <Button
              variant="outline"
              disabled={busy || !passage?.trim()}
              onClick={extract}
              type="button"
            >
              {busy ? "Working…" : "Suggest with Qwen"}
            </Button>
            {candidates.map((row, index) => (
              <Button
                variant="outline"
                type="button"
                disabled={
                  busy ||
                  row.sourceVersion !== data?.sourceVersion ||
                  row.commentId !== claim.commentId
                }
                key={index}
                onClick={() => setClaim({ ...claim, ...row })}
              >
                Use candidate {index + 1}: {row.summary.slice(0, 70)}
              </Button>
            ))}
            <label>
              Reported observation
              <Textarea
                value={claim.summary}
                onChange={(e) =>
                  setClaim({ ...claim, summary: e.target.value })
                }
                maxLength={2000}
                required
              />
            </label>
            <label>
              Exact supporting quote
              <Textarea
                value={claim.quote}
                onChange={(e) => setClaim({ ...claim, quote: e.target.value })}
                maxLength={10000}
                required
              />
            </label>
            <label>
              Country code
              <Input
                placeholder="CH, FR, or unknown"
                value={claim.country}
                onChange={(e) =>
                  setClaim({
                    ...claim,
                    country:
                      e.target.value === "unknown"
                        ? "unknown"
                        : e.target.value.toUpperCase(),
                  })
                }
                maxLength={7}
                required
              />
            </label>
            <label>
              Applicant profile
              <select
                aria-label="Applicant profile"
                value={claim.profile}
                onChange={(e) =>
                  setClaim({ ...claim, profile: e.target.value })
                }
              >
                {[
                  "unknown",
                  "freelancer",
                  "salaried",
                  "student",
                  "self_employed",
                  "retired",
                  "unemployed",
                ].map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </select>
            </label>
            <label>
              Document action
              <select
                aria-label="Document action"
                value={claim.action}
                onChange={(e) => setClaim({ ...claim, action: e.target.value })}
              >
                {[
                  "unknown",
                  "submitted",
                  "carried",
                  "requested",
                  "returned",
                  "suggested",
                ].map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </select>
            </label>
            <Button type="submit" disabled={busy || !passage?.trim()}>
              Save draft observation
            </Button>
          </form>
        </section>
      </div>
      <section className="context-card reviewed-list">
        <h3>Review queue · {data?.observations.length ?? 0}</h3>
        <p>
          Check the complete post and relevant replies above before approving.
          Any new capture makes previous observations stale.
        </p>
        {!data?.observations.length && (
          <p>
            No observations yet. Drafts are excluded from assistant answers.
          </p>
        )}
        {data?.observations.map((row) => (
          <article key={row.id} className="observation-card">
            <span className="status">
              {row.stale ? "Stale · excluded" : row.status}
            </span>
            <h4>{row.summary}</h4>
            <blockquote>{row.quote}</blockquote>
            <p>
              Subject: {row.subject} · Country: {row.country} · Profile:{" "}
              {row.profile} · Action: {row.action}
            </p>
            <a
              href={
                row.commentId
                  ? data.comments.find((c) => c.id === row.commentId)?.url
                  : `https://www.reddit.com/r/SchengenVisa/comments/${sourceId}/`
              }
              target="_blank"
              rel="noopener noreferrer"
            >
              Cross-check original source ↗
            </a>
            <div className="review-actions">
              <Button
                disabled={busy || row.stale || row.status === "approved"}
                onClick={() =>
                  write({ operation: "review", id: row.id, status: "approved" })
                }
              >
                Approve observation
              </Button>
              <Button
                variant="outline"
                disabled={busy || row.status === "rejected"}
                onClick={() =>
                  write({ operation: "review", id: row.id, status: "rejected" })
                }
              >
                Reject observation
              </Button>
            </div>
          </article>
        ))}
      </section>
    </section>
  );
}
