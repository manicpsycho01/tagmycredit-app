"use client";
import { useRouter } from "next/navigation";
import { LookupForm } from "@/components/lines/LookupForm";
import { useT } from "@/i18n/client";

export function CheckLookup({ q }: { q?: string }) {
  const t = useT();
  const router = useRouter();
  return <LookupForm label={t("check.lookupLabel")} cta={t("check.check")} defaultValue={q} onFound={(r) => router.push(`/check/${r.company.id}`)} />;
}
