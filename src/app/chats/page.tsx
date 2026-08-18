import { AppShell } from "@/components/AppShell";
import { BottomNav } from "@/components/BottomNav";
import { ChatsScreenBody } from "@/components/screens/ChatsScreenBody";

export default function ChatsPage() {
  return (
    <AppShell className="bg-surface-alt">
      <ChatsScreenBody />
      <BottomNav />
    </AppShell>
  );
}
