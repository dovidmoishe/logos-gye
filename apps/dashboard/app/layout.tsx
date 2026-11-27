import "./globals.css";
import type { Metadata } from "next";
export const metadata: Metadata = {
  title: "Logos · Workspace",
  description: "Your private protection and accountability workspace",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
