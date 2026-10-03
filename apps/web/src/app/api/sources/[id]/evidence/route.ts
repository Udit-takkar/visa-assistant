import {
  evidenceWorkspace,
  captureComment,
  proposeObservation,
  reviewObservation,
  SourceError,
} from "@schengen/db";
import { apiError, readInput, stringField } from "@/lib/api-utils";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };
export async function GET(_: Request, { params }: Context) {
  try {
    return Response.json(await evidenceWorkspace((await params).id));
  } catch (error) {
    return apiError(error);
  }
}
export async function POST(request: Request, { params }: Context) {
  try {
    const input = await readInput(request);
    const id = (await params).id;
    const operation = stringField(input, "operation", 20);
    if (operation === "review") {
      const claimId = stringField(input, "id", 40);
      if (
        !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(
          claimId
        )
      )
        throw new SourceError("Invalid observation ID.", 400);
      return Response.json({
        observation: await reviewObservation(
          id,
          claimId,
          stringField(input, "status", 20)
        ),
      });
    }
    if (
      !Number.isSafeInteger(input.sourceVersion) ||
      Number(input.sourceVersion) < 0
    )
      throw new SourceError("A valid sourceVersion is required.", 400);
    if (operation === "comment")
      return Response.json(
        {
          comment: await captureComment(id, {
            url: stringField(input, "url", 2000),
            body: stringField(input, "body", 50_000),
            parentId: stringField(input, "parentId", 30) || null,
            attribution: stringField(input, "attribution", 20),
            expectedVersion: Number(input.sourceVersion),
          }),
        },
        { status: 201 }
      );
    if (operation === "observation")
      return Response.json(
        {
          observation: await proposeObservation(id, {
            sourceVersion: Number(input.sourceVersion),
            commentId: stringField(input, "commentId", 30) || null,
            summary: stringField(input, "summary", 2000),
            quote: stringField(input, "quote", 10000),
            country: stringField(input, "country", 10),
            profile: stringField(input, "profile", 30),
            action: stringField(input, "action", 30),
          }),
        },
        { status: 201 }
      );
    throw new SourceError("Unknown operation.", 400);
  } catch (error) {
    return apiError(error);
  }
}
