"use client";
import { useCallback, useEffect, useState } from "react";
import axios from "axios";
import {
  Check,
  ClipboardList,
  Mail,
  Plus,
  RefreshCw,
  UsersRound,
  X,
} from "lucide-react";
import { accountAPI as api } from "../../lib/account";

const scope = "weekly-blocked-counts-v1";
type Agreement = {
  id: string;
  owner: string;
  recipient: string;
  expiresAt: number;
  createdAt: number;
  status: "Pending" | "Connected" | "Expired" | "Revoked" | "Declined";
};

type WeeklyReport = {
  status: "awaiting_first_week" | "available" | "unavailable";
  weekStart: number;
  weekEnd: number;
  groupedRequests: number | null;
};
function WeekResult({ report }: { report: WeeklyReport }) {
  const date = (n: number) =>
    new Date(n).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    });
  return (
    <div className="sample" role="status">
      <strong>
        {date(report.weekStart)} – {date(report.weekEnd - 1)} · UTC
      </strong>
      <p>
        {report.status === "awaiting_first_week"
          ? "This is the first full week covered by your agreement."
          : report.status === "unavailable"
            ? "No report data is available for this week."
            : "Grouped blocked requests: " + report.groupedRequests}
      </p>
    </div>
  );
}
export function ReportPreview() {
  return (
    <section className="panel report-panel">
      <div className="panelhead">
        <span className="icon-box">
          <ClipboardList size={21} />
        </span>
        <span className="chip">Preview</span>
      </div>
      <h2>Weekly report</h2>
      <p>
        Partners agree to see a weekly count of grouped, blocked adult-category
        DNS requests.
      </p>
      <div className="report-count">
        <span>Grouped requests</span>
        <strong>—</strong>
      </div>
      <small>
        Event data is unavailable in the pilot. A DNS request can come from
        background activity.
      </small>
      <div className="scope-note">
        Domain names, coverage gaps, reading history and check-ins stay private.
      </div>
    </section>
  );
}

export function AccountAgreements({ username }: { username: string }) {
  const [opened, setOpened] = useState<{
    id: string;
    report: WeeklyReport;
  } | null>(null);
  const [rows, setRows] = useState<Agreement[]>([]);
  const [recipient, setRecipient] = useState("");
  const [consent, setConsent] = useState(false);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const run = useCallback(
    async (call: () => Promise<{ data: Agreement[] }>) => {
      setBusy(true);
      setError("");
      setNotice("");
      setOpened(null);
      try {
        setRows((await call()).data);
        setLoaded(true);
        return true;
      } catch (e) {
        setError(
          axios.isAxiosError(e) && typeof e.response?.data?.message === "string"
            ? e.response.data.message
            : "Unable to load agreements. Please try again.",
        );
        return false;
      } finally {
        setBusy(false);
      }
    },
    [],
  );
  const load = useCallback(() => run(() => api.get("/agreements")), [run]);
  useEffect(() => {
    void load();
  }, [load]);
  async function respond(id: string, action: "accept" | "decline" | "revoke") {
    if (await run(() => api.patch("/agreements/" + id, { action, scope }))) {
      setNotice(
        action === "accept"
          ? "Weekly scope accepted."
          : action === "decline"
            ? "Invitation declined."
            : "Access revoked.",
      );
    }
  }
  async function openReport(id: string) {
    setOpened(null);
    setBusy(true);
    setError("");
    try {
      setOpened({
        id,
        report: (await api.get<WeeklyReport>("/agreements/" + id + "/report"))
          .data,
      });
    } catch {
      setError("Report unavailable. Refresh your agreements to check access.");
    } finally {
      setBusy(false);
    }
  }
  function agreement(row: Agreement) {
    const outgoing = row.owner === username;
    return (
      <li className="agreement" key={row.id}>
        <div className="person-line">
          <span className="icon-box">
            {row.status === "Pending" ? (
              <Mail size={18} />
            ) : (
              <UsersRound size={18} />
            )}
          </span>
          <div>
            <strong>{outgoing ? row.recipient : row.owner}</strong>
            <small>
              {outgoing
                ? "Your accountability partner"
                : "You’re their accountability partner"}
            </small>
          </div>
          <span className="chip" data-status={row.status}>
            {row.status}
          </span>
        </div>
        <small className="agreement-detail">
          {row.status === "Pending"
            ? "Invitation expires " +
              new Date(row.expiresAt).toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
              })
            : "Weekly grouped counts"}
        </small>
        <div className="row-actions">
          {row.status === "Pending" && !outgoing && (
            <>
              <button
                className="primary"
                disabled={busy}
                onClick={() => respond(row.id, "accept")}
              >
                <Check size={15} /> Accept weekly scope
              </button>
              <button
                className="secondary"
                disabled={busy}
                onClick={() => respond(row.id, "decline")}
              >
                Decline
              </button>
            </>
          )}
          {row.status === "Connected" && (
            <button
              disabled={busy}
              className="secondary"
              onClick={() => openReport(row.id)}
            >
              View weekly report
            </button>
          )}
          {(row.status === "Connected" ||
            (outgoing && row.status === "Pending")) && (
            <button
              className="textlink"
              disabled={busy}
              onClick={() => respond(row.id, "revoke")}
            >
              {row.status === "Pending" ? "Cancel invitation" : "Revoke access"}
            </button>
          )}
        </div>
        {opened?.id === row.id && <WeekResult report={opened.report} />}
      </li>
    );
  }
  const current = rows.filter(
    (a) => a.status === "Connected" || a.status === "Pending",
  );
  const past = rows.filter(
    (a) => a.status !== "Connected" && a.status !== "Pending",
  );
  return (
    <div className="dashboard-grid">
      <div>
        <section className="panel">
          <div className="panelhead">
            <h2>Your partners</h2>
            <button
              className="icon-button"
              aria-label="Refresh agreements"
              disabled={busy}
              onClick={load}
            >
              <RefreshCw size={16} />
            </button>
          </div>
          {loaded && (
            <small>
              {current.filter((a) => a.status === "Connected").length} connected
              · {current.filter((a) => a.status === "Pending").length} pending
            </small>
          )}
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          {notice && (
            <p role="status" className="notice">
              {notice}
            </p>
          )}
          {!loaded && busy && <p role="status">Loading agreements…</p>}
          {loaded &&
            (current.length ? (
              <ul>{current.map(agreement)}</ul>
            ) : (
              <div className="quiet-empty">
                <UsersRound size={24} />
                <h3>No partners yet</h3>
                <small>Choose someone you trust to check in with.</small>
              </div>
            ))}
          {!adding && (
            <button
              className="primary"
              disabled={busy}
              onClick={() => {
                setAdding(true);
                setNotice("");
              }}
            >
              <Plus size={16} /> Add partner
            </button>
          )}
          {adding && (
            <form
              className="account-form invite-form"
              onSubmit={async (e) => {
                e.preventDefault();
                if (!consent || busy) return;
                if (
                  await run(() =>
                    api.post("/agreements", {
                      username: recipient.trim(),
                      scope,
                    }),
                  )
                ) {
                  setAdding(false);
                  setConsent(false);
                  setRecipient("");
                  setNotice(
                    "Invitation ready. Your partner can sign in to Logos to respond.",
                  );
                }
              }}
            >
              <div className="panelhead">
                <h3>Invite a partner</h3>
                <button
                  type="button"
                  className="icon-button"
                  disabled={busy}
                  aria-label="Close invitation"
                  onClick={() => {
                    setAdding(false);
                    setConsent(false);
                    setRecipient("");
                  }}
                >
                  <X size={16} />
                </button>
              </div>
              <label>
                Partner email or pilot username
                <input
                  autoFocus
                  required
                  maxLength={254}
                  value={recipient}
                  onChange={(e) => {
                    setRecipient(e.target.value);
                    setConsent(false);
                  }}
                />
              </label>
              <small>
                The invitation appears in their Logos account for seven days.
                Let them know where to find it.
              </small>
              <label className="consent">
                <input
                  type="checkbox"
                  checked={consent}
                  onChange={(e) => setConsent(e.target.checked)}
                />
                I agree to share weekly grouped counts with this partner once
                they accept.
              </label>
              <button
                className="primary"
                disabled={busy || !consent || !recipient.trim()}
              >
                Create invitation
              </button>
            </form>
          )}
        </section>
        {past.length > 0 && (
          <details className="panel">
            <summary>Past agreements ({past.length})</summary>
            <ul>{past.map(agreement)}</ul>
          </details>
        )}
      </div>
      <ReportPreview />
    </div>
  );
}
