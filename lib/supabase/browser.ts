"use client";

import { createClient } from "@supabase/supabase-js";

function readFirstEnvValue(keys: string[]) {
  for (const key of keys) {
    const value = process.env[key]?.trim();

    if (value) return value;
  }

  return null;
}

export function createBrowserSupabaseClient() {
  const supabaseUrl = readFirstEnvValue([
    "NEXT_PUBLIC_SUPABASE_URL",
    "SUPABASE_URL"
  ]);
  const supabaseAnonKey = readFirstEnvValue([
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    "SUPABASE_ANON_KEY",
    "SUPABASE_PUBLISHABLE_KEY"
  ]);

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Supabase ainda nao foi configurado no ambiente.");
  }

  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      autoRefreshToken: true,
      detectSessionInUrl: true,
      persistSession: true
    }
  });
}
