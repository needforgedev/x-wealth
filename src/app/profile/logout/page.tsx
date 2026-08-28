import Link from "next/link";
import { redirect } from "next/navigation";

import { AppShell } from "@/components/AppShell";
import { BottomNav } from "@/components/BottomNav";
import { ProfileIdentity } from "@/components/screens/ProfileIdentity";
import { TopBar } from "@/components/TopBar";
import { MaskIcon } from "@/components/ui/MaskIcon";
import { SETTINGS } from "@/lib/profile";
import { currentIdentity } from "@/server/identity";
import { SignOut } from "../SignOut";

export const dynamic = "force-dynamic";

/**
 * The logout confirmation sheet.
 *
 * Both buttons on this sheet used to be `<Link>`s — "No Stay Logged In" went to
 * `/profile` and "Logout" went to `/`. The second one navigated to the landing
 * page and left the session completely intact: the cookie survived, and typing
 * any protected URL walked straight back in. It looked exactly like signing
 * out, which on a borrowed or shared device is the worst way for it to fail.
 *
 * The real `signOut` action had existed the whole time and nothing called it.
 */
export default async function LogoutConfirmPage() {
  const identity = await currentIdentity();
  if (!identity?.user) redirect("/");
  const user = identity.user;

  return (
    <AppShell className="relative bg-surface-alt">
      <TopBar showBack backHref="/profile" />

      <section className="shrink-0 bg-surface pt-[20px] pb-[24px]">
        <ProfileIdentity user={user} />
      </section>

      <section className="mt-[19px] flex flex-1 flex-col bg-surface pt-[33px]">
        <ul className="flex flex-col gap-[35px] px-[35px]">
          {SETTINGS.map((item) => (
            <li key={item.href} className="flex items-center text-menu-ink">
              <span className="flex size-[24px] shrink-0 items-center justify-center">
                <MaskIcon src={item.icon.src} width={item.icon.width} height={item.icon.height} />
              </span>
              <span className="ml-[19px] text-[16px] font-medium">{item.label}</span>
            </li>
          ))}
        </ul>
      </section>

      <BottomNav />

      <div className="absolute inset-0 z-20">
        <Link href="/profile" aria-label="Dismiss" className="absolute inset-0 bg-[#322e2e]/[0.69]" />

        <div
          role="dialog"
          aria-label="Confirm sign out"
          className="absolute inset-x-0 bottom-0 bg-surface pt-[19px]"
        >
          <h2 className="px-[30px] text-[18px] font-semibold text-ink-strong">Sign out?</h2>
          <p className="mt-[8px] px-[30px] text-[16px] text-ink-soft">
            Your strategies, tests and records stay exactly where they are.
          </p>

          <div className="mt-[24px] h-px bg-divider-soft" />

          <div className="px-[27px] pt-[34px]">
            <Link
              href="/profile"
              className="flex h-[42.93px] w-full items-center justify-center rounded-[6px] bg-brand text-[16px] font-medium text-white"
            >
              Stay signed in
            </Link>
          </div>

          <div className="px-[27px] pb-[calc(24px+env(safe-area-inset-bottom))] pt-[16px]">
            <SignOut variant="primary" label="Sign out" />
          </div>
        </div>
      </div>
    </AppShell>
  );
}
