import { evidenceWorkspace, SourceError } from "@schengen/db";
import { apiError, readInput, stringField } from "@/lib/api-utils";
import { suggestObservations } from "@/lib/model-gateway";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const input = await readInput(request);
    const data = await evidenceWorkspace((await params).id);
    if (input.sourceVersion !== data.sourceVersion)
      throw new SourceError(
        "The evidence changed. Refresh before extracting.",
        409
      );
    const commentId = stringField(input, "commentId", 30);
    const comment = data.comments.find((row) => row.id === commentId);
    if (commentId && !comment) throw new SourceError("Comment not found.", 404);
    const candidates = await suggestObservations(
      comment ? comment.body : data.postBody
    );
    if (
      (await evidenceWorkspace((await params).id)).sourceVersion !==
      data.sourceVersion
    )
      throw new SourceError(
        "Evidence changed while the model was working. Refresh and try again; nothing was saved.",
        409
      );
    return Response.json({ candidates, sourceVersion: data.sourceVersion });
  } catch (error) {
    return apiError(error);
  }
}
