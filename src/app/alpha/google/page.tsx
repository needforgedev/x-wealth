"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";

import { AppShell } from "@/components/AppShell";
import { GoogleMark } from "@/components/alpha/GoogleMark";

const ACCOUNTS = [
  { id: "yash", name: "Yash Bhardwaj", email: "theyashbhardwaj@gmail.com" },
  { id: "raj", name: "Raj Bansal", email: "rajbansal@gmail.com" },
] as const;

/**
 * The federated sign-in hand-off. On the artboard this frame is a flat
 * screenshot of Google's account chooser rather than drawn UI, so this is a
 * stand-in for the real OAuth page: it shows what the step does and returns the
 * user to the flow. Replace it with the provider redirect when auth lands.
 */
export default function AlphaGooglePage() {
  const router = useRouter();

  return (
    <AppShell>
      <div className="flex flex-1 flex-col px-6 pt-[64px] pb-[calc(29px+env(safe-area-inset-bottom))]">
        <GoogleMark size={36} />

        <h1 className="mt-[26px] text-[24px] font-normal text-ink">Choose an account</h1>
        <p className="mt-[8px] text-[15px] text-muted">
          to continue to{" "}
          <span className="text-ink">
            <Image
              src="/assets/logo-xwealth.svg"
              alt="X Wealth"
              width={70}
              height={21}
              unoptimized
              className="inline-block h-[21px] w-[70px] align-text-bottom"
            />
          </span>
        </p>

        <ul className="mt-[30px] flex flex-col">
          {ACCOUNTS.map((account) => (
            <li key={account.id}>
              <button
                type="button"
                onClick={() => router.push("/alpha/complete-profile")}
                className="flex w-full items-center gap-[16px] border-b border-divider-soft py-[14px] text-left"
              >
                <Image
                  src="/assets/user-avatar.png"
                  alt=""
                  width={32}
                  height={32}
                  className="size-[32px] shrink-0 rounded-full object-cover"
                />
                <span className="min-w-0">
                  <span className="block truncate text-[15px] text-ink">{account.name}</span>
                  <span className="block truncate text-[13px] text-muted">{account.email}</span>
                </span>
              </button>
            </li>
          ))}

          <li>
            <button
              type="button"
              onClick={() => router.push("/alpha/complete-profile")}
              className="flex w-full items-center gap-[16px] py-[14px] text-left"
            >
              <span className="flex size-[32px] shrink-0 items-center justify-center rounded-full border border-line text-muted">
                +
              </span>
              <span className="text-[15px] text-ink">Use another account</span>
            </button>
          </li>
        </ul>

        <button
          type="button"
          onClick={() => router.push("/alpha")}
          className="mt-auto self-start text-[14px] font-medium text-brand"
        >
          Cancel
        </button>
      </div>
    </AppShell>
  );
}
