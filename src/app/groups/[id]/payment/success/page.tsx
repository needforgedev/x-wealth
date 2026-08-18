import Image from "next/image";
import Link from "next/link";

import { AppShell } from "@/components/AppShell";
import { BottomNav } from "@/components/BottomNav";
import { GroupIdentityRow } from "@/components/GroupIdentityRow";
import { TopBar } from "@/components/TopBar";
import { GROUP } from "@/lib/conversation";
import { PLANS } from "@/lib/subscription";

export default async function PaymentSuccessPage({
  params,
}: PageProps<"/groups/[id]/payment/success">) {
  const { id } = await params;
  const purchased = PLANS[1];

  return (
    <AppShell className="bg-surface-alt">
      <TopBar showBack backHref={`/groups/${id}/payment`} />

      <section className="mx-[27px] mt-[98px] shrink-0 bg-surface pt-[27px] pb-[29px]">
        <Image
          src="/assets/icon-payment-success.svg"
          alt=""
          width={45}
          height={45}
          unoptimized
          className="mx-auto size-[45.42px]"
        />

        <h1 className="mt-[22px] text-center text-[20px] font-semibold capitalize text-black">
          Payment Successful
        </h1>

        <div className="mt-[28px] h-px bg-[#d3d3d3]" />

        <GroupIdentityRow
          className="mt-[21px] px-[23px]"
          name={GROUP.name}
          members={GROUP.members}
          tint={GROUP.tint}
        />

        <div className="mt-[23px] flex items-baseline px-[33px]">
          <p className="text-[14px] font-medium capitalize text-ink">{purchased.title}</p>
          <p className="ml-[16px] text-[14px] text-muted">{purchased.description}</p>
        </div>

        <div className="mt-[33px] px-[12px]">
          <Link
            href={`/groups/${id}`}
            className="flex h-[48px] w-full items-center justify-center rounded-[6px] bg-brand text-[17px] font-semibold text-white"
          >
            Visit Group
          </Link>
        </div>
      </section>

      <div className="flex-1" />
      <BottomNav />
    </AppShell>
  );
}
