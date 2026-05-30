function firstEnv(keys) {
  for (const key of keys) {
    const value = process.env[key]?.trim();

    if (value) return value;
  }

  return undefined;
}

const supabaseUrl = firstEnv(["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_URL"]);
const supabasePublicKey = firstEnv([
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_ANON_KEY",
  "SUPABASE_PUBLISHABLE_KEY"
]);
const dashmarketDefaultSupabaseUrl = "https://vbbuzivobekywrslizps.supabase.co";
const dashmarketDefaultSupabasePublishableKey =
  "sb_publishable_NG6umNstsmZbXGrGxpatBA_-HK4JHdY";

/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },
  env: {
    NEXT_PUBLIC_SUPABASE_URL: supabaseUrl ?? dashmarketDefaultSupabaseUrl,
    NEXT_PUBLIC_SUPABASE_ANON_KEY:
      supabasePublicKey ?? dashmarketDefaultSupabasePublishableKey,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
      supabasePublicKey ?? dashmarketDefaultSupabasePublishableKey
  },
  outputFileTracingRoot: process.cwd(),
  reactStrictMode: true
};

export default nextConfig;
