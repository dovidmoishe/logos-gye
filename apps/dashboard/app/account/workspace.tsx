"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import axios from "axios";
import Link from "next/link";
import { accountAPI as client, emailAuthAPI } from "../../lib/account";
import { AccountAgreements, ReportPreview } from "./agreements";
import { WorkspaceShell, type Section } from "./shell";
import {
  ArrowUpRight,
  HeartHandshake,
  ShieldCheck,
  Smartphone,
} from "lucide-react";

type Device = {
  id: string;
  name: string;
  state: "paired" | "pending" | "expired";
  lastCheck: "blocked" | "open" | "unknown" | null;
  checkedAt: number | null;
};
type Account = { username: string; devices: Device[] };
const outcomes = {
  blocked: "Test domain blocked",
  open: "Test domain resolved",
  unknown: "Inconclusive",
};
export function AccountWorkspace({ section }: { section: Section }) {
  const [account, setAccount] = useState<Account | null>(null),
    [loading, setLoading] = useState(true);
  const [legacy, setLegacy] = useState(false);
  const [notice, setNotice] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [username, setUsername] = useState(""),
    [password, setPassword] = useState(""),
    [name, setName] = useState("My iPhone");
  const [enrollment, setEnrollment] = useState<{
    id: string;
    code: string;
    expiresAt: number;
  } | null>(null);
  const challenge = useRef("");
  const refreshVersion = useRef(0);
  const refresh = useCallback(async () => {
    const version = ++refreshVersion.current;
    try {
      const result = await client.get<Account>("");
      if (version === refreshVersion.current) setAccount(result.data);
    } catch (e) {
      if (version !== refreshVersion.current) return;
      if (axios.isAxiosError(e) && e.response?.status === 401) {
        setAccount(null);
        setEnrollment(null);
      } else throw e;
    }
  }, []);
  async function action(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(
        axios.isAxiosError(e) && typeof e.response?.data?.message === "string"
          ? e.response.data.message
          : e instanceof Error
            ? e.message
            : "Request failed. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  function resetCode() {
    setCode("");
    challenge.current = "";
    setSentTo(null);
    setNotice("");
    setError("");
  }
  async function sendCode(address: string) {
    const { data } = await emailAuthAPI.post<{ challenge: string }>("/otp", { email: address });
    challenge.current = data.challenge;
    setSentTo(address);
    setCode("");
  }
  useEffect(() => {
    let mounted = true;
    const load = () => {
      void refresh()
        .catch(() => {
          if (mounted) setError("Unable to load your account.");
        })
        .finally(() => {
          if (mounted) setLoading(false);
        });
    };
    load();
    window.addEventListener("focus", load);
    return () => {
      mounted = false;
      ++refreshVersion.current;
      window.removeEventListener("focus", load);
    };
  }, [refresh]);
  const titles = {
    overview: "Your workspace",
    partners: "Accountability partners",
    devices: "Your devices",
    privacy: "Privacy & sharing",
  };
  return (
    <WorkspaceShell
      section={section}
      busy={busy}
      username={account?.username}
      logout={() =>
        void action(async () => {
          await client.delete("/session");
          setAccount(null);
          setEnrollment(null);
          setUsername("");
          setEmail("");
          setLegacy(false);
          resetCode();
        })
      }
    >
      <div className="heading">
        <h1>{titles[section]}</h1>
      </div>
      {(section === "overview" || section === "partners") && (
        <section className="journal-hero">
          <div>
            <HeartHandshake size={24} aria-hidden="true" />
            <h2>
              {section === "partners"
                ? "Your circle of support"
                : "Weekly accountability"}
            </h2>
            <p>
              Choose who can see your weekly summary and review exactly what you
              share.
            </p>
            {section === "overview" && (
              <Link className="hero-link" href="/partners">
                Open partners <ArrowUpRight size={15} />
              </Link>
            )}
          </div>
          <img src="/brand/journal.png" alt="" width="292" height="200" />
        </section>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {loading ? (
        <p>Loading…</p>
      ) : !account ? (
        <div className="dashboard-grid">
          <form
            className="panel account-form"
            onSubmit={(e) => {
              e.preventDefault();
              if (busy) return;
              void action(async () => {
                setNotice("");
                if (legacy) {
                  await client.post("/login", { username, password });
                } else if (sentTo) {
                  await emailAuthAPI.post("/verify", {
                    email: sentTo, token: code, challenge: challenge.current, client: "web",
                  });
                } else {
                  await sendCode(email.trim());
                  return;
                }
                setPassword("");
                resetCode();
                await refresh();
              });
            }}
          >
            <h2>
              {legacy
                ? "Pilot sign-in"
                : sentTo
                  ? "Check your email"
                  : "Continue with email"}
            </h2>
            {notice && <p role="status">{notice}</p>}
            {legacy ? (
              <>
                <label>
                  Pilot username
                  <input
                    required
                    autoComplete="username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                  />
                </label>
                <label>
                  Password
                  <input
                    required
                    type="password"
                    autoComplete="current-password"
                    maxLength={128}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </label>
              </>
            ) : sentTo ? (
              <>
                <p>Enter the code sent to {sentTo}.</p>
                <label>
                  Verification code
                  <input
                    autoFocus
                    required
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    pattern="[0-9]{8}"
                    maxLength={8}
                    value={code}
                    onChange={(e) =>
                      setCode(e.target.value.replace(/[^0-9]/g, ""))
                    }
                  />
                </label>
              </>
            ) : (
              <label>
                Email
                <input
                  required
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </label>
            )}
            <button
              className="primary"
              disabled={busy || Boolean(sentTo && code.length !== 8)}
            >
              {legacy ? "Sign in" : sentTo ? "Verify code" : "Send code"}
            </button>
            {sentTo ? (
              <>
                <button
                  type="button"
                  className="textlink"
                  disabled={busy}
                  onClick={() =>
                    void action(async () => {
                      setNotice("");
                      await sendCode(sentTo);
                      setNotice("A new code was sent.");
                    })
                  }
                >
                  Resend code
                </button>
                <button
                  type="button"
                  className="textlink"
                  disabled={busy}
                  onClick={resetCode}
                >
                  Use another email
                </button>
              </>
            ) : (
              <button
                type="button"
                className="textlink"
                disabled={busy}
                onClick={() => {
                  resetCode();
                  setPassword("");
                  setLegacy(!legacy);
                }}
              >
                {legacy
                  ? "Use a Logos account"
                  : "Use my existing pilot username"}
              </button>
            )}
          </form>
          <ReportPreview />
        </div>
      ) : section === "partners" ? (
        <AccountAgreements key={account.username} username={account.username} />
      ) : section === "privacy" ? (
        <div className="dashboard-grid">
          <ReportPreview />
          <section className="panel">
            <ShieldCheck className="accent" />
            <h2>Consent & access</h2>
            <p>
              You can cancel an invitation or end an agreement at any time. Your
              partner can decline or disconnect.
            </p>
            <Link className="textlink" href="/partners">
              Manage agreements →
            </Link>
          </section>
        </div>
      ) : section === "overview" ? (
        <>
          <section className="device-shortcut">
            <Smartphone size={21} />
            <div>
              <strong>Your devices</strong>
              <small>{account.devices.length} enrolled</small>
            </div>
            <Link href="/devices" className="textlink">
              Manage devices →
            </Link>
          </section>
          <AccountAgreements
            key={account.username}
            username={account.username}
          />
        </>
      ) : (
        <>
          <p>
            Sign in to Logos on your iPhone and it will appear here
            automatically.
          </p>
          <details>
            <summary>Connect an older or guest app</summary>
            <form
              className="panel account-form"
              onSubmit={(e) => {
                e.preventDefault();
                void action(async () => {
                  setEnrollment((await client.post("/devices", { name })).data);
                  await refresh();
                });
              }}
            >
              <h2>Enroll an iPhone</h2>
              <small>Signed in as {account.username}</small>
              <label>
                Device name
                <input
                  required
                  maxLength={80}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </label>
              <button disabled={busy} className="primary">
                Create pairing pass
              </button>
            </form>
            {enrollment &&
              account.devices.some(
                (d) => d.id === enrollment.id && d.state === "pending",
              ) && (
                <section className="panel account-form">
                  <h2>Pair on your iPhone</h2>
                  <p>
                    In Logos, open Protection → Dashboard connection. Paste this
                    pass before{" "}
                    {new Date(enrollment.expiresAt).toLocaleTimeString()}.
                  </p>
                  <input
                    aria-label="Pairing pass"
                    readOnly
                    value={
                      (process.env.NEXT_PUBLIC_PAIRING_ORIGIN ||
                        window.location.origin) +
                      "#" +
                      enrollment.code
                    }
                    onFocus={(e) => e.target.select()}
                  />
                  <small>
                    Single use. Your phone needs a trusted HTTPS address for
                    this dashboard. Localhost works in the iOS simulator.
                  </small>
                </section>
              )}
          </details>
          <section className="panel">
            <div className="panelhead">
              <h2>Enrolled devices</h2>
              <button
                className="textlink"
                disabled={busy}
                onClick={() => action(refresh)}
              >
                Refresh
              </button>
            </div>
            {account.devices.length === 0 ? (
              <p>No devices enrolled.</p>
            ) : (
              account.devices.map((d) => (
                <div key={d.id} className="device">
                  <div>
                    <strong>{d.name}</strong>
                    <small>
                      {d.state === "paired"
                        ? d.lastCheck
                          ? outcomes[d.lastCheck]
                          : "Connected · waiting for a safe check"
                        : d.state === "expired"
                          ? "Pairing pass expired"
                          : "Awaiting pairing"}
                      {d.checkedAt &&
                        " · " + new Date(d.checkedAt).toLocaleString()}
                    </small>
                  </div>
                  <button
                    className="textlink"
                    disabled={busy}
                    onClick={() =>
                      action(async () => {
                        await client.delete("/devices/" + d.id);
                        if (enrollment?.id === d.id) setEnrollment(null);
                        await refresh();
                      })
                    }
                  >
                    Disconnect
                  </button>
                </div>
              ))
            )}
          </section>
        </>
      )}
    </WorkspaceShell>
  );
}
