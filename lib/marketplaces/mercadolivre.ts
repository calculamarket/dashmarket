import type {
  AuthorizationUrlInput,
  MarketplaceAdapter
} from "@/lib/marketplaces/types";

const AUTH_HOST_BY_SITE: Record<string, string> = {
  MLA: "https://auth.mercadolibre.com.ar",
  MLB: "https://auth.mercadolivre.com.br",
  MLM: "https://auth.mercadolibre.com.mx",
  MLC: "https://auth.mercadolibre.cl",
  MCO: "https://auth.mercadolibre.com.co",
  MLU: "https://auth.mercadolibre.com.uy"
};

export const mercadoLivreAdapter: MarketplaceAdapter = {
  provider: "mercadolivre",
  displayName: "Mercado Livre",
  capabilities: [
    "orders",
    "inventory",
    "advertising",
    "listings",
    "promotions",
    "notifications"
  ],
  buildAuthorizationUrl(input: AuthorizationUrlInput) {
    const siteId = input.siteId ?? "MLB";
    const authHost = AUTH_HOST_BY_SITE[siteId] ?? AUTH_HOST_BY_SITE.MLB;
    const params = new URLSearchParams({
      response_type: "code",
      client_id: input.clientId,
      redirect_uri: input.redirectUri,
      state: input.state
    });

    return `${authHost}/authorization?${params.toString()}`;
  }
};

export async function mercadoLivreApiRequest<T>(
  path: string,
  accessToken: string,
  init: RequestInit = {}
): Promise<T> {
  const response = await fetch(`https://api.mercadolibre.com${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...init.headers
    }
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Mercado Livre API error ${response.status}: ${body}`);
  }

  return response.json() as Promise<T>;
}
