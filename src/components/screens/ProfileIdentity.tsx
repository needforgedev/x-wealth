import Image from "next/image";

import { USER } from "@/lib/profile";

/** Avatar, name, membership line and bio — the top of every profile artboard. */
export function ProfileIdentity({ className = "" }: { className?: string }) {
  return (
    <div className={className}>
      <div className="flex items-start px-[27px]">
        <Image
          src="/assets/user-photo.png"
          alt=""
          width={47}
          height={47}
          className="size-[47px] shrink-0 rounded-full object-cover"
        />
        <div className="ml-[22px] mt-[4px] min-w-0">
          <p className="truncate text-[14px] font-semibold capitalize text-ink">{USER.name}</p>
          <p className="mt-[8px] truncate text-[13px] font-semibold capitalize text-muted">
            {USER.since}
          </p>
        </div>
      </div>

      <p className="mt-[24px] px-[25px] text-[14px] leading-[1.45] text-ink">{USER.bio}</p>
    </div>
  );
}
