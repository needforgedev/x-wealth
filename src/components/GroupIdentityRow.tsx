import Image from "next/image";

type GroupIdentityRowProps = {
  name: string;
  members: string;
  tint?: string;
  className?: string;
};

/** Avatar + group name + member count. Shared by profile, payment and receipt. */
export function GroupIdentityRow({
  name,
  members,
  tint = "#E6E0FF",
  className = "",
}: GroupIdentityRowProps) {
  return (
    <div className={`flex items-start ${className}`}>
      <span
        style={{ backgroundColor: tint }}
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
      <div className="ml-[22px] mt-[4px] min-w-0">
        <p className="truncate text-[14px] font-semibold capitalize text-ink">{name}</p>
        <p className="mt-[8px] truncate text-[13px] font-semibold capitalize text-muted">
          {members}
        </p>
      </div>
    </div>
  );
}
