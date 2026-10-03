import { listRevisions } from "@schengen/db";
import { apiError } from "@/lib/api-utils";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(
  _: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    return Response.json({ revisions: await listRevisions((await params).id) });
  } catch (error) {
    return apiError(error);
  }
}
