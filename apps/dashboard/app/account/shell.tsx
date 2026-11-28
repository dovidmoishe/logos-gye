"use client";
import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import {
  LayoutGrid,
  UsersRound,
  Smartphone,
  Fingerprint,
  Sun,
  Moon,
  LogOut,
  ArrowUpRight,
  BookOpen,
} from "lucide-react";

const links = [
  { key: "overview", href: "/", title: "Overview", Icon: LayoutGrid },
  { key: "partners", href: "/partners", title: "Partners", Icon: UsersRound },
  { key: "devices", href: "/devices", title: "Devices", Icon: Smartphone },
  { key: "privacy", href: "/privacy", title: "Privacy", Icon: Fingerprint },
] as const;
export type Section = (typeof links)[number]["key"];
export function WorkspaceShell({
  section,
  username,
  logout,
  busy,
  children,
}: {
  section: Section;
  username?: string;
  logout: () => void;
  busy: boolean;
  children: ReactNode;
}) {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const media = matchMedia("(prefers-color-scheme: dark)");
    const update = () => {
      const saved = localStorage.getItem("logos.appearance");
      const active = saved ? saved === "dark" : media.matches;
      document.documentElement.dataset.appearance = active ? "dark" : "light";
      setDark(active);
    };
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  function switchTheme() {
    const theme = dark ? "light" : "dark";
    localStorage.setItem("logos.appearance", theme);
    document.documentElement.dataset.appearance = theme;
    setDark(!dark);
  }
  return (
    <div className="shell live-shell">
      <aside>
        <Link href="/" className="brand">
          <img src="/brand/logos.png" alt="" width="38" height="38" />
          Logos
        </Link>
        <nav aria-label="Workspace">
          {links.map(({ key, href, title, Icon }) => (
            <Link
              key={key}
              href={href}
              aria-current={key === section ? "page" : undefined}
            >
              <Icon size={18} />
              {title}
            </Link>
          ))}
        </nav>
        <div className="sidebar-foot">
          <Link href="/demo">
            <BookOpen size={16} />
            Explore demo
            <ArrowUpRight size={14} />
          </Link>
        </div>
      </aside>
      <main>
        <header>
          <span>
            Workspace <span aria-hidden="true"> / </span>{" "}
            <b>{links.find((l) => l.key === section)?.title}</b>
          </span>
          <div className="header-tools">
            <button
              className="icon-button"
              onClick={switchTheme}
              aria-label={dark ? "Use light appearance" : "Use dark appearance"}
            >
              {dark ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            {username && (
              <>
                <span className="identity" title={username}>
                  {username}
                </span>
                <button
                  className="icon-button"
                  aria-label="Sign out"
                  disabled={busy}
                  onClick={logout}
                >
                  <LogOut size={17} />
                </button>
              </>
            )}
          </div>
        </header>
        <div className="content">{children}</div>
      </main>
    </div>
  );
}
