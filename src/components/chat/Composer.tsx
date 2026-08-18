"use client";

import { useState } from "react";

import { MaskIcon } from "@/components/ui/MaskIcon";

type ComposerProps = {
  /**
   * Renders the leading add button from the advisor conversation, which opens
   * the Send Signal sheet. Omitted on the investor artboards.
   */
  onAttach?: () => void;
};

/** Message input pinned to the bottom of a conversation. */
export function Composer({ onAttach }: ComposerProps = {}) {
  const [draft, setDraft] = useState("");

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setDraft("");
      }}
      className={`sticky bottom-0 flex h-[59px] shrink-0 items-center bg-surface pr-[20px] shadow-[0_4px_12px_0_rgb(0_0_0/0.33)] ${
        onAttach ? "pl-[10px]" : "pl-[27px]"
      }`}
    >
      {onAttach && (
        <button
          type="button"
          aria-label="Post a signal"
          onClick={onAttach}
          className="mr-[10px] flex size-[38px] shrink-0 items-center justify-center text-ink"
        >
          <MaskIcon src="/assets/icon-add.svg" width={14} height={14} />
        </button>
      )}

      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        aria-label="Message"
        placeholder="Type a message here..."
        className="min-w-0 flex-1 bg-transparent text-[14px] text-ink outline-none placeholder:text-muted"
      />
      <button
        type="submit"
        aria-label="Send message"
        className="ml-3 flex size-[32px] shrink-0 items-center justify-center text-brand"
      >
        <MaskIcon src="/assets/icon-send.svg" width={20.13} height={17.25} />
      </button>
    </form>
  );
}
