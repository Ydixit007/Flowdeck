import { ProjectDetailScreen } from "@/components/projects/project-detail-screen";

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ProjectDetailScreen projectId={id} />;
}
