import { getSource, captureSource, SourceError } from "@schengen/db";
import { apiError, readInput, stringField } from "@/lib/api-utils";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };
export async function GET(_: Request, { params }: Context) {
  try {
    return Response.json({ source: await getSource((await params).id) });
  } catch (error) {
    return apiError(error);
  }
}
export async function PUT(request: Request, { params }: Context) {
  try {
    const input = await readInput(request);
    if (
      !Number.isSafeInteger(input.expectedVersion) ||
      Number(input.expectedVersion) < 0
    )
      throw new SourceError("A valid expectedVersion is required.", 400);
    return Response.json({
      source: await captureSource(
        (await params).id,
        stringField(input, "body", 500_000),
        Number(input.expectedVersion),
      ),
    });
  } catch (error) {
    return apiError(error);
  }
}
