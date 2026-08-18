"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { use } from "react";

import { MemberRow } from "@/components/advisor/MemberRow";
import { AppShell } from "@/components/AppShell";
import { SectionHeader } from "@/components/SectionHeader";
import { SignalCard } from "@/components/SignalCard";
import { TopBar } from "@/components/TopBar";
import { MaskIcon } from "@/components/ui/MaskIcon";
import { RatingRing } from "@/components/ui/RatingRing";
import { GROUP_TAGS, MEMBERS } from "@/lib/advisor";
import { GROUP } from "@/lib/conversation";
import { TAG_TONES } from "@/lib/groups";
import { RECENT_SIGNALS } from "@/lib/signals";
import { GROUP_PROFILE } from "@/lib/subscription";

function Stat({ label, value, className = "" }: { label: string; value: string; className?: string }) {
  return (
    <div className={className}>
      <p className="text-[9px] font-medium capitalize text-muted">{label}</p>
      <p className="mt-[4px] text-[16px] font-medium capitalize text-ink">{value}</p>
    </div>
  );
}

/**
 * The advisor's own group profile. The header block matches what an investor
 * sees, but the subscribe panel is replaced by the membership roster — the
 * advisor is selling this group, not buying it.
 */
export default function AdvisorGroupProfilePage({
  params,
}: PageProps<"/advisor/groups/[id]/profile">) {
  const { id } = use(params);
  const router = useRouter();

  return (
    <AppShell className="bg-surface-alt">
      <TopBar
        showBack
        backHref={`/advisor/groups/${id}`}
        onMenuClick={() => router.push(`/advisor/groups/${id}/edit`)}
      />

      <section className="shrink-0 bg-surface px-[27px] pt-[20px] pb-[25px]">
        <div className="flex items-start">
          <span
            style={{ backgroundColor: GROUP.tint }}
            className="flex size-[47px] shrink-0 items-center justify-center rounded-full"
          >
            <Image
              src="/assets/group-emblem.png"
              alt=""
              width={21}
              height={21}
              className="size-[21px] opacity-50"
            />
          </span>

          <div className="ml-[22px] mt-[4px] min-w-0 flex-1">
            <h1 className="truncate text-[14px] font-semibold capitalize text-ink">{GROUP.name}</h1>
            <p className="mt-[8px] truncate text-[13px] font-semibold capitalize text-muted">
              {GROUP.members}
            </p>
          </div>

          <div className="ml-3 flex shrink-0 flex-col items-center">
            <p className="text-[9px] font-medium capitalize text-muted">Index</p>
            <RatingRing value={GROUP_PROFILE.rating} className="mt-[7px]" />
          </div>
        </div>

        <div className="mt-[15px] h-px bg-muted/[0.13]" />

        <div className="mt-[20px] flex">
          <div className="flex min-w-0 flex-1">
            <Image
              src="/assets/icon-verified.svg"
              alt="Verified"
              width={19}
              height={19}
              unoptimized
              className="mt-[9px] size-[19px] shrink-0"
            />
            <Stat
              className="ml-[13px] min-w-0"
              label="SEBI Registered"
              value={GROUP_PROFILE.sebiId}
            />
          </div>

          <div className="flex shrink-0 items-end">
            <Stat label="AUM" value={GROUP_PROFILE.aum} />
            <span className="ml-[8px] mb-[2px] flex items-center gap-[2px] text-positive">
              <MaskIcon src="/assets/icon-arrow-drop-up.svg" width={10} height={5} />
              <span className="text-[11px] font-bold">{GROUP_PROFILE.aumDelta}</span>
            </span>
          </div>

          <Stat className="ml-[16px] shrink-0" label="Acuracy" value={GROUP_PROFILE.accuracy} />
        </div>

        <p className="mt-[18px] text-[9px] font-medium capitalize text-muted">Type</p>
        <ul className="mt-[10px] flex flex-wrap gap-[4px]">
          {GROUP_TAGS.map((tag) => (
            <li
              key={tag.label}
              className={`flex h-[18px] items-center rounded-[2px] px-[11px] text-[10px] font-medium text-tag-ink ${TAG_TONES[tag.tone]}`}
            >
              {tag.label}
            </li>
          ))}
        </ul>
      </section>

      <SectionHeader
        className="mt-[13px] shrink-0 px-[27px]"
        icon={{ src: "/assets/icon-star-outline.svg", width: 17.5, height: 16.63 }}
        title="Highlighted Signals"
      />

      <div className="no-scrollbar mt-[24px] flex shrink-0 gap-[10px] overflow-x-auto px-[28px]">
        {RECENT_SIGNALS.map((signal) => (
          <SignalCard key={signal.id} signal={signal} />
        ))}
      </div>

      <SectionHeader
        className="mt-[24px] shrink-0 px-[34px]"
        icon={{ src: "/assets/icon-group.svg", width: 17.5, height: 12.25 }}
        title="All Members"
        action={
          <Link
            href={`/advisor/groups/${id}/members`}
            className="text-[12px] font-semibold capitalize text-muted"
          >
            View All
          </Link>
        }
      />

      <ul className="flex flex-1 flex-col gap-[24px] px-[34px] pt-[24px] pb-6">
        {MEMBERS.slice(0, 5).map((member) => (
          <MemberRow key={member.id} member={member} />
        ))}
      </ul>
    </AppShell>
  );
}
