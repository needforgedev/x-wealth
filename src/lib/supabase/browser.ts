"use client";

import { createBrowserClient } from "@supabase/ssr";

import { supabasePublishableKey, supabaseUrl } from "./env";

/**
 * Supabase client for the browser.
 *
 * Auth and (later) Storage uploads only. The browser never queries application
 * data — every read and write goes through a Server Action backed by Drizzle.
 * That constraint is what keeps authorisation server-side and stops RLS from
 * quietly becoming load-bearing.
 */
export function createSupabaseBrowserClient() {
  return createBrowserClient(supabaseUrl(), supabasePublishableKey());
}
