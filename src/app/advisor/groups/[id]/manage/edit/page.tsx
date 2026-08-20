import { redirect } from "next/navigation";

import { AppBar } from "@/components/AppBar";
import { AppShell } from "@/components/AppShell";
import { registrationGate } from "@/domain/registration-gate";
import { advisorGroupDetail } from "@/server/actions/group";
import { currentIdentity } from "@/server/identity";
import { EditGroupForm } from "./EditGroupForm";

export const dynamic = "force-dynamic";

export default async function EditGroupPage({
  params,
}: PageProps<"/advisor/groups/[id]/manage/edit">) {
  const { id } = await params;

  const identity = await currentIdentity();
  if (!identity?.advisor) redirect("/");

  const gate = registrationGate(identity.advisor);
  if (!gate.allowed) redirect("/advisor/status");

  const detail = await advisorGroupDetail(id);

  return (
    <AppShell>
      <AppBar backHref={`/advisor/groups/${id}/manage`} />

      <div className="flex flex-1 flex-col px-5 pb-[calc(29px+env(safe-area-inset-bottom))]">
        <h1 className="mt-[24px] text-[20px] font-semibold text-ink">Group info</h1>

        <div className="mt-6">
          {detail.ok ? (
            <EditGroupForm group={detail.data.group} />
          ) : (
            <p role="alert" className="text-[14px] text-danger-ink">
              {detail.error}
            </p>
          )}
        </div>
      </div>
    </AppShell>
  );
}
