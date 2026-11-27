"use client";
import { useCallback, useEffect, useState } from "react";
import axios from "axios";
import { accountAPI as api } from "../../lib/account";
const scope = "weekly-blocked-counts-v1";
type Agreement = {
  id: string;
  owner: string;
  recipient: string;
  status: "Pending" | "Connected" | "Expired" | "Revoked" | "Declined";
};

export function AccountAgreements({ username }: { username: string }) {
  const [rows, setRows] = useState<Agreement[]>([]),
    [recipient, setRecipient] = useState(""),
    [consent, setConsent] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const run = useCallback(
    async (call: () => Promise<{ data: Agreement[] }>) => {
      setBusy(true);
      setError("");
      try {
        setRows((await call()).data);
        return true;
      } catch (e) {
        setError(
          axios.isAxiosError(e) && typeof e.response?.data?.message === "string"
            ? e.response.data.message
            : "Unable to load agreements.",
        );
        return false;
      } finally {
        setBusy(false);
      }
    },
    [],
  );
  useEffect(() => {
    void run(() => api.get("/agreements"));
  }, [run]);
  return (
    <section className="panel account-form">
      <div className="panelhead">
        <h2>Partner agreements</h2>
        <button
          disabled={busy}
          className="textlink"
          onClick={() => run(() => api.get("/agreements"))}
        >
          Refresh
        </button>
      </div>
      <p>
        Weekly grouped counts of blocked adult-category DNS requests. Domain
        names, check-ins and coverage gaps stay private. Report delivery is
        pending.
      </p>
      <form
        className="account-form"
        onSubmit={async (e) => {
          e.preventDefault();
          if (await run(() => api.post("/agreements", { username: recipient, scope }))) {
            setRecipient("");
            setConsent(false);
          }
        }}
      >
        <label>
          Partner email or pilot username
          <input
            required
            maxLength={320}
            value={recipient}
            onChange={(e) => setRecipient(e.target.value)}
          />
        </label>
        <label className="consent">
          <input
            type="checkbox"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
          />
          I agree to this scope for this recipient.
        </label>
        <button className="primary" disabled={busy || !consent}>
          Invite to review agreement
        </button>
      </form>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {rows.map((a) => (
        <div className="device flex-wrap" key={a.id}>
          <div>
            <strong>
              {a.owner === username ? "To " + a.recipient : "From " + a.owner}
            </strong>
            <small>{a.status}</small>
          </div>
          {a.status === "Pending" && a.recipient === username && (
            <>
              <button
                disabled={busy}
                className="textlink"
                onClick={() =>
                  run(() => api.patch("/agreements/" + a.id, { action: "accept", scope }))
                }
              >
                Accept weekly scope
              </button>
              <button
                disabled={busy}
                className="textlink"
                onClick={() =>
                  run(() => api.patch("/agreements/" + a.id, { action: "decline" }))
                }
              >
                Decline
              </button>
            </>
          )}
          {(a.status === "Connected" ||
            (a.status === "Pending" && a.owner === username)) && (
            <button
              disabled={busy}
              className="textlink"
              onClick={() =>
                run(() => api.patch("/agreements/" + a.id, { action: "revoke" }))
              }
            >
              Revoke agreement
            </button>
          )}
        </div>
      ))}
    </section>
  );
}
