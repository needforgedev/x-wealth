import Image from "next/image";

import { RatingRing } from "@/components/ui/RatingRing";
import { TAG_TONES, type Group } from "@/lib/groups";

function Stat({
  label,
  value,
  delta,
  className = "",
}: {
  label: string;
  value: string;
  delta?: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <p className="text-[9px] font-medium capitalize text-muted">{label}</p>
      <div className="mt-[4px] flex items-center">
        <p className="text-[16px] font-medium capitalize text-ink">{value}</p>
        {delta && (
          <span className="ml-[6px] flex items-center gap-[1px]">
            <Image
              src="/assets/icon-arrow-drop-up.svg"
              alt=""
              width={10}
              height={5}
              unoptimized
              className="h-[5px] w-[10px]"
            />
            <span className="text-[11px] font-bold text-positive">{delta}</span>
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * Signal-group summary card: identity, headline stats, category tags and the
 * index rating. Reused on Group Invitations and the discovery screens.
 */
export function GroupCard({ group, className = "" }: { group: Group; className?: string }) {
  return (
    <article
      className={`rounded-[2px] bg-surface px-[15px] pt-[15px] pb-[17px] shadow-[0_4px_9px_0_rgb(0_0_0/0.07)] ${className}`}
    >
      <header className="flex items-center gap-[22px]">
        <span
          style={{ backgroundColor: group.tint }}
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

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-[14px] font-semibold capitalize text-ink">{group.name}</h3>
            {group.verified && (
              <Image
                src="/assets/icon-verified.svg"
                alt="Verified"
                width={16}
                height={16}
                unoptimized
                className="size-[16px] shrink-0"
              />
            )}
          </div>
          <p className="mt-[8px] truncate text-[14px] font-medium text-muted">{group.members}</p>
        </div>

        <button
          type="button"
          aria-label={`More options for ${group.name}`}
          className="-mr-2 flex size-[24px] shrink-0 items-center justify-center"
        >
          <Image
            src="/assets/icon-more-vert.svg"
            alt=""
            width={4}
            height={14}
            unoptimized
            className="h-[14px] w-[3.5px]"
          />
        </button>
      </header>

      <div className="mt-[19px] flex">
        <Stat label="AUM" value={group.aum} delta={group.aumDelta} className="w-[112px]" />
        <Stat label="Acuracy" value={group.accuracy} className="w-[71px]" />
        <Stat label="Calls" value={group.calls} className="flex-1" />
      </div>

      <div className="mt-[8px] h-px bg-muted/[0.11]" />

      <div className="mt-[20px] flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[9px] font-medium capitalize text-muted">Type</p>
          <ul className="mt-[10px] flex flex-wrap gap-[4px]">
            {group.tags.map((tag) => (
              <li
                key={tag.label}
                className={`flex h-[18px] items-center rounded-[2px] px-[11px] text-[10px] font-medium text-tag-ink ${TAG_TONES[tag.tone]}`}
              >
                {tag.label}
              </li>
            ))}
          </ul>
        </div>

        <div className="flex shrink-0 flex-col items-center">
          <p className="text-[9px] font-medium capitalize text-muted">{group.indexLabel}</p>
          <RatingRing value={group.rating} className="mt-[7px]" />
        </div>
      </div>
    </article>
  );
}
