import Link from "next/link";

/**
 * Empty home state. The artboard's 150px illustration is a detailed character
 * drawing; this is a simplified stand-in at the same footprint — swap in the
 * exported asset when the illustration set is handed over.
 */
function EmptyArtwork() {
  return (
    <svg width={150} height={150} viewBox="0 0 150 150" aria-hidden focusable="false">
      <circle cx="75" cy="75" r="75" fill="#F5F9FB" />
      <path d="M32 150a43 43 0 0 1 86 0Z" fill="#C8DBEF" />
      <circle cx="75" cy="62" r="26" fill="#FFDFCB" />
      <path
        d="M49 60a26 26 0 0 1 52 0c0-6-4-9-9-11-5-2-10 1-17 1s-12-3-17-1c-5 2-9 5-9 11Z"
        fill="#945E6E"
      />
      <rect x="60" y="88" width="30" height="46" rx="8" fill="#262626" />
      <rect x="68" y="94" width="14" height="4" rx="2" fill="#484848" />
      <circle cx="66" cy="60" r="3" fill="#494A4B" />
      <circle cx="84" cy="60" r="3" fill="#494A4B" />
      <path d="M69 72a7 7 0 0 0 12 0Z" fill="#D96B70" />
    </svg>
  );
}

export function EmptyGroups() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6">
      <EmptyArtwork />

      <p className="mt-[27px] text-[17px] font-semibold text-[#8f909a]">
        Your groups will appear here
      </p>

      <Link
        href="/alpha/discover"
        className="mt-[29px] flex h-[38px] w-[131px] items-center justify-center rounded-[8px] bg-surface text-[15px] font-semibold text-[#b7b7b7] shadow-[0_4px_9px_0_rgb(0_0_0/0.04)]"
      >
        Find a Group
      </Link>
    </div>
  );
}
