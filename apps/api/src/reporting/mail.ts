import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  BeforeApplicationShutdown,
} from "@nestjs/common";
import { join } from "node:path";
import { access } from "node:fs/promises";
import { alertCooldown } from "./live";
import { importWeek } from "./gateway";
import nodemailer from "nodemailer";
import { Database } from "../db/connection";
import { day, monday, reportScope, week } from "./week";

export function isMailbox(address: string) {
  return (
    address.length <= 254 &&
    /^[a-z0-9_+.'%-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+$/i.test(address)
  );
}

@Injectable()
export class PartnerReportWorker
  implements OnApplicationBootstrap, BeforeApplicationShutdown
{
  constructor(private readonly database: Database) {}
  private timer?: NodeJS.Timeout;
  private running?: Promise<void>;
  private transport?: ReturnType<typeof nodemailer.createTransport>;
  private link = "";
  private nextCleanup = 0;
  private nextImport = 0;

  onApplicationBootstrap() {
    if (process.env.PARTNER_SMTP_URL) {
      this.link = new URL(
        "/partners",
        process.env.PARTNER_DASHBOARD_ORIGIN,
      ).href;
      if (!isMailbox(process.env.PARTNER_MAIL_FROM ?? ""))
        throw new Error("Configure PARTNER_MAIL_FROM");
      const smtp = new URL(process.env.PARTNER_SMTP_URL);
      if (!["smtp:", "smtps:"].includes(smtp.protocol))
        throw new Error("Configure an SMTP transport");
      smtp.searchParams.set("connectionTimeout", "10000");
      smtp.searchParams.set("greetingTimeout", "10000");
      smtp.searchParams.set("socketTimeout", "15000");
      this.transport = nodemailer.createTransport(smtp.href);
    }
    const tick = () => {
      if (!this.running)
        this.running = this.drain()
          .catch(() =>
            Logger.warn(
              "Partner mail worker will retry.",
              "PartnerReportWorker",
            ),
          )
          .finally(() => {
            this.running = undefined;
          });
    };
    this.timer = setInterval(tick, 3000);
    this.timer.unref();
    tick();
  }
  async beforeApplicationShutdown() {
    clearInterval(this.timer);
    await this.running;
    this.transport?.close();
  }
  private async drain() {
    const now = Date.now();
    if (now >= this.nextCleanup) {
      await this.database.pool.query(
        "delete from agreement_weekly_reports where week_start + $1::bigint <= $2",
        [week, now - 30 * day],
      );
      await this.database.pool.query(
        "delete from partner_mail j using account_agreements a where a.id=j.agreement_id and ((j.kind='invitation' and (a.status<>'Pending' or a.expires_at <= $1)) or (j.kind='weekly' and (a.status<>'Connected' or j.period < $2)) or (j.kind='check-in' and j.period <= $3))",
        [now, monday(now) - week, now - alertCooldown],
      );
      await this.database.pool.query(
        "delete from agreement_live_blocks where occurred_at < $1",
        [monday(now)],
      );
      this.nextCleanup = now + 3600000;
    }
    if (process.env.PARTNER_EXPORT_DIR && now >= this.nextImport) {
      this.nextImport = now + 60000;
      await this.importReadyWeeks(
        process.env.PARTNER_EXPORT_DIR,
        monday(now) - week,
      );
    }
    if (!this.transport) return;
    for (let i = 0; i < 25; i++) {
      if (!(await this.deliverOne())) return;
    }
  }
  private async importReadyWeeks(root: string, start: number) {
    const { rows } = await this.database.pool.query(
      `
      select a.id from account_agreements a join agreement_reporting_sources s on s.agreement_id=a.id
      where a.status='Connected' and a.scope=$1 and a.accepted_at <= $2 and s.registered_at <= $2
        and not exists (select 1 from agreement_weekly_reports r where r.agreement_id=a.id and r.week_start=$2)`,
      [reportScope, start],
    );
    const date = new Date(start).toISOString().slice(0, 10);
    for (const { id } of rows) {
      const directory = join(root, id, date);
      try {
        await access(join(directory, "manifest.json"));
        await importWeek(this.database, id, directory);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT")
          Logger.warn(
            "A weekly export could not be published. Check its coverage and manifest.",
            "PartnerReportWorker",
          );
      }
    }
  }
  private async deliverOne() {
    const client = await this.database.pool.connect();
    try {
      await client.query("begin");
      const now = Date.now();
      const {
        rows: [job],
      } = await client.query(
        `
        select j.agreement_id, j.kind, j.period, j.attempts, a.owner_alerts_at, a.partner_alerts_at,
               exists(select 1 from agreement_reporting_sources s where s.agreement_id=a.id and s.registered_at<=j.period) as bound, a.invite_address, a.status, a.scope, a.expires_at,
               exists(select 1 from agreement_weekly_reports r where r.agreement_id=j.agreement_id and r.week_start=j.period) as ready
        from partner_mail j join account_agreements a on a.id=j.agreement_id
        where j.next_attempt <= $1 order by j.next_attempt limit 1 for update of a,j skip locked`,
        [now],
      );
      if (!job) {
        await client.query("commit");
        return false;
      }
      const period = Number(job.period);
      const invitation = job.kind === "invitation";
      const checkIn = job.kind === "check-in";
      const eligible =
        job.scope === reportScope &&
        isMailbox(job.invite_address) &&
        (invitation
          ? job.status === "Pending" && Number(job.expires_at) > now
          : checkIn
            ? job.status === "Connected" &&
              job.bound &&
              job.owner_alerts_at != null &&
              job.partner_alerts_at != null &&
              Number(job.owner_alerts_at) <= period &&
              Number(job.partner_alerts_at) <= period &&
              now - period < alertCooldown
            : job.kind === "weekly" &&
              job.status === "Connected" &&
              job.ready &&
              period === monday(now) - week);
      const key = [job.agreement_id, period, job.kind];
      if (eligible) {
        try {
          await this.transport!.sendMail({
            from: process.env.PARTNER_MAIL_FROM,
            to: { name: "", address: job.invite_address },
            messageId: `<${job.agreement_id}.${period}${checkIn ? ".check-in" : ""}@logos.notifications>`,
            subject: invitation
              ? "You have a Logos invitation"
              : checkIn
                ? "Could you check in?"
                : "Your Logos weekly report is ready",
            text:
              (invitation
                ? "Sign in with this email address to review your invitation."
                : checkIn
                  ? "You and your Logos partner asked for a heads-up after a filter block. A quick, kind message might help. Sign in to see your agreement."
                  : "Sign in to view your weekly report.") +
              "\n\n" +
              this.link,
          });
        } catch {
          const delay = Math.min(
            3600000,
            30000 * 2 ** Math.min(job.attempts, 7),
          );
          await client.query(
            "update partner_mail set attempts=attempts+1, next_attempt=$4 where agreement_id=$1 and period=$2 and kind=$3",
            [...key, now + delay],
          );
          await client.query("commit");
          Logger.warn(
            "Partner email deferred after an SMTP failure.",
            "PartnerReportWorker",
          );
          return true;
        }
      }
      await client.query(
        "delete from partner_mail where agreement_id=$1 and period=$2 and kind=$3",
        key,
      );
      await client.query("commit");
      return true;
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }
}
