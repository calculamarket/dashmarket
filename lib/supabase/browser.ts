"use client";

import { createClient } from "@supabase/supabase-js";
import { resolvePublicSupabaseConfig } from "@/lib/supabase/public-config";

export function createBrowserSupabaseClient() {
  const config = resolvePublicSupabaseConfig();

  if (!config) {
    throw new Error("Supabase ainda nao foi configurado no ambiente.");
  }

  return createClient(config.url, config.anonKey, {
    auth: {
      autoRefreshToken: true,
      detectSessionInUrl: true,
      persistSession: true
    }
  });
}
