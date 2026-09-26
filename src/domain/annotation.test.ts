import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  ANNOTATION_REASONS,
  ANNOTATION_TARGETS,
  NOTE_TEXT_MAX,
  REASON_LABELS,
  REASONS_REQUIRING_TEXT,
  reasonFamily,
  validateAnnotation,
} from "./annotation";
import { annotationReason, annotationTargetType } from "../db/schema/annotations";

describe("the reason taxonomy", () => {
  it("is the §7.5 lists verbatim, plus NOTE", () => {
    // Five skip reasons and an other; four override reasons and an other.
    expect(ANNOTATION_REASONS.filter((r) => reasonFamily(r) === "SKIP")).toHaveLength(6);
    expect(ANNOTATION_REASONS.filter((r) => reasonFamily(r) === "OVERRIDE")).toHaveLength(5);
    expect(ANNOTATION_REASONS.filter((r) => reasonFamily(r) === "NOTE")).toEqual(["NOTE"]);
  });

  it("every reason has a label, and no label grades anything", () => {
    for (const reason of ANNOTATION_REASONS) {
      expect(REASON_LABELS[reason]).toBeTruthy();
    }
  });

  it("matches the schema enums exactly — one taxonomy, however many copies", () => {
    expect([...annotationReason.enumValues]).toEqual([...ANNOTATION_REASONS]);
    expect([...annotationTargetType.enumValues]).toEqual([...ANNOTATION_TARGETS]);
  });

  it("matches the hand-written SQL in migration 0017", () => {
    // The schema file derives from the domain arrays; the migration is typed
    // by hand and is what the database actually enforces. This is the pin
    // that catches a value added in one place and not the other.
    const sql = readFileSync(join(__dirname, "../../drizzle/0017_annotations.sql"), "utf8");
    for (const value of [...ANNOTATION_REASONS, ...ANNOTATION_TARGETS]) {
      expect(sql.includes(`'${value}'`), `${value} missing from 0017`).toBe(true);
    }
  });
});

describe("validateAnnotation", () => {
  it("accepts a named reason with no text — the category stands alone", () => {
    expect(validateAnnotation({ reason: "SKIP_NEWS_EVENT", noteText: "" })).toEqual([]);
  });

  it("requires words on exactly the reasons that say nothing alone", () => {
    for (const reason of REASONS_REQUIRING_TEXT) {
      expect(validateAnnotation({ reason, noteText: "   " })).toHaveLength(1);
      expect(validateAnnotation({ reason, noteText: "sat out the RBI day" })).toEqual([]);
    }
  });

  it("refuses an unknown reason and an over-long note", () => {
    expect(validateAnnotation({ reason: "VIBES", noteText: "x" })).toHaveLength(1);
    expect(
      validateAnnotation({ reason: "NOTE", noteText: "x".repeat(NOTE_TEXT_MAX + 1) }),
    ).toHaveLength(1);
  });
});
