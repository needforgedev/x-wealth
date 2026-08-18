import Link from "next/link";

import { AppShell } from "@/components/AppShell";
import { TopBar } from "@/components/TopBar";
import { MaskIcon } from "@/components/ui/MaskIcon";

const FIELDS = ["Old Password", "Enter New Password", "Confirm Password"] as const;

/** Change Password (807:1585). */
export default function ChangePasswordPage() {
  return (
    <AppShell className="bg-surface">
      <TopBar showBack backHref="/profile" />

      <div className="flex flex-1 flex-col px-[21px] pb-[24px]">
        <div className="mt-[27px] flex items-center text-ink-soft">
          <span className="flex size-[24px] shrink-0 items-center justify-center">
            <MaskIcon src="/assets/icon-lock.svg" width={24} height={24} />
          </span>
          <h1 className="ml-[19px] text-[16px] font-medium">Change Password</h1>
        </div>

        <div className="mt-[30px] flex flex-col gap-[16px]">
          {FIELDS.map((label) => {
            const id = `pw-${label.toLowerCase().replace(/\s+/g, "-")}`;
            return (
              <div key={label}>
                <label htmlFor={id} className="block text-[17px] text-ink-soft">
                  {label}
                </label>
                <div className="relative mt-[12px]">
                  <input
                    id={id}
                    type="password"
                    placeholder="Enter your password"
                    className="h-[50px] w-full rounded-[2px] border border-field-line-strong bg-transparent pl-[22px] pr-[52px] text-[17px] text-ink-strong outline-none placeholder:text-field-line-strong focus:border-brand"
                  />
                  <button
                    type="button"
                    aria-label={`Show ${label}`}
                    className="absolute right-[14px] top-1/2 flex size-[24px] -translate-y-1/2 items-center justify-center text-field-line-strong"
                  >
                    <MaskIcon src="/assets/icon-eye.svg" width={22.08} height={22.64} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <Link
          href="/profile"
          className="mt-[24px] flex h-[49.05px] w-full items-center justify-center rounded-[5px] bg-brand text-[18px] font-medium uppercase text-white"
        >
          <span>Reset Password</span>
          <span className="ml-[14px] flex size-[22px] shrink-0 items-center justify-center">
            <MaskIcon src="/assets/icon-arrow-forward.svg" width={22} height={22} />
          </span>
        </Link>
      </div>
    </AppShell>
  );
}
