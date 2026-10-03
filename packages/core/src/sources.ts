export type Source = {
  id: string;
  url: string;
  title: string;
  reason: string;
  body: string;
  capturedAt: string | null;
  version?: number;
  reviewedCount?: number;
};

export const seedSource: Source = {
  id: "1u9i3ts",
  url: "https://www.reddit.com/r/SchengenVisa/comments/1u9i3ts/schengen_visa_approved_via_switzerland_vfs_delhi/",
  title: "Switzerland · VFS Delhi",
  reason:
    "Our first selected thread. Title inferred from the URL; applicant details are not verified.",
  body: "",
  capturedAt: null,
};

export function parseThreadUrl(value: string) {
  const url = new URL(value.trim());
  if (
    url.protocol !== "https:" ||
    !["reddit.com", "www.reddit.com", "old.reddit.com"].includes(url.hostname)
  ) {
    throw new Error("Use an HTTPS Reddit thread link.");
  }
  const match = url.pathname.match(
    /^\/r\/SchengenVisa\/comments\/([a-z0-9]+)(?:\/([^/]+))?\/?$/i,
  );
  if (!match)
    throw new Error(
      "Paste a post link from r/SchengenVisa, rather than a comment or profile link.",
    );
  return {
    id: match[1].toLowerCase(),
    url: `https://www.reddit.com/r/SchengenVisa/comments/${match[1].toLowerCase()}/${match[2] ? `${match[2]}/` : ""}`,
  };
}

export function decodeSources(snapshot: string | null): Source[] {
  if (!snapshot) return [seedSource];
  try {
    const parsed: unknown = JSON.parse(snapshot);
    if (!Array.isArray(parsed)) return [seedSource];
    const valid = parsed.filter((item): item is Source => {
      if (!item || typeof item !== "object") return false;
      const source = item as Partial<Source>;
      return (
        typeof source.id === "string" &&
        typeof source.url === "string" &&
        typeof source.title === "string" &&
        typeof source.reason === "string" &&
        typeof source.body === "string" &&
        (source.capturedAt === null || typeof source.capturedAt === "string") &&
        (() => {
          try {
            return parseThreadUrl(source.url).id === source.id;
          } catch {
            return false;
          }
        })()
      );
    });
    return valid.length ? valid : [seedSource];
  } catch {
    return [seedSource];
  }
}
