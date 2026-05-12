import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type MarketplaceAccount = {
  id: string;
  organization_id: string;
  external_seller_id: string;
  account_name: string;
  site_id: string | null;
};

type MarketplaceCredentials = {
  access_token: string;
  refresh_token: string | null;
  token_expires_at: string | null;
  scopes: string[] | null;
};

type MarketplaceCredentialsUpsert = {
  account_id: string;
  access_token: string;
  refresh_token: string | null;
  token_expires_at: string | null;
  scopes: string[];
};

type TokenRefreshResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
};

type Advertiser = {
  advertiser_id: number | string;
  site_id?: string | null;
  advertiser_name?: string | null;
  account_name?: string | null;
};

type AdvertisersResponse = {
  advertisers?: Advertiser[];
};

type MetricPayload = {
  clicks?: number;
  prints?: number;
  cost?: number;
  acos?: number;
  advertising_items_quantity?: number;
  direct_items_quantity?: number;
  indirect_items_quantity?: number;
  total_amount?: number;
  direct_amount?: number;
  indirect_amount?: number;
};

type ProductAdsCampaign = {
  id: number | string;
  name?: string | null;
  status?: string | null;
  budget?: number | null;
  acos_target?: number | null;
  strategy?: string | null;
  channel?: string | null;
  metrics?: MetricPayload;
  metrics_summary?: MetricPayload;
};

type ProductAdsCampaignsResponse = {
  paging?: {
    total?: number;
    offset?: number;
    limit?: number;
  };
  results?: ProductAdsCampaign[];
};

type ProductAdsItem = {
  item_id: string;
  campaign_id?: number | string | null;
  title?: string | null;
  status?: string | null;
  metrics?: MetricPayload;
  metrics_summary?: MetricPayload;
} & MetricPayload;

type ProductAdsItemsResponse = {
  paging?: {
    total?: number;
    offset?: number;
    limit?: number;
  };
  results?: ProductAdsItem[];
};

type ListingRow = {
  product_id: string | null;
  external_item_id: string;
  seller_sku: string | null;
  title: string;
};

type ProductRow = {
  id: string;
  internal_sku: string;
};

type CampaignRow = {
  id: string;
  provider_campaign_id: string;
};

const DEFAULT_DAYS_BACK = 30;
const PAGE_SIZE = 50;
const METRICS = [
  "clicks",
  "prints",
  "cost",
  "acos",
  "advertising_items_quantity",
  "direct_items_quantity",
  "indirect_items_quantity",
  "total_amount",
  "direct_amount",
  "indirect_amount"
].join(",");

class MercadoAdsApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly path: string
  ) {
    super(message);
  }
}

function getEnv() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const clientId = process.env.MERCADOLIVRE_CLIENT_ID;
  const clientSecret = process.env.MERCADOLIVRE_CLIENT_SECRET;

  if (!supabaseUrl || !serviceRoleKey || !clientId || !clientSecret) {
    throw new Error("Variaveis de ambiente incompletas.");
  }

  return { clientId, clientSecret, serviceRoleKey, supabaseUrl };
}

function toNumber(value: unknown) {
  const numeric = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(numeric) ? numeric : 0;
}

function isTokenExpiring(credentials: MarketplaceCredentials) {
  if (!credentials.token_expires_at) return false;
  const expiresAt = new Date(credentials.token_expires_at).getTime();
  return Number.isFinite(expiresAt) && expiresAt < Date.now() + 5 * 60 * 1000;
}

function toDateOnly(date: Date) {
  return date.toISOString().slice(0, 10);
}

function getMetrics(record: { metrics?: MetricPayload; metrics_summary?: MetricPayload } & MetricPayload) {
  return record.metrics_summary ?? record.metrics ?? record;
}

function parseMercadoAdsError(status: number, path: string, body: string) {
  let apiMessage = body.trim();

  try {
    const parsed = JSON.parse(body) as {
      error?: string;
      message?: string;
      cause?: Array<{ message?: string }>;
    };
    apiMessage =
      parsed.message ??
      parsed.error ??
      parsed.cause?.map((cause) => cause.message).filter(Boolean).join("; ") ??
      apiMessage;
  } catch {
    // Keep the plain text body.
  }

  if ([401, 403].includes(status)) {
    return `Mercado Ads recusou o acesso (${status}). Verifique se o app tem permissao de publicidade e se a conta tem Product Ads habilitado. ${apiMessage}`;
  }

  if (status === 404) {
    return `Endpoint de Mercado Ads nao encontrado para esta conta (${status}). ${apiMessage}`;
  }

  return `Mercado Ads respondeu ${status} em ${path}. ${apiMessage}`;
}

async function refreshAccessToken(
  credentials: MarketplaceCredentials,
  accountId: string,
  saveCredentials: (payload: MarketplaceCredentialsUpsert) => Promise<void>,
  clientId: string,
  clientSecret: string
) {
  if (!credentials.refresh_token || !isTokenExpiring(credentials)) {
    return credentials.access_token;
  }

  const payload = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: credentials.refresh_token
  });

  const response = await fetch("https://api.mercadolibre.com/oauth/token", {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/x-www-form-urlencoded"
    },
    body: payload
  });

  if (!response.ok) {
    throw new Error(`Mercado Livre recusou refresh do token: ${response.status}`);
  }

  const token = (await response.json()) as TokenRefreshResponse;
  const expiresAt = token.expires_in
    ? new Date(Date.now() + token.expires_in * 1000).toISOString()
    : credentials.token_expires_at;

  await saveCredentials({
    account_id: accountId,
    access_token: token.access_token,
    refresh_token: token.refresh_token ?? credentials.refresh_token,
    token_expires_at: expiresAt,
    scopes: token.scope ? token.scope.split(" ") : credentials.scopes ?? []
  });

  return token.access_token;
}

async function mercadoAdsRequest<T>(
  path: string,
  accessToken: string,
  apiVersion: "1" | "2"
) {
  const response = await fetch(`https://api.mercadolibre.com${path}`, {
    headers: {
      "api-version": apiVersion,
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json"
    }
  });

  if (!response.ok) {
    const body = await response.text();
    throw new MercadoAdsApiError(
      parseMercadoAdsError(response.status, path, body),
      response.status,
      path
    );
  }

  return response.json() as Promise<T>;
}

async function mercadoAdsRequestWithFallback<T>(
  paths: string[],
  accessToken: string,
  apiVersion: "1" | "2"
) {
  let lastError: unknown;

  for (const path of paths) {
    try {
      return await mercadoAdsRequest<T>(path, accessToken, apiVersion);
    } catch (error) {
      lastError = error;
      if (!(error instanceof MercadoAdsApiError) || ![404, 405].includes(error.status)) {
        throw error;
      }
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Nao foi possivel consultar o Mercado Ads.");
}

async function getAdvertiser(
  accessToken: string,
  siteId: string | null
) {
  const payload = await mercadoAdsRequest<AdvertisersResponse>(
    "/advertising/advertisers?product_id=PADS",
    accessToken,
    "1"
  );
  const advertisers = payload.advertisers ?? [];

  return (
    advertisers.find((advertiser) => advertiser.site_id === siteId) ??
    advertisers[0] ??
    null
  );
}

async function fetchCampaigns(
  advertiserId: number | string,
  advertiserSiteId: string,
  accessToken: string,
  dateFrom: string,
  dateTo: string
) {
  const campaigns: ProductAdsCampaign[] = [];
  let offset = 0;
  let total = 0;

  do {
    const params = new URLSearchParams({
      limit: String(PAGE_SIZE),
      offset: String(offset),
      date_from: dateFrom,
      date_to: dateTo,
      metrics: METRICS,
      metrics_summary: "true"
    });

    const payload = await mercadoAdsRequestWithFallback<ProductAdsCampaignsResponse>(
      [
        `/advertising/${advertiserSiteId}/advertisers/${advertiserId}/product_ads/campaigns/search?${params.toString()}`,
        `/marketplace/advertising/${advertiserSiteId}/advertisers/${advertiserId}/product_ads/campaigns/search?${params.toString()}`,
        `/advertising/advertisers/${advertiserId}/product_ads/campaigns?${params.toString()}`
      ],
      accessToken,
      "2"
    );

    const results = payload.results ?? [];
    campaigns.push(...results);
    total = payload.paging?.total ?? total;
    offset += PAGE_SIZE;
  } while (campaigns.length < total);

  return campaigns;
}

async function fetchAds(
  advertiserId: number | string,
  advertiserSiteId: string,
  accessToken: string,
  dateFrom: string,
  dateTo: string
) {
  const ads: ProductAdsItem[] = [];
  let offset = 0;
  let total = 0;

  do {
    const params = new URLSearchParams({
      limit: String(PAGE_SIZE),
      offset: String(offset),
      date_from: dateFrom,
      date_to: dateTo,
      metrics: METRICS,
      metrics_summary: "true"
    });

    const payload = await mercadoAdsRequestWithFallback<ProductAdsItemsResponse>(
      [
        `/advertising/${advertiserSiteId}/advertisers/${advertiserId}/product_ads/ads/search?${params.toString()}`,
        `/marketplace/advertising/${advertiserSiteId}/advertisers/${advertiserId}/product_ads/ads/search?${params.toString()}`,
        `/advertising/advertisers/${advertiserId}/product_ads/items?${params.toString()}`
      ],
      accessToken,
      "2"
    );

    const results = payload.results ?? [];
    ads.push(...results);
    total = payload.paging?.total ?? total;
    offset += PAGE_SIZE;
  } while (ads.length < total);

  return ads;
}

export async function POST(request: Request) {
  try {
    const { clientId, clientSecret, serviceRoleKey, supabaseUrl } = getEnv();
    const authorization = request.headers.get("authorization");
    const token = authorization?.replace(/^Bearer\s+/i, "");
    const body = (await request.json()) as {
      organizationId?: string;
      daysBack?: number;
    };
    const organizationId = body.organizationId;
    const daysBack =
      typeof body.daysBack === "number" && body.daysBack > 0
        ? Math.min(Math.floor(body.daysBack), 90)
        : DEFAULT_DAYS_BACK;

    if (!token || !organizationId) {
      return NextResponse.json(
        { error: "Sessao e organizacao sao obrigatorias." },
        { status: 401 }
      );
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false }
    });

    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData.user) {
      return NextResponse.json({ error: "Sessao invalida." }, { status: 401 });
    }

    const { data: membership, error: membershipError } = await supabase
      .from("organization_members")
      .select("organization_id")
      .eq("organization_id", organizationId)
      .eq("user_id", userData.user.id)
      .maybeSingle();

    if (membershipError) throw membershipError;
    if (!membership) {
      return NextResponse.json({ error: "Sem acesso a empresa." }, { status: 403 });
    }

    const { data: account, error: accountError } = await supabase
      .from("marketplace_accounts")
      .select("id, organization_id, external_seller_id, account_name, site_id")
      .eq("organization_id", organizationId)
      .eq("provider", "mercadolivre")
      .eq("status", "connected")
      .order("last_sync_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (accountError) throw accountError;
    if (!account) {
      return NextResponse.json(
        { error: "Nenhuma conta Mercado Livre conectada." },
        { status: 404 }
      );
    }

    const { data: credentials, error: credentialsError } = await supabase
      .from("marketplace_account_credentials")
      .select("access_token, refresh_token, token_expires_at, scopes")
      .eq("account_id", account.id)
      .maybeSingle();

    if (credentialsError) throw credentialsError;
    if (!credentials) {
      return NextResponse.json(
        { error: "Credenciais do Mercado Livre nao encontradas." },
        { status: 404 }
      );
    }

    const currentAccount = account as MarketplaceAccount;
    const accessToken = await refreshAccessToken(
      credentials as MarketplaceCredentials,
      currentAccount.id,
      async (payload) => {
        const { error } = await supabase
          .from("marketplace_account_credentials")
          .upsert(payload);

        if (error) throw error;
      },
      clientId,
      clientSecret
    );

    const { data: syncRun, error: syncRunError } = await supabase
      .from("sync_runs")
      .insert({
        organization_id: organizationId,
        marketplace_account_id: currentAccount.id,
        provider: "mercadolivre",
        resource: "advertising",
        status: "running",
        metadata: { days_back: daysBack, source: "manual" }
      })
      .select("id")
      .single();

    if (syncRunError) throw syncRunError;

    try {
      const dateTo = toDateOnly(new Date());
      const dateFrom = toDateOnly(
        new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000)
      );
      const advertiser = await getAdvertiser(accessToken, currentAccount.site_id);

      if (!advertiser) {
        await supabase
          .from("sync_runs")
          .update({
            status: "failed",
            finished_at: new Date().toISOString(),
            error_message: "Nenhum anunciante Product Ads encontrado."
          })
          .eq("id", syncRun.id);

        return NextResponse.json(
          { error: "Nenhum anunciante Product Ads encontrado." },
          { status: 404 }
        );
      }

      const advertiserId = advertiser.advertiser_id;
      const advertiserSiteId = advertiser.site_id ?? currentAccount.site_id ?? "MLB";
      const campaigns = await fetchCampaigns(
        advertiserId,
        advertiserSiteId,
        accessToken,
        dateFrom,
        dateTo
      );
      const ads = await fetchAds(
        advertiserId,
        advertiserSiteId,
        accessToken,
        dateFrom,
        dateTo
      );
      const campaignIds = new Set([
        ...campaigns.map((campaign) => String(campaign.id)),
        ...ads
          .map((ad) => ad.campaign_id)
          .filter((campaignId): campaignId is string | number => campaignId !== null && campaignId !== undefined)
          .map(String)
      ]);

      if (campaignIds.size > 0) {
        const { error: campaignsUpsertError } = await supabase
          .from("advertising_campaigns")
          .upsert(
            Array.from(campaignIds).map((campaignId) => {
              const campaign = campaigns.find(
                (currentCampaign) => String(currentCampaign.id) === campaignId
              );

              return {
                organization_id: organizationId,
                marketplace_account_id: currentAccount.id,
                provider_campaign_id: campaignId,
                name: campaign?.name ?? `Campanha ${campaignId}`,
                campaign_type: campaign?.strategy ?? "product_ads",
                status: campaign?.status ?? null,
                budget_amount: campaign?.budget ?? null,
                daily_goal_amount: campaign?.acos_target ?? null,
                raw_payload: {
                  advertiser,
                  advertiser_site_id: advertiserSiteId,
                  campaign
                }
              };
            }),
            { onConflict: "marketplace_account_id,provider_campaign_id" }
          );

        if (campaignsUpsertError) throw campaignsUpsertError;
      }

      const { data: savedCampaignsData, error: savedCampaignsError } =
        campaignIds.size > 0
          ? await supabase
              .from("advertising_campaigns")
              .select("id, provider_campaign_id")
              .eq("marketplace_account_id", currentAccount.id)
              .in("provider_campaign_id", Array.from(campaignIds))
          : { data: [], error: null };

      if (savedCampaignsError) throw savedCampaignsError;

      const campaignsByProviderId = new Map(
        ((savedCampaignsData ?? []) as CampaignRow[]).map((campaign) => [
          campaign.provider_campaign_id,
          campaign.id
        ])
      );
      const itemIds = Array.from(new Set(ads.map((ad) => ad.item_id)));
      const { data: listingsData, error: listingsError } =
        itemIds.length > 0
          ? await supabase
              .from("marketplace_listings")
              .select("product_id, external_item_id, seller_sku, title")
              .eq("marketplace_account_id", currentAccount.id)
              .in("external_item_id", itemIds)
          : { data: [], error: null };

      if (listingsError) throw listingsError;

      const listingsByItemId = new Map(
        ((listingsData ?? []) as ListingRow[]).map((listing) => [
          listing.external_item_id,
          listing
        ])
      );
      const productCandidates = new Map<string, { internal_sku: string; title: string }>();

      for (const ad of ads) {
        const listing = listingsByItemId.get(ad.item_id);
        if (listing?.product_id) continue;

        const sku = listing?.seller_sku ?? ad.item_id;
        productCandidates.set(sku, {
          internal_sku: sku,
          title: ad.title ?? listing?.title ?? sku
        });
      }

      if (productCandidates.size > 0) {
        const { error: productsUpsertError } = await supabase
          .from("products")
          .upsert(
            Array.from(productCandidates.values()).map((product) => ({
              organization_id: organizationId,
              internal_sku: product.internal_sku,
              title: product.title,
              status: "active"
            })),
            { onConflict: "organization_id,internal_sku" }
          );

        if (productsUpsertError) throw productsUpsertError;
      }

      const skus = Array.from(productCandidates.keys());
      const { data: productsData, error: productsError } =
        skus.length > 0
          ? await supabase
              .from("products")
              .select("id, internal_sku")
              .eq("organization_id", organizationId)
              .in("internal_sku", skus)
          : { data: [], error: null };

      if (productsError) throw productsError;

      const productsBySku = new Map(
        ((productsData ?? []) as ProductRow[]).map((product) => [
          product.internal_sku,
          product.id
        ])
      );
      const metricRows = ads
        .map((ad) => {
          const campaignId = ad.campaign_id
            ? campaignsByProviderId.get(String(ad.campaign_id))
            : null;

          if (!campaignId) return null;

          const listing = listingsByItemId.get(ad.item_id);
          const fallbackSku = listing?.seller_sku ?? ad.item_id;
          const productId = listing?.product_id ?? productsBySku.get(fallbackSku);
          if (!productId) return null;

          const metrics = getMetrics(ad);
          const attributedRevenue =
            toNumber(metrics.total_amount) ||
            toNumber(metrics.direct_amount) + toNumber(metrics.indirect_amount);
          const attributedOrders =
            toNumber(metrics.advertising_items_quantity) ||
            toNumber(metrics.direct_items_quantity) +
              toNumber(metrics.indirect_items_quantity);

          return {
            organization_id: organizationId,
            campaign_id: campaignId,
            product_id: productId,
            metric_date: dateTo,
            impressions: Math.round(toNumber(metrics.prints)),
            clicks: Math.round(toNumber(metrics.clicks)),
            ad_spend_amount: toNumber(metrics.cost),
            attributed_revenue_amount: attributedRevenue,
            attributed_orders: Math.round(attributedOrders),
            acos: metrics.acos ?? null,
            raw_payload: {
              advertiser,
              advertiser_site_id: advertiserSiteId,
              date_from: dateFrom,
              date_to: dateTo,
              ad
            }
          };
        })
        .filter((row): row is NonNullable<typeof row> => Boolean(row));

      if (metricRows.length > 0) {
        const { error: metricsUpsertError } = await supabase
          .from("advertising_metrics")
          .upsert(metricRows, {
            onConflict: "campaign_id,product_id,metric_date"
          });

        if (metricsUpsertError) throw metricsUpsertError;
      }

      const now = new Date().toISOString();

      await supabase
        .from("marketplace_accounts")
        .update({ last_sync_at: now })
        .eq("id", currentAccount.id);

      await supabase
        .from("sync_runs")
        .update({
          status: "success",
          finished_at: now,
          records_processed: metricRows.length,
          metadata: {
            advertiser_id: advertiserId,
            advertiser_site_id: advertiserSiteId,
            days_back: daysBack,
            campaigns: campaignIds.size,
            ads: ads.length,
            ad_spend_amount: metricRows.reduce(
              (sum, metric) => sum + metric.ad_spend_amount,
              0
            )
          }
        })
        .eq("id", syncRun.id);

      return NextResponse.json({
        accountName: currentAccount.account_name,
        advertiserId,
        advertiserSiteId,
        daysBack,
        campaigns: campaignIds.size,
        ads: ads.length,
        metrics: metricRows.length,
        adSpend: metricRows.reduce((sum, metric) => sum + metric.ad_spend_amount, 0),
        attributedRevenue: metricRows.reduce(
          (sum, metric) => sum + metric.attributed_revenue_amount,
          0
        ),
        syncedAt: now
      });
    } catch (error) {
      await supabase
        .from("sync_runs")
        .update({
          status: "failed",
          finished_at: new Date().toISOString(),
          error_message:
            error instanceof Error ? error.message : "Falha ao sincronizar publicidade."
        })
        .eq("id", syncRun.id);

      throw error;
    }
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Nao foi possivel sincronizar publicidade."
      },
      { status: 500 }
    );
  }
}
