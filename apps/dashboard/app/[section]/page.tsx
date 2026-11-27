import { notFound } from "next/navigation";
import Dashboard from "../workspace";
export default async function Page({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;
  if (section !== "partners" && section !== "devices" && section !== "privacy")
    notFound();
  return <Dashboard section={section} />;
}
