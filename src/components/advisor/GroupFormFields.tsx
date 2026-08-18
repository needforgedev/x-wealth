"use client";

import Image from "next/image";
import { useState } from "react";

import { MaskIcon } from "@/components/ui/MaskIcon";
import { StepCheck } from "@/components/ui/StepCheck";
import { TextAreaField } from "@/components/ui/TextAreaField";
import { TextField } from "@/components/ui/TextField";
import { ToggleRow } from "@/components/ui/Toggle";
import { GROUP_DRAFT, GROUP_TAGS } from "@/lib/advisor";
import { TAG_TONES } from "@/lib/groups";

/** Circular group picture with the choose-picture action beneath it. */
function GroupPicture() {
  return (
    <div className="flex flex-col items-center">
      <span className="flex size-[54px] items-center justify-center rounded-full bg-group-avatar/[0.21]">
        <Image
          src="/assets/group-emblem.png"
          alt=""
          width={27}
          height={27}
          className="size-[27px] opacity-60"
        />
      </span>

      <button type="button" className="mt-[37px] flex items-center gap-[8px]">
        <Image
          src="/assets/icon-add-photo.svg"
          alt=""
          width={18}
          height={18}
          unoptimized
          className="size-[18px]"
        />
        <span className="text-[12px] font-semibold uppercase text-muted">Choose picture</span>
      </button>
    </div>
  );
}

/** Bordered 48px box holding the group's category chips and an add affordance. */
function TagsField() {
  return (
    <div>
      <p className="text-[13px] font-medium uppercase text-muted">Tags</p>
      <div className="mt-[10px] flex h-[48px] items-center gap-[4px] rounded-[4px] border border-line px-5">
        <ul className="flex min-w-0 flex-1 gap-[4px] overflow-hidden">
          {GROUP_TAGS.map((tag) => (
            <li
              key={tag.label}
              className={`flex h-[18px] shrink-0 items-center rounded-[2px] px-[11px] text-[10px] font-medium text-tag-ink ${TAG_TONES[tag.tone]}`}
            >
              {tag.label}
            </li>
          ))}
        </ul>
        <button
          type="button"
          aria-label="Add tag"
          className="flex size-[24px] shrink-0 items-center justify-center text-muted"
        >
          <MaskIcon src="/assets/icon-add.svg" width={12} height={12} />
        </button>
      </div>
    </div>
  );
}

/** Public handle, prefixed with the fixed domain and validated inline. */
function UrlField() {
  const [handle, setHandle] = useState<string>(GROUP_DRAFT.handle);

  return (
    <div>
      <label htmlFor="field-url" className="block text-[13px] font-medium uppercase text-muted">
        URL
      </label>
      <div className="mt-[10px] flex h-[48px] items-center rounded-[4px] border border-line px-[18px] focus-within:border-brand">
        <span className="shrink-0 text-[15px] text-ink">{GROUP_DRAFT.urlPrefix}</span>
        <input
          id="field-url"
          value={handle}
          onChange={(e) => setHandle(e.target.value)}
          placeholder="@username"
          className="ml-[20px] min-w-0 flex-1 bg-transparent text-[15px] text-ink outline-none placeholder:text-placeholder-soft"
        />
        {handle.length > 0 && <StepCheck tone="valid" label="Handle available" className="ml-2" />}
      </div>
    </div>
  );
}

/**
 * The group form body, shared by Create Group and Edit Group Info. The two
 * artboards differ only in whether the tags and public-URL fields are present.
 */
export function GroupFormFields({
  showTagsAndUrl = false,
  className = "",
}: {
  showTagsAndUrl?: boolean;
  className?: string;
}) {
  const [isPublic, setIsPublic] = useState<boolean>(GROUP_DRAFT.isPublic);

  return (
    <div className={className}>
      <GroupPicture />

      <TextField
        containerClassName="mt-[31px]"
        label="Group Name"
        defaultValue={GROUP_DRAFT.name}
      />

      <TextAreaField
        containerClassName="mt-[16px]"
        label="Description"
        limit={GROUP_DRAFT.descriptionLimit}
        defaultValue={GROUP_DRAFT.description}
      />

      {showTagsAndUrl && (
        <>
          <div className="mt-[16px]">
            <TagsField />
          </div>
          <div className="mt-[16px]">
            <UrlField />
          </div>
        </>
      )}

      <div className="mt-[16px] grid grid-cols-2 gap-x-[9px] gap-y-[16px]">
        <TextField
          label="Experience"
          trailing="chevron"
          readOnly
          defaultValue={GROUP_DRAFT.experience}
        />
        <TextField
          label="Segment"
          trailing="chevron"
          readOnly
          defaultValue={GROUP_DRAFT.segment}
        />
        <TextField
          label="Risk Profile"
          trailing="chevron"
          readOnly
          defaultValue={GROUP_DRAFT.risk}
        />
        <TextField
          label="Duration"
          trailing="chevron"
          readOnly
          defaultValue={GROUP_DRAFT.duration}
        />
      </div>

      <ToggleRow
        className="mt-[24px]"
        fieldLabel="Privacy"
        offLabel="Private"
        onLabel="Public"
        label="Group privacy"
        checked={isPublic}
        onCheckedChange={setIsPublic}
      />
    </div>
  );
}
