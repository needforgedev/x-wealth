/**
 * Grant platform-ops access.
 *
 *   npm run grant-admin -- +919757242802
 *   npm run grant-admin -- +919757242802 --revoke
 *
 * There is deliberately no self-serve path to becoming an admin, so this is the
 * only way in. It talks to Postgres directly rather than through the app,
 * because granting yourself access through a UI you also administer is a
 * circular trust problem.
 */
import { config } from "dotenv";
import postgres from "postgres";

config({ path: ".env.local" });

const [phoneArg, ...flags] = process.argv.slice(2);
const revoke = flags.includes("--revoke");

if (!phoneArg) {
  console.error("Usage: npm run grant-admin -- +919757242802 [--revoke]");
  process.exit(1);
}

const phone = phoneArg.replace(/[\s\-()]/g, "");
const bare = phone.replace(/^\+/, ""); // Supabase stores phones without the +

const url = process.env.DIRECT_URL;
if (!url) {
  console.error("DIRECT_URL is not set in .env.local");
  process.exit(1);
}

const sql = postgres(url, { ssl: "require", max: 1, idle_timeout: 10 });

try {
  const users = await sql`
    select id, phone, created_at from auth.users
    where phone in (${phone}, ${bare})
    order by created_at desc limit 1`;

  if (users.length === 0) {
    console.error(
      `No user with phone ${phone}.\n` +
        "Sign in through the app first — Supabase Auth creates the user, this only grants a role.",
    );
    process.exit(1);
  }

  const user = users[0];

  if (revoke) {
    const gone = await sql`
      delete from platform_admins where user_id = ${user.id} returning id`;
    console.log(gone.length ? `revoked ops access for ${phone}` : `${phone} was not an admin`);
  } else {
    await sql`
      insert into platform_admins (user_id, note)
      values (${user.id}, ${"granted via scripts/grant-admin.mjs"})
      on conflict (user_id) do nothing`;
    console.log(`granted ops access to ${phone}`);
    console.log("open /ops");
  }

  const admins = await sql`
    select u.phone from platform_admins a join auth.users u on u.id = a.user_id
    order by a.created_at`;
  console.log(`\nplatform admins (${admins.length}): ${admins.map((a) => a.phone).join(", ") || "none"}`);
} catch (error) {
  console.error("failed:", error.message);
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 5 });
}
