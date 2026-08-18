import { AppShell } from "@/components/AppShell";
import { Composer } from "@/components/chat/Composer";
import { GroupTopBar } from "@/components/chat/GroupTopBar";
import { MessageHeader } from "@/components/chat/MessageHeader";
import { SignalMessageCard } from "@/components/chat/SignalMessageCard";
import { GROUP, SAMPLE_SIGNAL, WELCOME_TEXT, WELCOME_TEXT_SHORT } from "@/lib/conversation";

/**
 * Alpha's group conversation. The file draws it twice — once with a white
 * header and a brand-filled outgoing bubble, once with a brand header and a
 * lavender bubble — so the treatment is a prop rather than two screens.
 */
export function AlphaChatBody({ theme = "light" }: { theme?: "light" | "tinted" }) {
  const isTinted = theme === "tinted";

  return (
    <AppShell className="bg-surface-alt">
      <GroupTopBar
        name={GROUP.name}
        members={GROUP.members}
        tint={GROUP.tint}
        tone={isTinted ? "brand" : "light"}
        backHref="/alpha/chats"
      />

      <div className="flex flex-1 flex-col gap-[24px] px-[24px] pt-[31px] pb-[17px]">
        <article>
          <MessageHeader author="Snehish Yadav" time="12:23 PM" isAdmin />
          <p className="mt-[14px] rounded-[12px] bg-surface px-[18px] py-[16px] text-[14px] text-[#3c3f49] shadow-[0_4px_9px_0_rgb(0_0_0/0.04)]">
            {WELCOME_TEXT}
          </p>
        </article>

        <article className="flex flex-col items-end">
          <p
            className={`w-full rounded-[12px] px-[18px] py-[16px] text-[14px] ${
              isTinted ? "bg-bubble-alt text-bubble-alt-ink" : "bg-brand text-white"
            }`}
          >
            {WELCOME_TEXT_SHORT}
          </p>
          <span
            className={`mt-[4px] text-[12px] font-semibold ${
              isTinted ? "text-black/[0.38]" : "text-ink/[0.38]"
            }`}
          >
            12:23 PM
          </span>
        </article>

        <article>
          <MessageHeader author="Snehish Yadav" time="12:23 PM" isAdmin />
          <div className="mt-[14px]">
            {/* The Alpha page draws no thread screen, so Thread renders inert. */}
            <SignalMessageCard signal={SAMPLE_SIGNAL} />
          </div>
        </article>

        <article>
          <MessageHeader author="Snehish Yadav" time="12:23 PM" isAdmin />
          <p className="mt-[14px] rounded-[12px] bg-surface px-[18px] py-[16px] text-[14px] text-ink shadow-[0_4px_9px_0_rgb(0_0_0/0.04)]">
            {WELCOME_TEXT}
          </p>
        </article>
      </div>

      <Composer />
    </AppShell>
  );
}
