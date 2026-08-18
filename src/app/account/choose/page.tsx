import { AccountSheet, type AccountOption } from "@/components/AccountSheet";
import { AppShell } from "@/components/AppShell";
import { BottomNav } from "@/components/BottomNav";
import { ChatsScreenBody } from "@/components/screens/ChatsScreenBody";

const ACCOUNTS: ReadonlyArray<AccountOption> = [
  { id: "yash-investor", name: "Yash B", role: "investor" },
  { id: "yash-advisor", name: "Yash B", role: "advisor" },
];

/** Choose Account (1788:1645) — Switch Account with the sheet open over it. */
export default function ChooseAccountPage() {
  return (
    <AppShell className="relative bg-surface-alt">
      <ChatsScreenBody />
      <BottomNav avatarSrc="/assets/user-photo.png" />
      <AccountSheet accounts={ACCOUNTS} dismissHref="/account/switch" />
    </AppShell>
  );
}
