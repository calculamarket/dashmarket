import { NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getMercadoLivreServerConfig } from "@/lib/marketplaces/mercadolivre-server-config";

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

type ListingRow = {
  product_id: string | null;
  external_item_id: string;
  seller_sku: string | null;
  title: string;
  permalink: string | null;
  raw_payload: {
    attributes?: MercadoLivreAttribute[] | null;
    category_id?: string | null;
    seller_custom_field?: string | null;
    status?: string | null;
    user_product_id?: string | null;
  } | null;
};

type MercadoLivreAttribute = {
  id?: string;
  name?: string;
  value_id?: string | null;
  value_name?: string | null;
};

type MercadoLivreItem = {
  id: string;
  title?: string | null;
  category_id?: string | null;
  seller_custom_field?: string | null;
  sold_quantity?: number | null;
  status?: string | null;
  permalink?: string | null;
  user_product_id?: string | null;
  attributes?: MercadoLivreAttribute[];
};

type MercadoLivreCategory = {
  id: string;
  name: string;
};

type MercadoLivreSearchItem = {
  id: string;
  title?: string | null;
  seller?: {
    id?: number | string | null;
    nickname?: string | null;
  };
};

type MercadoLivreSearchResponse = {
  paging?: {
    total?: number;
  };
  results?: MercadoLivreSearchItem[];
};

type MercadoLivreUserItemsSearchResponse = {
  results?: string[];
  paging?: {
    total?: number;
  };
};

type VisitsTimeWindowResponse = {
  results?: Array<{
    date?: string | null;
    total?: number | null;
  }>;
};

type PreviousAnalyticsRow = {
  visits: number | string | null;
  listing_position: number | string | null;
};

type AnalyticsRow = {
  id: string;
};

type AlertPayload = {
  organization_id: string;
  marketplace_account_id: string;
  analytics_id: string | null;
  external_item_id: string;
  seller_sku: string | null;
  title: string;
  alert_date: string;
  alert_type: string;
  severity: "info" | "warning" | "critical" | "positive";
  message: string;
  current_value: number | null;
  previous_value: number | null;
  raw_payload: Record<string, unknown>;
};

type SyncContext = {
  accessToken: string;
  account: MarketplaceAccount;
  clientId: string;
  clientSecret: string;
  organizationId: string;
  supabase: SupabaseClient;
};

const DEFAULT_LIMIT = 40;
const MAX_LIMIT = 80;
const SEARCH_LIMIT = 50;
const SAO_PAULO_TIME_ZONE = "America/Sao_Paulo";
const saoPauloDateParts = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  timeZone: SAO_PAULO_TIME_ZONE,
  year: "numeric"
});

function numberFromDb(value: number | string | null | undefined) {
  const numeric = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(numeric) ? numeric : 0;
}

function dateKeyInSaoPaulo(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return new Date().toISOString().slice(0, 10);

  const parts = saoPauloDateParts.formatToParts(date);
  const day = parts.find((part) => part.type === "day")?.value ?? "01";
  const month = parts.find((part) => part.type === "month")?.value ?? "01";
  const year = parts.find((part) => part.type === "year")?.value ?? "1970";

  return `${year}-${month}-${day}`;
}

function isTokenExpiring(credentials: MarketplaceCredentials) {
  if (!credentials.token_expires_at) return Boolean(credentials.refresh_token);
  const expiresAt = new Date(credentials.token_expires_at).getTime();
  return (
    !Number.isFinite(expiresAt) ||
    expiresAt < Date.now() + 5 * 60 * 1000
  );
}

function buildSearchQuery(title: string) {
  return title
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((word) => word.length > 2)
    .slice(0, 7)
    .join(" ");
}

function extractMercadoLivreIdentifiers(value?: string | null) {
  const input = value?.trim() ?? "";
  const userProductId = input.match(/\bMLBU\d{5,}\b/i)?.[0]?.toUpperCase() ?? null;
  const itemId = input.match(/\bMLB\d{5,}\b/i)?.[0]?.toUpperCase() ?? null;

  return {
    itemId,
    userProductId
  };
}

function getAttributeValue(
  attributes: MercadoLivreAttribute[] | undefined,
  ids: string[]
) {
  const attribute = attributes?.find((current) => {
    const currentId = current.id?.toUpperCase();
    const currentName = current.name?.toUpperCase();
    return ids.some((id) => id === currentId || id === currentName);
  });

  return attribute?.value_name ?? attribute?.value_id ?? null;
}

function extractSellerSku(item: MercadoLivreItem, fallback?: string | null) {
  return (
    item.seller_custom_field?.trim() ||
    getAttributeValue(item.attributes, ["SELLER_SKU", "SKU", "ITEM_SKU"]) ||
    fallback ||
    item.id
  );
}

function listingFromItem(item: MercadoLivreItem, localListing?: ListingRow | null): ListingRow {
  return {
    product_id: localListing?.product_id ?? null,
    external_item_id: item.id,
    seller_sku: localListing?.seller_sku ?? extractSellerSku(item),
    title: item.title ?? localListing?.title ?? item.id,
    permalink: item.permalink ?? localListing?.permalink ?? null,
    raw_payload: {
      ...(localListing?.raw_payload ?? {}),
      attributes: item.attributes,
      category_id: item.category_id,
      seller_custom_field: item.seller_custom_field,
      status: item.status,
      user_product_id: item.user_product_id
    }
  };
}

function alertForVisits(
  title: string,
  visits: number,
  previousVisits: number,
  change: number | null
): Omit<AlertPayload, "organization_id" | "marketplace_account_id" | "analytics_id" | "external_item_id" | "seller_sku" | "title" | "alert_date">[] {
  if (previousVisits > 0 && visits === 0) {
    return [
      {
        alert_type: "visits_zero",
        severity: "critical",
        message: `${title} ficou sem visitas no dia analisado.`,
        current_value: visits,
        previous_value: previousVisits,
        raw_payload: { visits, previousVisits, change }
      }
    ];
  }

  if (change !== null && change <= -0.3) {
    return [
      {
        alert_type: "visits_drop",
        severity: change <= -0.5 ? "critical" : "warning",
        message: `${title} teve queda de ${(Math.abs(change) * 100).toFixed(1)}% nas visitas.`,
        current_value: visits,
        previous_value: previousVisits,
        raw_payload: { visits, previousVisits, change }
      }
    ];
  }

  if (change !== null && change >= 0.3) {
    return [
      {
        alert_type: "visits_recovery",
        severity: "positive",
        message: `${title} recuperou visitas e subiu ${(change * 100).toFixed(1)}%.`,
        current_value: visits,
        previous_value: previousVisits,
        raw_payload: { visits, previousVisits, change }
      }
    ];
  }

  return [];
}

function alertForPosition(
  title: string,
  position: number | null,
  previousPosition: number
): Omit<AlertPayload, "organization_id" | "marketplace_account_id" | "analytics_id" | "external_item_id" | "seller_sku" | "title" | "alert_date">[] {
  if (!position || !previousPosition) return [];
  const diff = position - previousPosition;

  if (diff >= 5) {
    return [
      {
        alert_type: "position_drop",
        severity: "warning",
        message: `${title} perdeu ${diff} posicoes na busca acompanhada.`,
        current_value: position,
        previous_value: previousPosition,
        raw_payload: { position, previousPosition, diff }
      }
    ];
  }

  if (diff <= -5) {
    return [
      {
        alert_type: "position_gain",
        severity: "positive",
        message: `${title} ganhou ${Math.abs(diff)} posicoes na busca acompanhada.`,
        current_value: position,
        previous_value: previousPosition,
        raw_payload: { position, previousPosition, diff }
      }
    ];
  }

  return [];
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

async function mercadoLivreRequest<T>(path: string, accessToken: string) {
  const response = await fetch(`https://api.mercadolibre.com${path}`, {
    cache: "no-store",
    headers: {
      accept: "application/json",
      authorization: `Bearer ${accessToken}`
    }
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `Mercado Livre respondeu ${response.status} em ${path}: ${body.slice(0, 220)}`
    );
  }

  return response.json() as Promise<T>;
}

async function optionalMercadoLivreRequest<T>(path: string, accessToken: string) {
  try {
    return await mercadoLivreRequest<T>(path, accessToken);
  } catch {
    return null;
  }
}

async function fetchLocalListingsByItemIds(
  supabase: SupabaseClient,
  accountId: string,
  itemIds: string[]
) {
  if (itemIds.length === 0) return new Map<string, ListingRow>();

  const { data, error } = await supabase
    .from("marketplace_listings")
    .select("product_id, external_item_id, seller_sku, title, permalink, raw_payload")
    .eq("marketplace_account_id", accountId)
    .in("external_item_id", itemIds);

  if (error) throw error;

  return new Map(
    ((data ?? []) as ListingRow[]).map((listing) => [
      listing.external_item_id,
      listing
    ])
  );
}

async function fetchItemIdsFromUserProduct(
  userProductId: string,
  context: SyncContext
) {
  const params = new URLSearchParams({ user_product_id: userProductId });
  const payload = await optionalMercadoLivreRequest<MercadoLivreUserItemsSearchResponse>(
    `/users/${context.account.external_seller_id}/items/search?${params.toString()}`,
    context.accessToken
  );

  return payload?.results ?? [];
}

async function fetchItemIdsFromSku(input: string, context: SyncContext) {
  const value = input.trim();
  if (!value || /^https?:\/\//i.test(value)) return [];

  for (const filterName of ["seller_sku", "sku"]) {
    const params = new URLSearchParams({ [filterName]: value });
    const payload = await optionalMercadoLivreRequest<MercadoLivreUserItemsSearchResponse>(
      `/users/${context.account.external_seller_id}/items/search?${params.toString()}`,
      context.accessToken
    );

    if (payload?.results?.length) return payload.results;
  }

  return [];
}

async function resolveListingsFromInput(context: SyncContext, input?: string | null) {
  const listingInput = input?.trim();
  if (!listingInput) return null;

  const { itemId, userProductId } = extractMercadoLivreIdentifiers(listingInput);
  const itemIds = new Set<string>();

  if (itemId) itemIds.add(itemId);

  if (userProductId) {
    const userProductItemIds = await fetchItemIdsFromUserProduct(
      userProductId,
      context
    );
    userProductItemIds.forEach((id) => itemIds.add(id));
  }

  if (itemIds.size === 0) {
    const skuItemIds = await fetchItemIdsFromSku(listingInput, context);
    skuItemIds.forEach((id) => itemIds.add(id));
  }

  const selectedItemIds = Array.from(itemIds);
  const localListings = await fetchLocalListingsByItemIds(
    context.supabase,
    context.account.id,
    selectedItemIds
  );
  const listings: ListingRow[] = [];

  for (const currentItemId of selectedItemIds) {
    const item = await optionalMercadoLivreRequest<MercadoLivreItem>(
      `/items/${currentItemId}?attributes=id,title,category_id,seller_custom_field,sold_quantity,status,permalink,user_product_id,attributes`,
      context.accessToken
    );
    const localListing = localListings.get(currentItemId);

    if (item) {
      listings.push(listingFromItem(item, localListing));
    } else if (localListing) {
      listings.push(localListing);
    }
  }

  return listings;
}

async function getContextForUser(request: Request, organizationId?: string) {
  const { clientId, clientSecret, serviceRoleKey, supabaseUrl } =
    getMercadoLivreServerConfig(new URL(request.url));
  const authorization = request.headers.get("authorization");
  const token = authorization?.replace(/^Bearer\s+/i, "");

  if (!token || !organizationId || !clientId || !clientSecret) {
    return NextResponse.json(
      { error: "Sessao, organizacao e credenciais do Mercado Livre sao obrigatorias." },
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

  return getContextForOrganization(
    supabase,
    organizationId,
    clientId,
    clientSecret
  );
}

async function getContextForOrganization(
  supabase: SupabaseClient,
  organizationId: string,
  clientId: string,
  clientSecret: string
): Promise<SyncContext | NextResponse> {
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

  return {
    accessToken,
    account: currentAccount,
    clientId,
    clientSecret,
    organizationId,
    supabase
  };
}

async function syncAdAnalysis(
  context: SyncContext,
  limit: number,
  listingInput?: string | null
) {
  const { accessToken, account, organizationId, supabase } = context;
  const capturedDate = dateKeyInSaoPaulo();
  const siteId = account.site_id ?? "MLB";
  const categoryNameCache = new Map<string, string>();
  const inputListings = await resolveListingsFromInput(context, listingInput);
  let listings: ListingRow[] = inputListings ?? [];

  if (!inputListings) {
    const { data: listingsData, error: listingsError } = await supabase
      .from("marketplace_listings")
      .select("product_id, external_item_id, seller_sku, title, permalink, raw_payload")
      .eq("marketplace_account_id", account.id)
      .eq("status", "active")
      .order("updated_at", { ascending: false })
      .limit(limit);

    if (listingsError) throw listingsError;

    listings = (listingsData ?? []) as ListingRow[];
  }

  let analyticsSaved = 0;
  let alertsSaved = 0;
  const warnings: string[] = [];

  if (listingInput && listings.length === 0) {
    warnings.push(
      "Nenhum item MLB foi encontrado para este link/ID. Se for um link MLBU, confirme se ele pertence a esta conta conectada."
    );
  }

  for (const listing of listings) {
    try {
      const item =
        (await optionalMercadoLivreRequest<MercadoLivreItem>(
          `/items/${listing.external_item_id}?attributes=id,title,category_id,sold_quantity,status,permalink`,
          accessToken
        )) ?? null;
      const categoryId = item?.category_id ?? listing.raw_payload?.category_id ?? null;
      let categoryName: string | null = null;

      if (categoryId) {
        if (!categoryNameCache.has(categoryId)) {
          const category = await optionalMercadoLivreRequest<MercadoLivreCategory>(
            `/categories/${categoryId}`,
            accessToken
          );
          categoryNameCache.set(categoryId, category?.name ?? categoryId);
        }

        categoryName = categoryNameCache.get(categoryId) ?? null;
      }

      const visitsPayload = await optionalMercadoLivreRequest<VisitsTimeWindowResponse>(
        `/items/${listing.external_item_id}/visits/time_window?last=3&unit=day&ending=${capturedDate}`,
        accessToken
      );
      const visitResults = [...(visitsPayload?.results ?? [])].sort((current, next) =>
        String(current.date ?? "").localeCompare(String(next.date ?? ""))
      );
      const currentVisit = visitResults.at(-1);
      const previousVisit = visitResults.at(-2);
      const visits = Math.round(numberFromDb(currentVisit?.total));
      const previousVisits = Math.round(numberFromDb(previousVisit?.total));
      const visitChange =
        previousVisits > 0
          ? (visits - previousVisits) / previousVisits
          : visits > 0
            ? 1
            : null;
      const searchQuery = buildSearchQuery(item?.title ?? listing.title);
      const searchParams = new URLSearchParams({
        limit: String(SEARCH_LIMIT),
        q: searchQuery
      });

      if (categoryId) searchParams.set("category", categoryId);

      const searchPayload = searchQuery
        ? await optionalMercadoLivreRequest<MercadoLivreSearchResponse>(
            `/sites/${siteId}/search?${searchParams.toString()}`,
            accessToken
          )
        : null;
      const searchResults = searchPayload?.results ?? [];
      const listingIndex = searchResults.findIndex(
        (result) => result.id === listing.external_item_id
      );
      const listingPosition = listingIndex >= 0 ? listingIndex + 1 : null;
      const competitorCount = new Set(
        searchResults
          .map((result) => String(result.seller?.id ?? ""))
          .filter(Boolean)
          .filter((sellerId) => sellerId !== account.external_seller_id)
      ).size;
      const { data: previousAnalytics } = await supabase
        .from("listing_daily_analytics")
        .select("visits, listing_position")
        .eq("marketplace_account_id", account.id)
        .eq("external_item_id", listing.external_item_id)
        .lt("captured_date", capturedDate)
        .order("captured_date", { ascending: false })
        .limit(1)
        .maybeSingle();
      const previousPosition = numberFromDb(
        (previousAnalytics as PreviousAnalyticsRow | null)?.listing_position
      );

      const { data: analytics, error: analyticsError } = await supabase
        .from("listing_daily_analytics")
        .upsert(
          {
            organization_id: organizationId,
            marketplace_account_id: account.id,
            product_id: listing.product_id,
            external_item_id: listing.external_item_id,
            seller_sku: listing.seller_sku,
            title: item?.title ?? listing.title,
            category_id: categoryId,
            category_name: categoryName,
            captured_date: capturedDate,
            visits,
            previous_visits: previousVisits,
            visit_change_percent: visitChange,
            listing_position: listingPosition,
            previous_position: previousPosition || null,
            competitor_count: competitorCount,
            estimated_sold_quantity: Math.round(numberFromDb(item?.sold_quantity)),
            status: item?.status ?? listing.raw_payload?.status ?? null,
            permalink: item?.permalink ?? listing.permalink,
            raw_payload: {
              item,
              search: {
                query: searchQuery,
                total: searchPayload?.paging?.total ?? null,
                results_checked: searchResults.length
              },
              visits: visitsPayload
            }
          },
          { onConflict: "marketplace_account_id,external_item_id,captured_date" }
        )
        .select("id")
        .single();

      if (analyticsError) throw analyticsError;
      analyticsSaved += 1;

      const baseAlert = {
        organization_id: organizationId,
        marketplace_account_id: account.id,
        analytics_id: (analytics as AnalyticsRow).id,
        external_item_id: listing.external_item_id,
        seller_sku: listing.seller_sku,
        title: item?.title ?? listing.title,
        alert_date: capturedDate
      };
      const alerts = [
        ...alertForVisits(item?.title ?? listing.title, visits, previousVisits, visitChange),
        ...alertForPosition(item?.title ?? listing.title, listingPosition, previousPosition)
      ].map((alert) => ({
        ...baseAlert,
        ...alert
      }));

      if (alerts.length > 0) {
        const { error: alertsError } = await supabase
          .from("listing_exposure_alerts")
          .upsert(alerts, {
            onConflict: "marketplace_account_id,external_item_id,alert_date,alert_type"
          });

        if (alertsError) throw alertsError;
        alertsSaved += alerts.length;
      }
    } catch (error) {
      warnings.push(
        `${listing.external_item_id}: ${
          error instanceof Error ? error.message : "falha ao analisar anuncio"
        }`
      );
    }
  }

  const now = new Date().toISOString();
  await supabase
    .from("sync_runs")
    .insert({
      organization_id: organizationId,
      marketplace_account_id: account.id,
      provider: "mercadolivre",
      resource: "ad_analysis",
      status: "success",
      finished_at: now,
      records_processed: analyticsSaved,
      metadata: {
        captured_date: capturedDate,
        listing_input: listingInput ?? null,
        listings_checked: listings.length,
        alerts: alertsSaved,
        warnings: warnings.slice(0, 10)
      }
    });

  return {
    accountName: account.account_name,
    alerts: alertsSaved,
    capturedDate,
    checkedListings: listings.length,
    syncedAt: now,
    analytics: analyticsSaved,
    warnings
  };
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      organizationId?: string;
      limit?: number;
      listingInput?: string;
    };
    const context = await getContextForUser(request, body.organizationId);

    if (context instanceof NextResponse) return context;

    const limit =
      typeof body.limit === "number" && body.limit > 0
        ? Math.min(Math.floor(body.limit), MAX_LIMIT)
        : DEFAULT_LIMIT;

    return NextResponse.json(
      await syncAdAnalysis(context, limit, body.listingInput)
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Nao foi possivel analisar anuncios."
      },
      { status: 500 }
    );
  }
}

export async function GET(request: Request) {
  try {
    const { clientId, clientSecret, serviceRoleKey, supabaseUrl } =
      getMercadoLivreServerConfig(new URL(request.url));
    const cronSecret = process.env.CRON_SECRET?.trim();
    const authorization = request.headers.get("authorization");

    if (!cronSecret || authorization !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Nao autorizado." }, { status: 401 });
    }

    if (!clientId || !clientSecret) {
      return NextResponse.json(
        { error: "Credenciais do Mercado Livre incompletas." },
        { status: 500 }
      );
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false }
    });
    const { data: accounts, error: accountsError } = await supabase
      .from("marketplace_accounts")
      .select("organization_id")
      .eq("provider", "mercadolivre")
      .eq("status", "connected");

    if (accountsError) throw accountsError;

    const organizationIds = Array.from(
      new Set((accounts ?? []).map((account) => account.organization_id))
    );
    const results = [];

    for (const organizationId of organizationIds) {
      const context = await getContextForOrganization(
        supabase,
        organizationId,
        clientId,
        clientSecret
      );

      if (context instanceof NextResponse) continue;
      results.push(await syncAdAnalysis(context, DEFAULT_LIMIT));
    }

    return NextResponse.json({
      ok: true,
      organizations: results.length,
      results
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Nao foi possivel executar a rotina diaria."
      },
      { status: 500 }
    );
  }
}
