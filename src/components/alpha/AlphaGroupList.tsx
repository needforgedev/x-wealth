import Link from "next/link";

import { ChatRow } from "@/components/ChatRow";
import { SectionHeader } from "@/components/SectionHeader";
import { MaskIcon } from "@/components/ui/MaskIcon";
import { ALPHA_THREADS } from "@/lib/alpha";

/**
 * "My Groups" and its rows. `limit` trims the list for the loading artboards,
 * which draw a single real row above the placeholders.
 */
export function AlphaGroupList({ limit }: { limit?: number } = {}) {
  const threads = limit ? ALPHA_THREADS.slice(0, limit) : ALPHA_THREADS;

  return (
    <>
      <SectionHeader
        className="mt-[26px] shrink-0 px-[23px]"
        icon={{ src: "/assets/icon-group.svg", width: 17.5, height: 12.25 }}
        title="My Groups"
        action={
          <Link href="/alpha/discover" className="flex items-center gap-[9px]">
            <span className="flex size-[19px] items-center justify-center text-muted">
              <MaskIcon src="/assets/icon-add-box.svg" width={14.25} height={14.25} />
            </span>
            <span className="text-[12px] font-semibold uppercase text-muted">Join Group</span>
          </Link>
        }
      />

      <div className="flex-1 bg-surface">
        <ul className="flex flex-col gap-[19px] pt-[25px]">
          {threads.map((thread) => (
            <ChatRow key={thread.id} thread={thread} basePath="/alpha/groups" />
          ))}
        </ul>
      </div>
    </>
  );
}
