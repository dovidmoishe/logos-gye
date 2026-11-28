import { notFound } from "next/navigation";
import { AccountWorkspace } from "../account/workspace";
export default async function Page({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;
  if (section !== "partners" && section !== "devices" && section !== "privacy")
    notFound();
  return <AccountWorkspace section={section} />;
}
