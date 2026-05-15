export type PublicSupabaseConfig = {
  anonKey: string;
  source: "env" | "dashmarket-default";
  url: string;
};

const DASHMARKET_DEFAULT_SUPABASE_URL =
  "https://vbbuzivobekywrslizps.supabase.co";
const DASHMARKET_DEFAULT_SUPABASE_PUBLISHABLE_KEY =
  "sb_publishable_NG6umNstsmZbXGrGxpatBA_-HK4JHdY";

export function readFirstEnvValue(keys: string[]) {
  for (const key of keys) {
    const value = process.env[key]?.trim();

    if (value) return value;
  }

  return null;
}

export function resolvePublicSupabaseConfig(
  includeDefault = true
): PublicSupabaseConfig | null {
  const url = readFirstEnvValue(["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_URL"]);
  const anonKey = readFirstEnvValue([
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    "SUPABASE_ANON_KEY",
    "SUPABASE_PUBLISHABLE_KEY"
  ]);

  if (url && anonKey) {
    return {
      anonKey,
      source: "env",
      url
    };
  }

  if (!includeDefault) return null;

  return {
    anonKey: DASHMARKET_DEFAULT_SUPABASE_PUBLISHABLE_KEY,
    source: "dashmarket-default",
    url: DASHMARKET_DEFAULT_SUPABASE_URL
  };
}
