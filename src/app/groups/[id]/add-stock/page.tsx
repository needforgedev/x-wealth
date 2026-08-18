import { AddToPortfolioSheet } from "@/components/AddToPortfolioSheet";
import { AppShell } from "@/components/AppShell";
import { GroupTopBar } from "@/components/chat/GroupTopBar";
import { MessageHeader } from "@/components/chat/MessageHeader";
import { SignalMessageCard } from "@/components/chat/SignalMessageCard";
import { GROUP, SAMPLE_SIGNAL } from "@/lib/conversation";

/** Group chat with the Add to Portfolio sheet raised over it (17:4495). */
export default async function AddStockFromChatPage({
  params,
}: PageProps<"/groups/[id]/add-stock">) {
  const { id } = await params;

  return (
    <AppShell className="bg-surface-alt">
      <GroupTopBar
        name={GROUP.name}
        members={GROUP.members}
        tint={GROUP.tint}
        backHref={`/groups/${id}`}
        href={`/groups/${id}/profile`}
      />

      <div className="flex flex-1 flex-col px-[24px] pt-[31px] pb-[17px]">
        <article>
          <MessageHeader author="Snehish Yadav" time="12:23 PM" isAdmin />
          <div className="mt-[14px]">
            <SignalMessageCard signal={SAMPLE_SIGNAL} />
          </div>
        </article>
      </div>

      <AddToPortfolioSheet onSubmitHref={`/groups/${id}`} />
    </AppShell>
  );
}
