/**
 * Outbound SMS and email. Every message is written to `outbox` in the business transaction.
 * MESSAGING_MODE=outbox (default): rows are final as SENT and shown on the dev outbox page; nothing leaves the app.
 * MESSAGING_MODE=live: rows are QUEUED and the tick delivers them (Unifonic SMS, SMTP email).
 */
import { eq, inArray, sql } from "drizzle-orm";
import nodemailer from "nodemailer";
import { outbox } from "../schema";
import type { Db } from "../index";
import type { Executor } from "./audit";

export type MessageChannel = "SMS" | "EMAIL";
export interface OutboundMessage {
  channel: MessageChannel;
  recipient: string;
  subject?: string;
  body: string;
}

const isLive = () => process.env.MESSAGING_MODE === "live";

export async function queueMessages(tx: Executor, messages: OutboundMessage[], now: Date): Promise<void> {
  if (messages.length === 0) return;
  const live = isLive();
  await tx.insert(outbox).values(
    messages.map((m) => ({
      channel: m.channel,
      recipient: m.recipient,
      subject: m.subject ?? null,
      body: m.body,
      status: live ? ("QUEUED" as const) : ("SENT" as const),
      createdAt: now,
      sentAt: live ? null : now,
    })),
  );
}

export interface MessageProvider {
  send(message: OutboundMessage): Promise<void>;
}

/** Unifonic REST SMS API. */
class UnifonicSms implements MessageProvider {
  constructor(
    private appSid: string,
    private senderId: string,
  ) {}
  async send(m: OutboundMessage): Promise<void> {
    const res = await fetch("https://el.cloud.unifonic.com/rest/SMS/messages", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ AppSid: this.appSid, SenderID: this.senderId, Recipient: m.recipient.replace(/^\+/, ""), Body: m.body }),
    });
    const json = (await res.json().catch(() => null)) as { success?: boolean | string; message?: string } | null;
    if (!res.ok || !json || String(json.success) !== "true") throw new Error(`Unifonic: ${json?.message ?? res.status}`);
  }
}

class SmtpEmail implements MessageProvider {
  private transport;
  constructor(
    url: string,
    private from: string,
  ) {
    this.transport = nodemailer.createTransport(url);
  }
  async send(m: OutboundMessage): Promise<void> {
    await this.transport.sendMail({ from: this.from, to: m.recipient, subject: m.subject ?? "TagMyCredit", text: m.body });
  }
}

function liveProviders(): Record<MessageChannel, MessageProvider> {
  const { UNIFONIC_APP_SID, UNIFONIC_SENDER_ID, SMTP_URL, MAIL_FROM } = process.env;
  if (!UNIFONIC_APP_SID || !UNIFONIC_SENDER_ID || !SMTP_URL) throw new Error("MESSAGING_MODE=live needs UNIFONIC_APP_SID, UNIFONIC_SENDER_ID and SMTP_URL");
  return {
    SMS: new UnifonicSms(UNIFONIC_APP_SID, UNIFONIC_SENDER_ID),
    EMAIL: new SmtpEmail(SMTP_URL, MAIL_FROM ?? "TagMyCredit <no-reply@tagmycredit.com>"),
  };
}

const DELIVERY_BATCH = 50;

/** Live mode: send up to 50 QUEUED messages. Returns how many were sent. No-op in outbox mode. */
export async function deliverQueued(db: Db, now: Date): Promise<number> {
  if (!isLive()) return 0;
  const providers = liveProviders();
  return db.transaction(async (tx) => {
    const batch = await tx
      .select()
      .from(outbox)
      .where(eq(outbox.status, "QUEUED"))
      .orderBy(outbox.createdAt)
      .limit(DELIVERY_BATCH)
      .for("update", { skipLocked: true });
    const results = await Promise.allSettled(
      batch.map((m) => providers[m.channel].send({ channel: m.channel, recipient: m.recipient, subject: m.subject ?? undefined, body: m.body })),
    );
    const sent = batch.filter((_, i) => results[i]!.status === "fulfilled").map((m) => m.id);
    const failed = batch.flatMap((m, i) => {
      const r = results[i]!;
      return r.status === "rejected" ? [{ id: m.id, error: String(r.reason).slice(0, 500) }] : [];
    });
    if (sent.length) await tx.update(outbox).set({ status: "SENT", sentAt: now, error: null }).where(inArray(outbox.id, sent));
    if (failed.length) {
      const values = sql.join(failed.map((f) => sql`(${f.id}::uuid, ${f.error})`), sql`, `);
      await tx.execute(sql`update outbox set status = 'FAILED', error = v.error from (values ${values}) as v(id, error) where outbox.id = v.id`);
    }
    return sent.length;
  });
}
