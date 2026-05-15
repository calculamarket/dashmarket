const MERCADO_LIVRE_CALLBACK_PATH =
  "/api/marketplaces/mercadolivre/callback";

function normalizeEnvValue(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function isLocalHostname(hostname: string) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

function shouldIgnoreLocalConfiguredUrl(configuredUrl: URL, requestUrl: URL) {
  return isLocalHostname(configuredUrl.hostname) && !isLocalHostname(requestUrl.hostname);
}

export function resolveMercadoLivreRedirectUri(requestUrl: URL) {
  const configuredRedirectUri = normalizeEnvValue(
    process.env.MERCADOLIVRE_REDIRECT_URI
  );

  if (configuredRedirectUri) {
    try {
      const configuredUrl = new URL(configuredRedirectUri);

      if (!shouldIgnoreLocalConfiguredUrl(configuredUrl, requestUrl)) {
        return configuredRedirectUri;
      }
    } catch {
      // Invalid values fall back to the current app origin below.
    }
  }

  return `${requestUrl.origin}${MERCADO_LIVRE_CALLBACK_PATH}`;
}

export function resolveAppUrl(requestUrl: URL) {
  const configuredAppUrl = normalizeEnvValue(process.env.NEXT_PUBLIC_APP_URL);

  if (configuredAppUrl) {
    try {
      const configuredUrl = new URL(configuredAppUrl);

      if (!shouldIgnoreLocalConfiguredUrl(configuredUrl, requestUrl)) {
        return configuredUrl.origin;
      }
    } catch {
      // Invalid values fall back to the current request origin below.
    }
  }

  return requestUrl.origin;
}

export function missingMercadoLivreConnectionVariables() {
  return [
    ["MERCADOLIVRE_CLIENT_ID", process.env.MERCADOLIVRE_CLIENT_ID],
    ["MERCADOLIVRE_CLIENT_SECRET", process.env.MERCADOLIVRE_CLIENT_SECRET]
  ]
    .filter(([, value]) => !normalizeEnvValue(value))
    .map(([key]) => key);
}
