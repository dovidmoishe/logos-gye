"use client";
import { useCallback, useEffect, useState } from "react";
import axios from "axios";
import Link from "next/link";
import { accountAPI as client, logosAuth } from "../../lib/account";
import { AccountAgreements } from "./agreements";

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
export default function AccountPage() {
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
  const refresh = useCallback(async () => {
    try {
      setAccount((await client.get<Account>("")).data);
    } catch (e) {
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
          : e instanceof Error ? e.message : "Request failed. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  function resetCode() {
    setCode("");
    setSentTo(null);
    setNotice("");
    setError("");
  }
  async function sendCode(address: string) {
    const { error } = await logosAuth.signInWithOtp({ email: address });
    if (error) throw error;
    setSentTo(address);
    setCode("");
  }
  useEffect(() => {
    refresh()
      .catch(() => setError("Unable to load your account."))
      .finally(() => setLoading(false));
  }, [refresh]);
  return (
    <main className="content" style={{ maxWidth: 720 }}>
      <Link href="/devices" className="textlink">
        ← Demo workspace
      </Link>
      <div className="heading mt-6">
        <h1>{account ? "My devices" : "Device account"}</h1>
        {account && (
          <button
            className="secondary"
            disabled={busy}
            onClick={() =>
              action(async () => {
                await client.delete("/session");
                const { error } = await logosAuth.signOut({scope: "local"});
                if (error && error.name !== "AuthSessionMissingError") throw error;
                setAccount(null);
                setEnrollment(null);
              })
            }
          >
            Sign out
          </button>
        )}
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {loading ? (
        <p>Loading…</p>
      ) : !account ? (
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
                const { error } = await logosAuth.verifyOtp({ email: sentTo, token: code, type: "email" });
                if (error) throw error;
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
          <h2>{legacy ? "Pilot sign-in" : sentTo ? "Check your email" : "Continue with email"}</h2>
          {notice && <p role="status">{notice}</p>}
          {legacy ? (
            <>
              <label>Pilot username
                <input required autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} />
              </label>
              <label>Password
                <input required type="password" autoComplete="current-password" maxLength={128}
                  value={password} onChange={(e) => setPassword(e.target.value)} />
              </label>
            </>
          ) : sentTo ? (
            <>
              <p>Enter the code sent to {sentTo}.</p>
              <label>Verification code
                <input autoFocus required type="text" inputMode="numeric" autoComplete="one-time-code"
                  pattern="[0-9]{6,10}" maxLength={10} value={code}
                  onChange={(e) => setCode(e.target.value.replace(/[^0-9]/g, ""))} />
              </label>
            </>
          ) : (
            <label>Email
              <input required type="email" autoComplete="email" value={email}
                onChange={(e) => setEmail(e.target.value)} />
            </label>
          )}
          <button className="primary" disabled={busy || Boolean(sentTo && code.length < 6)}>
            {legacy ? "Sign in" : sentTo ? "Verify code" : "Send code"}
          </button>
          {sentTo ? (
            <>
              <button type="button" className="textlink" disabled={busy} onClick={() => void action(async () => {
                setNotice("");
                await sendCode(sentTo);
                setNotice("A new code was sent.");
              })}>Resend code</button>
              <button type="button" className="textlink" disabled={busy} onClick={resetCode}>Use another email</button>
            </>
          ) : (
            <button type="button" className="textlink" disabled={busy} onClick={() => {
              resetCode();
              setPassword("");
              setLegacy(!legacy);
            }}>{legacy ? "Use a Logos account" : "Use my existing pilot username"}</button>
          )}
        </form>
      ) : (
        <>
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
                  value={window.location.origin + "#" + enrollment.code}
                  onFocus={(e) => e.target.select()}
                />
                <small>
                  Single use. Your phone needs a trusted HTTPS address for this
                  dashboard. Localhost works in the iOS simulator.
                </small>
              </section>
            )}
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
                          : "Paired · waiting for a safe check"
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
          <AccountAgreements
            key={account.username}
            username={account.username}
          />
        </>
      )}
    </main>
  );
}
