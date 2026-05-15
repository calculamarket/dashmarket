const MERCADO_LIVRE_CALLBACK_PATH =
  "/api/marketplaces/mercadolivre/callback";

const CLIENT_ID_KEYS = [
  "MERCADOLIVRE_CLIENT_ID",
  "MERCADO_LIVRE_CLIENT_ID",
  "ML_CLIENT_ID",
  "MELI_CLIENT_ID"
];

const CLIENT_SECRET_KEYS = [
  "MERCADOLIVRE_CLIENT_SECRET",
  "MERCADO_LIVRE_CLIENT_SECRET",
  "ML_CLIENT_SECRET",
  "MELI_CLIENT_SECRET"
];

const REDIRECT_URI_KEYS = [
  "MERCADOLIVRE_REDIRECT_URI",
  "MERCADO_LIVRE_REDIRECT_URI",
  "ML_REDIRECT_URI",
  "MELI_REDIRECT_URI"
];

function normalizeEnvValue(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function readFirstEnvValue(keys: string[]) {
  for (const key of keys) {
    const value = normalizeEnvValue(process.env[key]);

    if (value) {
      return { key, value };
    }
  }

  return { key: keys[0], value: null };
}

function isLocalHostname(hostname: string) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

function shouldIgnoreLocalConfiguredUrl(configuredUrl: URL, requestUrl: URL) {
  return isLocalHostname(configuredUrl.hostname) && !isLocalHostname(requestUrl.hostname);
}

export function resolveMercadoLivreRedirectUri(requestUrl: URL) {
  const configuredRedirectUri = readFirstEnvValue(REDIRECT_URI_KEYS);

  if (configuredRedirectUri.value) {
    try {
      const configuredUrl = new URL(configuredRedirectUri.value);

      if (!shouldIgnoreLocalConfiguredUrl(configuredUrl, requestUrl)) {
        return configuredRedirectUri.value;
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

export function getMercadoLivreOAuthConfig(requestUrl: URL) {
  const clientId = readFirstEnvValue(CLIENT_ID_KEYS);
  const clientSecret = readFirstEnvValue(CLIENT_SECRET_KEYS);
  const redirectUri = resolveMercadoLivreRedirectUri(requestUrl);
  const appUrl = resolveAppUrl(requestUrl);

  return {
    appUrl,
    clientId: clientId.value,
    clientIdKey: clientId.key,
    clientSecret: clientSecret.value,
    clientSecretKey: clientSecret.key,
    missingVariables: [
      ...(!clientId.value ? [CLIENT_ID_KEYS[0]] : []),
      ...(!clientSecret.value ? [CLIENT_SECRET_KEYS[0]] : [])
    ],
    redirectUri
  };
}

export function missingMercadoLivreConnectionVariables() {
  return getMercadoLivreOAuthConfig(new URL("http://localhost")).missingVariables;
}
