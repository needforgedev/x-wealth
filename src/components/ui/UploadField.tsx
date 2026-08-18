import Image from "next/image";

import { MaskIcon } from "@/components/ui/MaskIcon";

type UploadFieldProps = {
  label: string;
  action: string;
  containerClassName?: string;
};

/** Uppercase label above a 108px drop box with a cloud glyph and an add action. */
export function UploadField({ label, action, containerClassName = "" }: UploadFieldProps) {
  return (
    <div className={containerClassName}>
      <p className="text-[13px] font-medium uppercase text-muted">{label}</p>

      <button
        type="button"
        className="mt-[10px] flex h-[108px] w-full items-center justify-center gap-[31px] rounded-[4px] border border-line"
      >
        <Image
          src="/assets/icon-cloud-upload.svg"
          alt=""
          width={35}
          height={35}
          unoptimized
          className="size-[35px]"
        />
        <span className="flex items-center gap-[5px] text-muted">
          <MaskIcon src="/assets/icon-add.svg" width={11.67} height={11.67} />
          <span className="text-[12px] font-semibold uppercase">{action}</span>
        </span>
      </button>
    </div>
  );
}
