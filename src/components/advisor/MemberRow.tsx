import Image from "next/image";

import { MaskIcon } from "@/components/ui/MaskIcon";
import type { Member } from "@/lib/advisor";

/** One person in a group's member list, with an overflow menu for moderation. */
export function MemberRow({ member }: { member: Member }) {
  return (
    <li className="flex h-[44px] items-center">
      <Image
        src={member.photo}
        alt=""
        width={44}
        height={44}
        className="size-[44px] shrink-0 rounded-full object-cover"
      />

      <div className="ml-[16px] min-w-0 flex-1">
        <p className="truncate text-[16px] font-semibold capitalize text-ink">{member.name}</p>
        <p className="mt-[1px] truncate text-[15px] text-muted">{member.joined}</p>
      </div>

      <button
        type="button"
        aria-label={`Options for ${member.name}`}
        className="ml-2 flex size-[38px] shrink-0 items-center justify-center text-muted"
      >
        <MaskIcon src="/assets/icon-more-vert.svg" width={3.5} height={14} />
      </button>
    </li>
  );
}
