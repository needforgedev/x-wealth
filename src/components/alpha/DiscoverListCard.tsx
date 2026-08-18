import Image from "next/image";
import Link from "next/link";

import { RatingRing } from "@/components/ui/RatingRing";
import type { DiscoverListing } from "@/lib/alpha";

/**
 * Alpha's discovery row: identity, a truncated blurb and a "view more" link,
 * stacked inside one panel. The Investor page instead gives each group its own
 * stat card — that layout is on `/alpha/discover/stats`.
 */
export function DiscoverListCard({ listing }: { listing: DiscoverListing }) {
  return (
    <article className="border-b border-[#e9e9e9] px-[23px] pt-[16px] pb-[15px] last:border-b-0">
      <header className="flex items-start">
        <span
          style={{ backgroundColor: listing.tint }}
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

        <div className="ml-[21px] min-w-0 flex-1">
          <h3 className="truncate text-[14px] font-semibold capitalize text-ink">
            {listing.name}
          </h3>
          <p className="mt-[3px] truncate text-[13px] font-semibold text-muted">
            {listing.members}
          </p>
        </div>

        <RatingRing value={listing.index} className="ml-3 shrink-0" />
      </header>

      <p className="mt-[22px] text-[13px] text-muted">{listing.blurb}</p>

      <Link
        href={`/alpha/groups/${listing.id}`}
        className="mt-[12px] block text-right text-[12px] font-semibold uppercase text-brand"
      >
        View More
      </Link>
    </article>
  );
}
