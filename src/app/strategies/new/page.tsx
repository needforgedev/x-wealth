import Link from "next/link";
import { redirect } from "next/navigation";

import { AppBar } from "@/components/AppBar";
import { AppShell } from "@/components/AppShell";
import { hasAcknowledgedRisk, nextPath } from "@/domain/onboarding";
import { loadCatalogue } from "@/server/market-data/catalogue";
import { currentIdentity } from "@/server/identity";
import { NewStrategyForm } from "./NewStrategyForm";

export const dynamic = "force-dynamic";

export default async function NewStrategyPage() {
  const identity = await currentIdentity();
  if (!identity?.user) redirect("/");
  if (!hasAcknowledgedRisk(identity.user)) redirect(nextPath(identity.user));

  // No user id needed here — this page only renders the form. Ownership is
  // stamped by `createStrategy`, which resolves the caller itself rather than
  // trusting an id sent from the client.

  // Fetched here rather than from the client: a Server Component read is one
  // less roundtrip, and the same list is what the action validates against.
  const catalogue = await loadCatalogue();

  return (
    <AppShell>
      <AppBar backHref="/home" />
      <div className="flex flex-1 flex-col px-5 pb-[calc(29px+env(safe-area-inset-bottom))]">
        <h1 className="mt-[24px] text-[20px] font-semibold text-ink">New strategy</h1>
        <p className="mt-[6px] text-[14px] text-muted">
          Rules, then the hypothesis you intend to test. Both are recorded before any result
          exists — that ordering is the point.
        </p>
        <Link
          href="/strategies/new/chat"
          className="mt-5 flex flex-col rounded-[8px] border border-brand px-4 py-4"
        >
          <span className="text-[15px] font-semibold text-ink">Describe it in plain English</span>
          <span className="mt-[2px] text-[13px] text-muted">
            The compiler turns a sentence into the same six components this form asks for, and
            asks about anything you leave out.
          </span>
        </Link>

        <p className="mt-6 text-[13px] font-medium uppercase text-muted">Or fill it in yourself</p>

        <div className="mt-3">
          <NewStrategyForm catalogue={catalogue} />
        </div>
      </div>
    </AppShell>
  );
}
