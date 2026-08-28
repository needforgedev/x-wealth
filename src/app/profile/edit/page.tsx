import Image from "next/image";
import { redirect } from "next/navigation";

import { AppShell } from "@/components/AppShell";
import { TopBar } from "@/components/TopBar";
import { currentIdentity } from "@/server/identity";
import { EditProfileForm } from "./EditProfileForm";

export const dynamic = "force-dynamic";

/** Edit the name and email on the signed-in account. */
export default async function EditProfilePage() {
  const identity = await currentIdentity();
  if (!identity?.user) redirect("/");
  const user = identity.user;

  return (
    <AppShell className="bg-surface">
      <TopBar showBack backHref="/profile" />

      <div className="font-plex flex flex-1 flex-col px-[28px] pb-[24px]">
        <h1 className="mt-[21px] text-[18px] font-semibold text-ink-strong">Edit Profile</h1>

        {/*
          The avatar is static. There is no upload path, no storage bucket wired
          and no column to put a URL in, so the button that sat beside it has
          gone rather than staying as something that looks pressable and is not.
        */}
        <div className="mt-[25px] flex items-center">
          <Image
            src="/assets/user-photo.png"
            alt=""
            width={47}
            height={47}
            className="size-[47px] shrink-0 rounded-full object-cover"
          />
        </div>

        <EditProfileForm
          initial={{
            fullName: user.contactName ?? "",
            email: user.contactEmail ?? "",
          }}
        />
      </div>
    </AppShell>
  );
}
