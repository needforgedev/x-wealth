import { redirect } from "next/navigation";

import { AppBar } from "@/components/AppBar";
import { AppShell } from "@/components/AppShell";
import { registrationGate } from "@/domain/registration-gate";
import { callToAmend } from "@/server/actions/signal";
import { currentIdentity } from "@/server/identity";
import { AmendForm } from "./AmendForm";

export const dynamic = "force-dynamic";

export default async function AmendCallPage({
  params,
}: PageProps<"/advisor/groups/[id]/manage/calls/[signalId]/amend">) {
  const { id, signalId } = await params;

  const identity = await currentIdentity();
  if (!identity?.advisor) redirect("/");

  const gate = registrationGate(identity.advisor);
  if (!gate.allowed) redirect("/advisor/status");

  const result = await callToAmend(signalId);

  return (
    <AppShell>
      <AppBar backHref={`/advisor/groups/${id}/manage`} />

      <div className="flex flex-1 flex-col px-5 pb-[calc(29px+env(safe-area-inset-bottom))]">
        <h1 className="mt-[24px] text-[20px] font-semibold text-ink">Amend call</h1>
        <p className="mt-[4px] text-[14px] text-muted">
          Published{" "}
          {result.ok
            ? result.data.publishedAt.toLocaleString("en-IN", {
                day: "numeric",
                month: "short",
                hour: "numeric",
                minute: "2-digit",
              })
            : "—"}
          .
        </p>

        <div className="mt-6">
          {result.ok ? (
            <AmendForm call={result.data} />
          ) : (
            <p role="alert" className="text-[14px] text-danger-ink">
              {result.error}
            </p>
          )}
        </div>
      </div>
    </AppShell>
  );
}
