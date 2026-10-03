import { SourceError } from "@schengen/db";

export async function readInput(
  request: Request,
): Promise<Record<string, unknown>> {
  const origin = request.headers.get("origin");
  const target = new URL(request.url);
  // Next may reconstruct its internal URL with a different loopback hostname.
  // Compare the browser origin to the incoming Host, not forwarded headers.
  const expectedOrigin = `${target.protocol}//${request.headers.get("host") || target.host}`;
  if (
    (origin && origin !== expectedOrigin) ||
    request.headers.get("sec-fetch-site") === "cross-site"
  )
    throw new SourceError("Cross-site writes are not allowed.", 403);
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    throw new SourceError("Send JSON input.", 415);
  const text = await request.text();
  if (Buffer.byteLength(text, "utf8") > 600_000)
    throw new SourceError("Input is too large.", 413);
  let input: unknown;
  try {
    input = JSON.parse(text);
  } catch {
    throw new SourceError("Invalid JSON input.", 400);
  }
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new SourceError("Expected an object.", 400);
  return input as Record<string, unknown>;
}
export function stringField(
  input: Record<string, unknown>,
  name: string,
  max: number,
) {
  if (typeof input[name] !== "string" || input[name].length > max)
    throw new SourceError(`Invalid ${name}.`, 400);
  return input[name];
}
export function apiError(error: unknown) {
  if (error instanceof SourceError)
    return Response.json({ error: error.message }, { status: error.status });
  return Response.json(
    {
      error:
        "The database is unavailable. Check the local database setup and try again.",
    },
    { status: 503 },
  );
}
