import Link from "next/link";
import { redirect } from "next/navigation";

import { AppShell } from "@/components/AppShell";
import { BottomNav } from "@/components/BottomNav";
import { ProfileIdentity } from "@/components/screens/ProfileIdentity";
import { TopBar } from "@/components/TopBar";
import { MaskIcon } from "@/components/ui/MaskIcon";
import { SETTINGS } from "@/lib/profile";
import { currentIdentity } from "@/server/identity";

export const dynamic = "force-dynamic";

/**
 * The signed-in account.
 *
 * Two things were wrong here and both survived the teardown because this screen
 * imports no schema, so nothing in CI could see them — the same blind spot that
 * left the landing page pitching certified experts.
 *
 * **It had no auth guard.** A signed-out visitor could open it, and every other
 * profile route with it. Guarded now, like every page that shows anything about
 * a person.
 *
 * **It showed a fixture.** `ProfileIdentity` rendered a hardcoded "Raj Bansal /
 * Member since 2021" to whoever was looking. A profile that displays somebody
 * else's name is worse than a 404: the reader has no reason to doubt it.
 */
export default async function ProfilePage() {
  const identity = await currentIdentity();
  if (!identity?.user) redirect("/");
  const user = identity.user;

  return (
    <AppShell className="bg-surface-alt">
      <TopBar showBack backHref="/home" />

      <section className="shrink-0 bg-surface pt-[20px] pb-[24px]">
        <ProfileIdentity user={user} />
        <Link
          href="/profile/edit"
          className="mt-[19px] flex items-center justify-center gap-[10px] text-[16px] font-semibold text-brand"
        >
          View Profile
          <MaskIcon src="/assets/icon-arrow-forward.svg" width={15} height={16} />
        </Link>
      </section>

      <section className="mt-[19px] flex flex-1 flex-col bg-surface pt-[33px]">
        <ul className="flex flex-col gap-[35px] px-[35px]">
          {SETTINGS.map((item) => (
            <li key={item.href}>
              <Link href={item.href} className="flex items-center text-menu-ink">
                <span className="flex size-[24px] shrink-0 items-center justify-center">
                  <MaskIcon src={item.icon.src} width={item.icon.width} height={item.icon.height} />
                </span>
                <span className="ml-[19px] text-[16px] font-medium">{item.label}</span>
              </Link>
            </li>
          ))}
        </ul>

        <div className="mt-auto h-px bg-divider-soft" />

        <Link
          href="/profile/logout"
          className="flex items-center justify-center gap-[19px] py-[15px] text-menu-ink"
        >
          <span className="flex size-[24px] shrink-0 items-center justify-center">
            <MaskIcon src="/assets/icon-logout.svg" width={24} height={24} />
          </span>
          <span className="text-[16px] font-medium">Logout</span>
        </Link>
      </section>

      <BottomNav />
    </AppShell>
  );
}
