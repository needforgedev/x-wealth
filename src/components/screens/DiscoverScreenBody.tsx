import { GroupCard } from "@/components/GroupCard";
import { SectionHeader } from "@/components/SectionHeader";
import { TopBar } from "@/components/TopBar";
import { MaskIcon } from "@/components/ui/MaskIcon";
import { DISCOVERY_GROUPS } from "@/lib/groups";

/** Group Discovery content: category filter + search, then the ranked group list. */
export function DiscoverScreenBody() {
  return (
    <>
      <TopBar showBack backHref="/chats" />

      <div className="mx-[23px] mt-[23px] flex h-[51px] shrink-0 items-center bg-surface">
        <button type="button" className="flex shrink-0 items-center pl-[11px] text-muted">
          <span className="text-[15px]">Intraday</span>
          <span className="ml-[2px] flex size-[24px] items-center justify-center">
            <MaskIcon src="/assets/icon-chevron-down.svg" width={12} height={7.41} />
          </span>
        </button>

        <span aria-hidden className="h-full w-px shrink-0 bg-[#dfdfdf]" />

        <input
          aria-label="Search for a group"
          placeholder="Search for a group"
          className="min-w-0 flex-1 bg-transparent px-[21px] text-[15px] text-ink outline-none placeholder:text-muted"
        />

        <span className="mr-[13px] flex size-[19px] shrink-0 items-center justify-center text-muted">
          <MaskIcon src="/assets/nav-search.svg" width={17.49} height={17.49} />
        </span>
      </div>

      <SectionHeader
        className="mt-[23px] shrink-0 px-[23px]"
        icon={{ src: "/assets/icon-group.svg", width: 17.5, height: 12.25 }}
        title="Top Groups"
        action={
          <button type="button" className="flex items-center gap-[9px] text-muted">
            <span className="flex size-[19px] items-center justify-center">
              <MaskIcon src="/assets/icon-add-box.svg" width={14.25} height={14.25} />
            </span>
            <span className="text-[12px] font-semibold uppercase">Join Group</span>
          </button>
        }
      />

      <div className="flex flex-col gap-[15px] px-[27px] pt-[36px] pb-6">
        {DISCOVERY_GROUPS.map((group) => (
          <GroupCard key={group.id} group={group} />
        ))}
      </div>
    </>
  );
}
