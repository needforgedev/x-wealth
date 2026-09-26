"use server";

import { db } from "@/db";
import { annotations } from "@/db/schema";
import {
  ANNOTATION_TARGETS,
  validateAnnotation,
  type AnnotationReason,
  type AnnotationTarget,
} from "@/domain/annotation";
import { NotAuthorisedError, requireUser } from "@/server/identity";
import { ownsAnnotationTarget } from "@/server/queries/annotations";

import type { ActionResult } from "./auth";

/**
 * Record why, beside what. `plan.md` W17, `CLAUDE.md` §7.5 and §8.8.
 *
 * The one writing action in the annotation layer, and the only kind of write
 * it knows: INSERT. There is no update action and no delete action to call —
 * revising a note goes through here too, as a new row naming what it
 * supersedes, and the database's trigger refuses everything else. What makes
 * a reason worth aggregating later (W21) is that it was recorded at the time,
 * so the cheapest possible path from "I skipped that one" to a durable row is
 * the entire design goal of this file.
 */

export type NewAnnotationInput = {
  targetType: AnnotationTarget;
  targetId: string;
  structuredReason: AnnotationReason;
  noteText: string;
  /** The note this one revises, when editing. The DB keeps the chain honest. */
  supersedesId?: string;
};

export async function addAnnotation(
  input: NewAnnotationInput,
): Promise<ActionResult<{ annotationId: string }>> {
  if (!ANNOTATION_TARGETS.includes(input.targetType)) {
    return { ok: false, error: "That is not something a note can attach to." };
  }

  const noteText = input.noteText.trim();
  const issues = validateAnnotation({ reason: input.structuredReason, noteText });
  if (issues.length > 0) {
    return { ok: false, error: issues[0].message };
  }

  try {
    const { user } = await requireUser();

    // Ownership in a query, not trusted from the wire. The 0017 trigger
    // re-checks existence and supersede integrity below us either way.
    const owns = await ownsAnnotationTarget({
      targetType: input.targetType,
      targetId: input.targetId,
      userId: user.id,
    });
    if (!owns) return { ok: false, error: "No such record." };

    const [row] = await db()
      .insert(annotations)
      .values({
        userId: user.id,
        targetType: input.targetType,
        targetId: input.targetId,
        structuredReason: input.structuredReason,
        noteText,
        supersedesId: input.supersedesId ?? null,
      })
      .returning({ id: annotations.id });

    return { ok: true, data: { annotationId: row.id } };
  } catch (error) {
    if (error instanceof NotAuthorisedError) return { ok: false, error: "Sign in first." };
    // The trigger's messages are written for people; pass them through.
    return {
      ok: false,
      error: error instanceof Error ? error.message : "The note could not be recorded.",
    };
  }
}
