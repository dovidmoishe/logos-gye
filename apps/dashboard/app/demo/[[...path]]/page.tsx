import { notFound } from "next/navigation";
import Dashboard from "../../workspace";
export default async function Demo({
  params,
}: {
  params: Promise<{ path?: string[] }>;
}) {
  const { path = [] } = await params;
  const section = path[0] || "overview";
  if (
    path.length > 1 ||
    (section !== "overview" &&
      section !== "devices" &&
      section !== "privacy" &&
      section !== "partners")
  )
    notFound();
  return <Dashboard section={section} />;
}
