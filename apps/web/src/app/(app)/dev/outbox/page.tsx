import { getSession, listOutbox } from "@/server/queries";
import { getT } from "@/i18n/server";
import { DateText, EmptyState, PageHead, StatusPill } from "@/components/ui/Basics";
import { ResponsiveTable } from "@/components/mobile";
import { CopyButton } from "@/components/ui/CopyButton";

export default async function OutboxPage() {
  const [session, t] = await Promise.all([getSession(), getT()]);
  if (!session?.demoMode) return <EmptyState title={t("outbox.disabled")} />;
  const rows = await listOutbox();
  return (
    <>
      <PageHead title={t("outbox.title")} sub={t("outbox.sub")} />
      <ResponsiveTable caption={t("outbox.title")} rows={rows} rowKey={(r) => r.id} empty={<EmptyState title={t("outbox.emptyTitle")} body={t("outbox.emptyBody")} />}
        columns={[
          { key: "w", header: t("outbox.colWhen"), cell: (r) => <DateText iso={r.createdAt} locale={t.locale} time /> },
          { key: "c", header: t("outbox.colChannel"), cell: (r) => <StatusPill tone={r.channel === "SMS" ? "amber" : "info"} dot={false}>{r.channel}</StatusPill> },
          { key: "to", header: t("outbox.colTo"), primary: true, cell: (r) => <span className="ltr mono small">{r.recipient}</span> },
          { key: "m", header: t("outbox.colMessage"), card: "full", cell: (r) => {
            const code = r.channel === "SMS" ? /\b(\d{6})\b/.exec(r.body)?.[1] : undefined;
            return <div className="stack" style={{ gap: 6 }}>{r.subject && <b>{r.subject}</b>}<span className="msg-body">{r.body}</span>
              {code && <CopyButton value={code} label={t("outbox.copyCode", { code })} copiedLabel={t("common.copied")}><span className="otp-code">{code}</span></CopyButton>}</div>;
          } },
          { key: "s", header: t("outbox.colStatus"), cell: (r) => <StatusPill tone={r.status === "SENT" ? "ok" : r.status === "FAILED" ? "bad" : "neutral"}>{r.status}</StatusPill> },
        ]} />
    </>
  );
}
