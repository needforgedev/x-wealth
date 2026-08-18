import Image from "next/image";
import Link from "next/link";

import { AppShell } from "@/components/AppShell";
import { TopBar } from "@/components/TopBar";
import { MaskIcon } from "@/components/ui/MaskIcon";
import { USER } from "@/lib/profile";

function Field({
  label,
  defaultValue,
  multiline = false,
}: {
  label: string;
  defaultValue?: string;
  multiline?: boolean;
}) {
  const id = `edit-${label.toLowerCase().replace(/\s+/g, "-")}`;
  return (
    <div>
      <label htmlFor={id} className="block text-[17px] text-ink-soft">
        {label}
      </label>
      {multiline ? (
        <textarea
          id={id}
          defaultValue={defaultValue}
          className="mt-[12px] h-[98px] w-full resize-none rounded-[2px] border border-field-line bg-transparent px-[17px] py-[12px] text-[17px] text-ink-strong outline-none focus:border-brand"
        />
      ) : (
        <input
          id={id}
          defaultValue={defaultValue}
          className="mt-[12px] h-[46.66px] w-full rounded-[2px] border border-field-line bg-transparent px-[17px] text-[17px] text-ink-strong outline-none focus:border-brand"
        />
      )}
    </div>
  );
}

/** Edit Profile (807:1783). Specified in IBM Plex Sans. */
export default function EditProfilePage() {
  return (
    <AppShell className="bg-surface">
      <TopBar showBack backHref="/profile" />

      <div className="font-plex flex flex-1 flex-col px-[28px] pb-[24px]">
        <h1 className="mt-[21px] text-[18px] font-semibold text-ink-strong">Edit Profile</h1>

        <div className="mt-[25px] flex items-center">
          <Image
            src="/assets/user-photo.png"
            alt=""
            width={47}
            height={47}
            className="size-[47px] shrink-0 rounded-full object-cover"
          />
          <button
            type="button"
            className="ml-[35px] flex h-[38px] items-center gap-[19px] rounded-[5px] bg-field-line px-[9px] text-ink-soft"
          >
            <span className="flex size-[22px] shrink-0 items-center justify-center">
              <MaskIcon src="/assets/icon-cloud-upload.svg" width={22} height={21} />
            </span>
            <span className="text-[16px] font-medium uppercase">Upload</span>
          </button>
        </div>

        <div className="mt-[37px] flex flex-col gap-[20px]">
          <Field label="Full Name" defaultValue={USER.name} />
          <Field label="Email Address" defaultValue={USER.email} />
          <Field label="Bio" defaultValue={USER.bio} multiline />
        </div>

        <Link
          href="/profile"
          className="mt-auto flex h-[45.78px] w-full items-center justify-center rounded-[5px] bg-brand text-[18px] font-medium uppercase text-white"
        >
          <span>Update Profile</span>
          <span className="ml-[14px] flex size-[21px] shrink-0 items-center justify-center">
            <MaskIcon src="/assets/icon-arrow-forward.svg" width={21} height={21} />
          </span>
        </Link>
      </div>
    </AppShell>
  );
}
