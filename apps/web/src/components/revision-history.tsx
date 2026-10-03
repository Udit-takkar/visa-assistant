"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { sourceRequest } from "@/lib/source-store";

type Revision = {
  id: string;
  body: string;
  contentHash: string;
  observedAt: string;
  coverage: string;
};
export function RevisionHistory({ sourceId }: { sourceId: string }) {
  const [revisions, setRevisions] = useState<Revision[] | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  async function load() {
    setLoading(true);
    try {
      const result = await sourceRequest<{ revisions: Revision[] }>(
        `/api/sources/${sourceId}/revisions`,
      );
      setRevisions(result.revisions);
      setError("");
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Could not load revisions.",
      );
    } finally {
      setLoading(false);
    }
  }
  return (
    <section className="revision-history">
      <div className="section-heading">
        <div>
          <h2>Captured text history</h2>
          <p>Earlier versions remain available as evidence.</p>
        </div>
        <Button variant="outline" loading={loading} onClick={load}>
          Load revisions
        </Button>
      </div>
      {error && (
        <p role="alert" className="error-text">
          {error}
        </p>
      )}
      {revisions?.length === 0 && <p>No captured revisions yet.</p>}
      {revisions?.map((revision) => (
        <details key={revision.id}>
          <summary>
            {new Date(revision.observedAt).toLocaleString("en-IN")} ·{" "}
            {revision.body.length} characters · {revision.coverage}
          </summary>
          <pre>{revision.body || "Empty text revision"}</pre>
          <small>SHA-256: {revision.contentHash}</small>
        </details>
      ))}
    </section>
  );
}
