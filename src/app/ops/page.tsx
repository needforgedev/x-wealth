import { redirect } from "next/navigation";

import { currentIdentity } from "@/server/identity";
import { listForReview } from "@/server/actions/ops";
import { ReviewQueue } from "./ReviewQueue";

export const dynamic = "force-dynamic";

/**
 * Platform ops — the verification queue.
 *
 * Access is membership of `platform_admins`, checked server-side. There is no
 * self-serve path to becoming an admin; grant one with
 * `npm run grant-admin -- +91XXXXXXXXXX`.
 */
export default async function OpsPage() {
  const identity = await currentIdentity();
  if (!identity) redirect("/");

  if (!identity.isAdmin) {
    return (
      <main className="mx-auto max-w-[760px] px-6 py-16">
        <h1 className="text-[22px] font-semibold text-ink">Platform ops</h1>
        <p className="mt-3 text-[15px] text-muted">
          This account is not a platform admin. Grant it from the repo root:
        </p>
        <pre className="mt-4 overflow-x-auto rounded-[6px] bg-surface-alt p-4 text-[13px] text-ink">
          npm run grant-admin -- +91XXXXXXXXXX
        </pre>
      </main>
    );
  }

  const result = await listForReview();
  if (!result.ok) {
    return (
      <main className="mx-auto max-w-[760px] px-6 py-16">
        <p className="text-[15px] text-danger-ink">{result.error}</p>
      </main>
    );
  }

  return <ReviewQueue pending={result.data.pending} decided={result.data.decided} />;
}
