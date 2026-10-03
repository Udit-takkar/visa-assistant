import { Workspace } from "@/components/workspace";

export default async function SourcePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <Workspace sourceId={id} />;
}
