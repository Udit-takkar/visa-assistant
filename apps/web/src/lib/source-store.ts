"use client";

import { useCallback, useEffect, useState } from "react";
import { decodeSources, type Source } from "@/lib/sources";

const KEY = "schengen-sources-v1";
const EVENT = "schengen-database-changed";
export async function sourceRequest<T>(
  path: string,
  options?: RequestInit,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, { cache: "no-store", ...options });
  } catch {
    throw new Error(
      "Could not reach the server. Your editor text has been kept.",
    );
  }
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "The request failed.");
  return result;
}
function changed() {
  window.dispatchEvent(new Event(EVENT));
}
export async function registerSource(input: {
  url: string;
  title: string;
  reason: string;
}) {
  const result = await sourceRequest<{ source: Source }>("/api/sources", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  changed();
  return result.source;
}
export async function saveSourceText(source: Source, body: string) {
  const result = await sourceRequest<{ source: Source }>(
    `/api/sources/${source.id}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body, expectedVersion: source.version ?? 0 }),
    },
  );
  changed();
  return result.source;
}
export function useSources() {
  const [sources, setSources] = useState<Source[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [legacy, setLegacy] = useState<Source[]>([]);
  const refresh = useCallback(() => {
    return sourceRequest<{ sources: Source[] }>("/api/sources")
      .then((result) => {
        setSources(result.sources);
        setError("");
        setReady(true);
        try {
          const raw = localStorage.getItem(KEY);
          setLegacy(
            raw && localStorage.getItem("schengen-imported-snapshot") !== raw
              ? decodeSources(raw)
              : [],
          );
        } catch {
          setLegacy([]);
        }
      })
      .catch((error: unknown) => {
        setError(
          error instanceof Error ? error.message : "Database unavailable.",
        );
        setReady(true);
      });
  }, []);
  useEffect(() => {
    void refresh();
    const onChange = () => {
      void refresh();
    };
    window.addEventListener(EVENT, onChange);
    return () => window.removeEventListener(EVENT, onChange);
  }, [refresh]);
  return { sources, ready, error, refresh, legacy };
}

export function useSourceSearch(query: string, sources: Source[]) {
  const [result, setResult] = useState<{
    query: string;
    sources: Source[];
    error: string;
  } | null>(null);
  useEffect(() => {
    if (!query.trim()) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      void sourceRequest<{ sources: Source[] }>(
        `/api/sources?q=${encodeURIComponent(query)}`,
        { signal: controller.signal },
      )
        .then((data) => {
          if (!controller.signal.aborted)
            setResult({ query, sources: data.sources, error: "" });
        })
        .catch((error: unknown) => {
          if (!controller.signal.aborted)
            setResult({
              query,
              sources: [],
              error:
                error instanceof Error ? error.message : "Search unavailable.",
            });
        });
    }, 200);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, sources]);
  return {
    results: query.trim()
      ? result?.query === query
        ? result.sources
        : []
      : sources,
    searching: Boolean(query.trim() && result?.query !== query),
    error: result?.query === query ? result.error : "",
  };
}

export async function importLegacyDrafts(drafts: Source[]) {
  const conflicts: string[] = [];
  for (const draft of drafts) {
    let source: Source;
    const existing = await fetch(`/api/sources/${draft.id}`, {
      cache: "no-store",
    });
    if (existing.status === 404) source = await registerSource(draft);
    else {
      const result = await existing.json();
      if (!existing.ok) throw new Error(result.error || "Import failed.");
      source = result.source;
    }
    if (draft.body && source.body !== draft.body) {
      if (source.body) {
        conflicts.push(draft.title);
        continue;
      }
      await saveSourceText(source, draft.body);
    }
  }
  if (!conflicts.length) {
    try {
      localStorage.setItem(
        "schengen-imported-snapshot",
        localStorage.getItem(KEY) || "",
      );
    } catch {
      /* Original drafts remain available. */
    }
  }
  changed();
  return conflicts;
}
