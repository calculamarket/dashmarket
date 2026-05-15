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

/** @type {import('next').NextConfig} */
const nextConfig = {
  env: {
    ...(supabaseUrl ? { NEXT_PUBLIC_SUPABASE_URL: supabaseUrl } : {}),
    ...(supabasePublicKey
      ? {
          NEXT_PUBLIC_SUPABASE_ANON_KEY: supabasePublicKey,
          NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: supabasePublicKey
        }
      : {})
  },
  outputFileTracingRoot: process.cwd(),
  reactStrictMode: true
};

export default nextConfig;
