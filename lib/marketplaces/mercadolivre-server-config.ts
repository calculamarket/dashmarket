import { getMercadoLivreOAuthConfig } from "@/lib/marketplaces/mercadolivre-oauth";
import { resolvePublicSupabaseConfig } from "@/lib/supabase/public-config";

type MercadoLivreServerConfigOptions = {
  requireMercadoLivreCredentials?: boolean;
};

export function getMercadoLivreServerConfig(
  requestUrl: URL,
  options: MercadoLivreServerConfigOptions = {}
) {
  const requireMercadoLivreCredentials =
    options.requireMercadoLivreCredentials ?? true;
  const oauthConfig = getMercadoLivreOAuthConfig(requestUrl);
  const publicSupabaseConfig = resolvePublicSupabaseConfig();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? null;
  const missingVariables = [
    ...(!publicSupabaseConfig ? ["NEXT_PUBLIC_SUPABASE_URL"] : []),
    ...(!serviceRoleKey ? ["SUPABASE_SERVICE_ROLE_KEY"] : []),
    ...(requireMercadoLivreCredentials ? oauthConfig.missingVariables : [])
  ];

  if (
    missingVariables.length > 0 ||
    !publicSupabaseConfig ||
    !serviceRoleKey ||
    (requireMercadoLivreCredentials &&
      (!oauthConfig.clientId || !oauthConfig.clientSecret))
  ) {
    throw new Error(`Variaveis de ambiente incompletas: ${missingVariables.join(", ")}.`);
  }

  return {
    appUrl: oauthConfig.appUrl,
    clientId: oauthConfig.clientId ?? undefined,
    clientSecret: oauthConfig.clientSecret ?? undefined,
    redirectUri: oauthConfig.redirectUri,
    serviceRoleKey,
    supabaseUrl: publicSupabaseConfig.url
  };
}
