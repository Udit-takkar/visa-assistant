import { listSources, registerSource, SourceError } from "@schengen/db";
import { apiError, readInput, stringField } from "@/lib/api-utils";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const query = new URL(request.url).searchParams.get("q") || "";
    if (query.length > 500)
      throw new SourceError("Search query is too long.", 400);
    return Response.json({ sources: await listSources(query) });
  } catch (error) {
    return apiError(error);
  }
}
export async function POST(request: Request) {
  try {
    const input = await readInput(request);
    const source = await registerSource({
      url: stringField(input, "url", 2000),
      title: stringField(input, "title", 160),
      reason: stringField(input, "reason", 500),
    });
    return Response.json({ source }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
