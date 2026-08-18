"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";

import { MaskIcon } from "@/components/ui/MaskIcon";

export type AccountRole = "investor" | "advisor";

export type AccountOption = {
  id: string;
  name: string;
  role: AccountRole;
};

/** Role pill tints, straight off the artboard. */
const ROLE_STYLES: Record<AccountRole, string> = {
  investor: "bg-[#f0e8f0]",
  advisor: "bg-[#e0edff]",
};

type AccountSheetProps = {
  accounts: ReadonlyArray<AccountOption>;
  /** Where dismissing the sheet returns to. */
  dismissHref: string;
};

/**
 * Bottom sheet for switching between the investor and advisor identities.
 * Specified in Roboto rather than the app's Inter.
 */
export function AccountSheet({ accounts, dismissHref }: AccountSheetProps) {
  const router = useRouter();
  const dismiss = () => router.push(dismissHref);

  return (
    <div className="absolute inset-0 z-20">
      <button
        type="button"
        aria-label="Dismiss"
        onClick={dismiss}
        className="absolute inset-0 bg-[#646464]/[0.39]"
      />

      <div
        role="dialog"
        aria-label="Switch account"
        className="absolute inset-x-0 bottom-0 bg-surface pt-[22px] pb-[calc(22px+env(safe-area-inset-bottom))] font-roboto"
      >
        <h2 className="px-[19px] text-[18px] font-semibold text-[#7d7d7d]">Switch Account</h2>

        <ul className="mt-[26px] flex flex-col gap-[24px] px-[22px]">
          {accounts.map((account) => (
            <li key={account.id}>
              <button type="button" onClick={dismiss} className="flex w-full items-center">
                <Image
                  src="/assets/user-photo.png"
                  alt=""
                  width={36}
                  height={36}
                  className="size-[36px] shrink-0 rounded-full object-cover"
                />
                <span className="ml-[25px] truncate text-[18px] font-medium text-[#414447]">
                  {account.name}
                </span>
                <span
                  className={`ml-auto flex h-[24px] w-[84px] shrink-0 items-center justify-center rounded-[9px] text-[12px] font-medium uppercase text-[#717171] ${ROLE_STYLES[account.role]}`}
                >
                  {account.role}
                </span>
              </button>
            </li>
          ))}
        </ul>

        <button
          type="button"
          onClick={dismiss}
          className="mt-[24px] flex items-center px-[24px] text-[#7d7d7d]"
        >
          <span className="flex size-[23px] shrink-0 items-center justify-center">
            <MaskIcon src="/assets/icon-add.svg" width={13.42} height={13.42} />
          </span>
          <span className="ml-[14px] text-[15px] font-semibold uppercase">Add an account</span>
        </button>
      </div>
    </div>
  );
}
