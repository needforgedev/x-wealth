import Image from "next/image";

import type { User } from "@/db/schema";

/**
 * Avatar, name and contact line — the top of every profile screen.
 *
 * Takes the signed-in user rather than importing a fixture. It used to render
 * `USER` from `src/lib/profile.ts`: a hardcoded "Raj Bansal · Member since
 * 2021" shown to whoever was looking. That is a worse failure than a broken
 * link, because nothing about it looks broken — a reader has no reason to doubt
 * the name on their own profile.
 *
 * There is no bio and no member-since line. Neither is a column on `users`
 * (`CLAUDE.md` §9), and inventing them from a join date would be presenting a
 * derived number as a fact the user gave us.
 */
export function ProfileIdentity({
  user,
  className = "",
}: {
  user: Pick<User, "contactName" | "contactEmail" | "phone" | "planTier">;
  className?: string;
}) {
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
          <p className="truncate text-[14px] font-semibold text-ink">
            {user.contactName ?? "Your account"}
          </p>
          <p className="mt-[8px] truncate text-[13px] text-muted">
            {user.contactEmail ?? user.phone ?? "No contact details yet"}
          </p>
        </div>
      </div>

      <p className="mt-[24px] px-[25px] text-[14px] leading-[1.45] text-muted">
        {user.planTier === "PRO" ? "Pro plan" : "Free plan"}
      </p>
    </div>
  );
}
