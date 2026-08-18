import Image from "next/image";
import Link from "next/link";

import type { ChatThread } from "@/lib/chats";

/**
 * One conversation in the "My Groups" list. Content is top-aligned rather than
 * centred — the artboard hangs everything off the avatar's top edge and closes
 * the row 12px below it, with the rule sitting at y=59.
 *
 * `basePath` re-points the row at the advisor conversation, which is the same
 * list rendered against a different set of group screens.
 */
export function ChatRow({
  thread,
  basePath = "/groups",
}: {
  thread: ChatThread;
  basePath?: string;
}) {
  return (
    <li className="border-b border-muted/[0.13]">
      <Link href={`${basePath}/${thread.id}`} className="flex items-start px-[28px] pb-[12px]">
        <span
          style={{ backgroundColor: thread.tint }}
          className="flex size-[47px] shrink-0 items-center justify-center rounded-full"
        >
          <Image
            src="/assets/group-emblem.png"
            alt=""
            width={21}
            height={21}
            className="size-[21px] opacity-50"
          />
        </span>

        <div className="ml-[22px] mt-[4px] min-w-0 flex-1">
          <p className="truncate text-[14px] font-semibold capitalize text-ink">{thread.name}</p>
          <p className="mt-[5px] truncate text-[14px] font-medium text-muted">{thread.preview}</p>
        </div>

        <div className="ml-3 mt-[5px] flex shrink-0 flex-col items-end">
          <span className="text-[10px] font-semibold capitalize text-timestamp">{thread.time}</span>
          {thread.unread ? (
            <span className="mt-[9px] flex h-[17px] min-w-[39px] items-center justify-center rounded-[42px] bg-unread px-2 text-[9px] font-medium text-white">
              {thread.unread}
            </span>
          ) : null}
        </div>
      </Link>
    </li>
  );
}
