import Link from "next/link";

import { AppShell } from "@/components/AppShell";
import { BottomNav } from "@/components/BottomNav";
import { ChatsScreenBody } from "@/components/screens/ChatsScreenBody";

/**
 * Switch Account (1788:1381) — the Chats screen with the signed-in user's photo
 * in place of the profile glyph. Tapping it opens the account sheet.
 */
export default function SwitchAccountPage() {
  return (
    <AppShell className="relative bg-surface-alt">
      <ChatsScreenBody />
      <BottomNav avatarSrc="/assets/user-photo.png" />
      <Link
        href="/account/choose"
        aria-label="Switch account"
        className="absolute right-[26px] bottom-[15px] z-10 size-[24px]"
      />
    </AppShell>
  );
}
