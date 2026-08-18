import Image from "next/image";

type MessageHeaderProps = {
  author: string;
  time: string;
  isAdmin?: boolean;
};

/** Avatar, author, optional Admin pill, and timestamp above a message bubble. */
export function MessageHeader({ author, time, isAdmin = false }: MessageHeaderProps) {
  return (
    <div className="flex items-center">
      <Image
        src="/assets/user-avatar.png"
        alt=""
        width={25}
        height={25}
        className="size-[25px] shrink-0 rounded-full object-cover"
      />
      <p className="ml-[16px] truncate text-[14px] font-semibold capitalize text-ink">{author}</p>
      {isAdmin && (
        <span className="ml-[16px] flex h-[17px] shrink-0 items-center rounded-[5px] bg-ink/[0.13] px-[10px] text-[10px] font-medium capitalize text-ink">
          Admin
        </span>
      )}
      <span className="ml-auto shrink-0 text-[12px] font-semibold capitalize text-muted">
        {time}
      </span>
    </div>
  );
}
