import Link from "next/link";

import { AppShell } from "@/components/AppShell";
import { BottomNav } from "@/components/BottomNav";
import { ProfileIdentity } from "@/components/screens/ProfileIdentity";
import { TopBar } from "@/components/TopBar";
import { MaskIcon } from "@/components/ui/MaskIcon";
import { SETTINGS } from "@/lib/profile";

/** Profile with the logout confirmation sheet (807:1966). */
export default function LogoutConfirmPage() {
  return (
    <AppShell className="relative bg-surface-alt">
      <TopBar />

      <section className="shrink-0 bg-surface pt-[20px] pb-[24px]">
        <ProfileIdentity />
        <p className="mt-[20px] px-[27px] text-[13px] font-semibold text-brand">View Profile</p>
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
          aria-label="Confirm logout"
          className="absolute inset-x-0 bottom-0 bg-surface pt-[19px]"
        >
          <h2 className="px-[30px] text-[18px] font-semibold text-ink-strong">Are you sure?</h2>
          <p className="mt-[8px] px-[30px] text-[18px] text-ink-soft">
            You want to logout of app?
          </p>

          <div className="mt-[24px] h-px bg-divider-soft" />

          <div className="px-[27px] pt-[34px]">
            <Link
              href="/profile"
              className="flex h-[42.93px] w-full items-center justify-center rounded-[6px] bg-brand text-[16px] font-medium text-white"
            >
              No Stay Logged In
            </Link>
          </div>

          <Link
            href="/"
            className="mt-[29px] flex items-center justify-center gap-[16px] pb-[calc(24px+env(safe-area-inset-bottom))] text-ink-soft"
          >
            <span className="flex size-[21px] shrink-0 items-center justify-center">
              <MaskIcon src="/assets/icon-logout.svg" width={21} height={21} />
            </span>
            <span className="text-[16px] font-medium">Logout</span>
          </Link>
        </div>
      </div>
    </AppShell>
  );
}
