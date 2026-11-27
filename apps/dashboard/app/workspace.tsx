"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowDownRight,
  ArrowRight,
  CalendarDays,
  ChevronRight,
  Fingerprint,
  Layers3,
  LayoutGrid,
  LockKeyhole,
  Plus,
  ShieldCheck,
  Smartphone,
  UserRound,
  Users,
  X,
} from "lucide-react";
import { useWorkspace, type Partner } from "../lib/workspace";

const nav = [
  { key: "overview", name: "Overview", href: "/", icon: LayoutGrid },
  { key: "devices", name: "Devices", href: "/devices", icon: Smartphone },
  { key: "partners", name: "Partners", href: "/partners", icon: Users },
  { key: "privacy", name: "Privacy", href: "/privacy", icon: Fingerprint },
] as const;
type Section = (typeof nav)[number]["key"];
const headings = {
  overview: "Overview",
  devices: "Your devices",
  partners: "Accountability partners",
  privacy: "Privacy & sharing",
};
const descriptions = {
  devices: "Coverage and verification for your enrolled devices.",
  partners: "Manage invitations and choose who can see your weekly report.",
  privacy: "Review report permissions and manage your demo data.",
};
const scope =
  "Weekly grouped counts of blocked adult-category DNS requests. Domain names and coverage gaps stay private.";
type Modal = "invite" | "preview" | "agreement" | "recipient" | "clear" | null;

export default function Dashboard({ section }: { section: Section }) {
  const store = useWorkspace();
  const [modal, setModal] = useState<Modal>(null);
  const [email, setEmail] = useState("");
  const [selected, setSelected] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  const partner = store.partners.find((p) => p.id === selected);
  useEffect(() => {
    void useWorkspace.getState().load();
  }, [section]);
  useEffect(() => {
    if (modal && !dialog.current?.open) dialog.current?.showModal();
    if (!modal) dialog.current?.close();
  }, [modal]);
  const current = nav.find((item) => item.key === section)!;
  const count = store.partners.filter((p) => p.status === "Connected").length;
  function invite() {
    setEmail("");
    setModal("invite");
  }
  async function finish(operation: Promise<boolean>) {
    if (await operation) setModal(null);
  }
  const partnerRows = (list: Partner[]) =>
    !store.ready ? (
      <p className="muted">
        {store.error ? "Partner list unavailable." : "Loading partners…"}
      </p>
    ) : list.length ? (
      list.map((p) => (
        <button
          key={p.id}
          className="partner-row"
          onClick={() => {
            setSelected(p.id);
            setModal("agreement");
          }}
        >
          <span className="icon-box">
            <UserRound />
          </span>
          <span className="min-w-0 flex-1 truncate text-left">{p.email}</span>
          <span className="chip" data-status={p.status}>
            {p.status}
          </span>
          <ChevronRight size={16} />
        </button>
      ))
    ) : (
      <div className="empty">
        <span className="empty-symbol">
          <Users size={22} />
        </span>
        <div>
          <strong>No partners yet</strong>
          <p>Invite someone you trust to receive a weekly summary.</p>
        </div>
      </div>
    );
  const error = store.error && (
    <div className="error" role="alert">
      {store.error} <button onClick={() => void store.load()}>Refresh</button>
    </div>
  );
  return (
    <div className="shell">
      <aside>
        <Link href="/" className="brand">
          <span>
            <Layers3 size={21} />
          </span>
          Logos
        </Link>
        <nav aria-label="Main navigation">
          {nav.map(({ key, name, href, icon: Icon }) => (
            <Link
              href={href}
              key={key}
              aria-current={section === key ? "page" : undefined}
            >
              <Icon size={18} />
              {name}
            </Link>
          ))}
        </nav>
        <div className="profile">
          <span className="avatar">D</span>
          <div>
            Demo account<small>Personal workspace</small>
          </div>
        </div>
      </aside>
      <main>
        <header>
          <div className="flex items-center gap-3">
            Workspace <ChevronRight size={13} />
            <b>{current.name}</b>
          </div>
          <Link className="textlink" href="/account">Device account →</Link>
          <span className="chip">
            <i /> Demo workspace
          </span>
        </header>
        <div className="content">
          <div className="heading">
            <div>
              <h1>{headings[section]}</h1>
              {section !== "overview" && <p>{descriptions[section]}</p>}
            </div>
            {(section === "overview" || section === "partners") && (
              <button
                className="primary"
                disabled={!store.ready || store.busy}
                onClick={invite}
              >
                <Plus size={17} /> Add partner
              </button>
            )}
          </div>
          {!modal && error}
          {section === "overview" && (
            <div className="overview-metrics">
              <Link href="/devices" className="metric protection">
                <span className="metric-label">
                  <ShieldCheck />
                  Device protection
                </span>
                <strong>Verified</strong>
                <span className="metric-foot">
                  iPhone 13 · Sample device <ArrowRight />
                </span>
              </Link>
              <Link href="/partners" className="metric">
                <span className="metric-label">
                  <Users />
                  Accountability
                </span>
                <strong>{store.ready ? String(count) : "—"}</strong>
                <span className="metric-foot">
                  Connected partners <ArrowRight />
                </span>
              </Link>
              <Link href="/privacy" className="metric">
                <span className="metric-label">
                  <CalendarDays />
                  Report schedule
                </span>
                <strong>Weekly</strong>
                <span className="metric-foot">
                  Review sharing scope <ArrowRight />
                </span>
              </Link>
            </div>
          )}
          <div
            className={section === "overview" ? "overview-details" : undefined}
          >
            {(section === "overview" || section === "partners") && (
              <section className="panel">
                <div className="panelhead">
                  <h2>
                    {section === "overview"
                      ? "Accountability partners"
                      : "Invitations & connections"}
                  </h2>
                  {section === "overview" && (
                    <Link href="/partners" className="textlink">
                      View all <ArrowRight size={14} />
                    </Link>
                  )}
                </div>
                {partnerRows(
                  section === "overview"
                    ? store.partners.slice(0, 3)
                    : store.partners,
                )}
              </section>
            )}
          </div>
          {section === "devices" && (
            <>
              <section className="panel">
                <h2>Enrolled devices</h2>
                <div className="device">
                  <span className="icon-box">
                    <Smartphone />
                  </span>
                  <div className="grow">
                    iPhone 13<small>Sample device · iOS</small>
                  </div>
                  <span className="chip">
                    <i /> Verified in demo
                  </span>
                </div>
              </section>
              <section className="panel">
                <h2>Verify a connection</h2>
                <p>
                  In the iPhone app, tap Run safe DNS check. Repeat after
                  switching between Wi-Fi and cellular. If the check fails,
                  confirm Logos is selected in DNS settings.
                </p>
                <small>Live device results are available on your iPhone.</small>
              </section>
            </>
          )}
          {section === "privacy" && (
            <>
              <section className="panel">
                <LockKeyhole className="accent" />
                <h2>Partner report scope</h2>
                <p>{scope}</p>
                <Link className="textlink" href="/partners">
                  Review agreements <ArrowDownRight size={16} />
                </Link>
              </section>
              <section className="panel">
                <h2>Demo workspace data</h2>
                <p>
                  Your browser has a private demo session. Invitations are
                  stored by the local API. No email is sent.
                </p>
                <button
                  className="secondary"
                  disabled={!store.ready}
                  onClick={() => setModal("clear")}
                >
                  Clear demo invitations
                </button>
              </section>
            </>
          )}
        </div>
      </main>
      <dialog
        ref={dialog}
        onCancel={() => setModal(null)}
        aria-labelledby="modal-title"
      >
        <div className="panelhead">
          <h2 id="modal-title">
            {
              {
                invite: "Add a partner",
                preview: "Invitation preview",
                agreement: "Partner agreement",
                recipient: "Recipient preview",
                clear: "Clear demo invitations?",
              }[modal || "invite"]
            }
          </h2>
          <button aria-label="Close" onClick={() => setModal(null)}>
            <X size={20} />
          </button>
        </div>
        {modal === "invite" && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setModal("preview");
            }}
          >
            <label>
              Partner email
              <input
                autoFocus
                type="email"
                required
                maxLength={254}
                placeholder="partner@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            <p>{scope}</p>
            <small>Use a fictional email for this demo.</small>
            <button className="primary">
              Preview invitation <ArrowRight size={16} />
            </button>
          </form>
        )}
        {modal === "preview" && (
          <>
            <p>Invitation for {email}</p>
            <SampleReport />
            <p>{scope}</p>
            <small>
              Invitations expire in seven days. You can revoke access any time.
              Previously viewed information cannot be recalled.
            </small>
            <button
              className="primary"
              disabled={store.busy}
              onClick={() => finish(store.invite(email))}
            >
              Create demo invitation
            </button>
          </>
        )}
        {modal === "agreement" && partner && (
          <>
            <p>
              {partner.email} · {partner.status}
            </p>
            <p>{scope}</p>
            {partner.status === "Connected" && <SampleReport />}
            {partner.status === "Pending" && (
              <button
                className="secondary"
                onClick={() => setModal("recipient")}
              >
                Preview recipient invitation
              </button>
            )}
            {["Connected", "Pending"].includes(partner.status) && (
              <button
                className="primary"
                disabled={store.busy}
                onClick={() => finish(store.change(partner.id, "revoke"))}
              >
                Revoke access
              </button>
            )}
          </>
        )}
        {modal === "recipient" && partner && (
          <>
            <p>{scope}</p>
            <small>Simulate the recipient’s decision for this demo.</small>
            {(["accept", "decline"] as const).map((a) => (
              <button
                key={a}
                className={a === "accept" ? "primary" : "secondary"}
                disabled={store.busy}
                onClick={() => finish(store.change(partner.id, a))}
              >
                {a === "accept" ? "Accept invitation" : "Decline invitation"}
              </button>
            ))}
          </>
        )}
        {modal === "clear" && (
          <>
            <p>
              This removes all invitations and agreements in this demo
              workspace.
            </p>
            <button
              className="primary"
              disabled={store.busy}
              onClick={() => finish(store.clear())}
            >
              Clear invitations
            </button>
          </>
        )}
        {modal && error}
      </dialog>
    </div>
  );
}
function SampleReport() {
  return (
    <div className="sample">
      <strong>Sample weekly report</strong>
      <p>Nov 16–22 · 2 grouped blocked requests</p>
      <small>DNS requests can include background activity.</small>
    </div>
  );
}
