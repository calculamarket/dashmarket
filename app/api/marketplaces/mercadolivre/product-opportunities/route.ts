import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
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

type CategoryPrediction = {
  category_id?: string;
  category_name?: string;
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

type MercadoLivreSearchItem = {
  id: string;
  title: string;
  category_id?: string | null;
  price?: number | null;
  sold_quantity?: number | null;
  available_quantity?: number | null;
  permalink?: string | null;
  thumbnail?: string | null;
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

type ExistingOpportunityRow = {
  external_item_id: string;
  sold_quantity: number | string | null;
};

const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 50;

function toNumber(value: unknown) {
  const numeric = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(numeric) ? numeric : 0;
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

function isTokenExpiring(credentials: MarketplaceCredentials) {
  if (!credentials.token_expires_at) return Boolean(credentials.refresh_token);
  const expiresAt = new Date(credentials.token_expires_at).getTime();
  return (
    !Number.isFinite(expiresAt) ||
    expiresAt < Date.now() + 5 * 60 * 1000
  );
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

async function searchWithOptionalSort(
  siteId: string,
  accessToken: string,
  params: URLSearchParams
) {
  const sortedParams = new URLSearchParams(params);
  sortedParams.set("sort", "sold_quantity_desc");

  try {
    return await mercadoLivreRequest<MercadoLivreSearchResponse>(
      `/sites/${siteId}/search?${sortedParams.toString()}`,
      accessToken
    );
  } catch {
    return mercadoLivreRequest<MercadoLivreSearchResponse>(
      `/sites/${siteId}/search?${params.toString()}`,
      accessToken
    );
  }
}

async function resolveReferenceItem(
  input: string,
  sellerId: string,
  accessToken: string
) {
  const { itemId, userProductId } = extractMercadoLivreIdentifiers(input);
  let selectedItemId = itemId;

  if (!selectedItemId && userProductId) {
    const params = new URLSearchParams({ user_product_id: userProductId });
    const payload = await optionalMercadoLivreRequest<MercadoLivreUserItemsSearchResponse>(
      `/users/${sellerId}/items/search?${params.toString()}`,
      accessToken
    );
    selectedItemId = payload?.results?.[0] ?? null;
  }

  if (!selectedItemId) return null;

  return optionalMercadoLivreRequest<MercadoLivreItem>(
    `/items/${selectedItemId}?attributes=id,title,category_id,seller_custom_field,sold_quantity,status,permalink,user_product_id,attributes`,
    accessToken
  );
}

async function optionalCategoryPrediction(
  siteId: string,
  query: string,
  accessToken: string
) {
  if (!query) return null;

  return optionalMercadoLivreRequest<CategoryPrediction[]>(
    `/sites/${siteId}/domain_discovery/search?${new URLSearchParams({
      limit: "1",
      q: query
    }).toString()}`,
    accessToken
  );
}

export async function POST(request: Request) {
  try {
    const { clientId, clientSecret, serviceRoleKey, supabaseUrl } =
      getMercadoLivreServerConfig(new URL(request.url));
    const body = (await request.json()) as {
      organizationId?: string;
      categoryId?: string;
      query?: string;
      limit?: number;
    };
    const organizationId = body.organizationId;
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
    const siteId = currentAccount.site_id ?? "MLB";
    let query = body.query?.trim() ?? "";
    let categoryId = body.categoryId?.trim() ?? "";
    let categoryName: string | null = null;
    const referenceItem = query
      ? await resolveReferenceItem(
          query,
          currentAccount.external_seller_id,
          accessToken
        )
      : null;

    if (referenceItem) {
      categoryId = categoryId || referenceItem.category_id || "";
      query = buildSearchQuery(referenceItem.title ?? query) || query;
    }

    if (!categoryId && query) {
      const predictions = await optionalCategoryPrediction(
        siteId,
        query,
        accessToken
      );
      const prediction = predictions?.[0];
      categoryId = prediction?.category_id ?? "";
      categoryName = prediction?.category_name ?? null;
    }

    if (!categoryId && !query) {
      return NextResponse.json(
        { error: "Informe uma categoria ou um termo para descobrir a categoria." },
        { status: 400 }
      );
    }

    const limit =
      typeof body.limit === "number" && body.limit > 0
        ? Math.min(Math.floor(body.limit), MAX_LIMIT)
        : DEFAULT_LIMIT;
    const categoryKey = categoryId || `SEARCH:${query.slice(0, 80)}`;
    const params = new URLSearchParams({
      limit: String(limit)
    });

    if (categoryId) params.set("category", categoryId);
    if (query) params.set("q", query);

    const searchPayload = await searchWithOptionalSort(siteId, accessToken, params);
    const results = searchPayload.results ?? [];
    const externalItemIds = results.map((item) => item.id);
    const { data: previousRows, error: previousError } =
      externalItemIds.length > 0
        ? await supabase
            .from("marketplace_product_opportunities")
            .select("external_item_id, sold_quantity")
            .eq("organization_id", organizationId)
            .eq("category_id", categoryKey)
            .in("external_item_id", externalItemIds)
        : { data: [], error: null };

    if (previousError) throw previousError;

    const previousByItemId = new Map(
      ((previousRows ?? []) as ExistingOpportunityRow[]).map((row) => [
        row.external_item_id,
        toNumber(row.sold_quantity)
      ])
    );
    const competitorCount = new Set(
      results
        .map((item) => String(item.seller?.id ?? ""))
        .filter(Boolean)
        .filter((sellerId) => sellerId !== currentAccount.external_seller_id)
    ).size;
    const rows = results.map((item, index) => {
      const rowCategoryId = item.category_id ?? categoryId ?? categoryKey;
      const soldQuantity = Math.round(toNumber(item.sold_quantity));
      const previousSoldQuantity = previousByItemId.get(item.id) ?? soldQuantity;

      return {
        organization_id: organizationId,
        marketplace_account_id: currentAccount.id,
        provider: "mercadolivre",
        site_id: siteId,
        category_id: rowCategoryId,
        category_name: categoryName,
        query: query || null,
        captured_at: new Date().toISOString(),
        external_item_id: item.id,
        title: item.title,
        price_amount: toNumber(item.price),
        sold_quantity: soldQuantity,
        previous_sold_quantity: previousSoldQuantity,
        estimated_daily_sales: Math.max(0, soldQuantity - previousSoldQuantity),
        available_quantity: Math.round(toNumber(item.available_quantity)),
        seller_id: item.seller?.id ? String(item.seller.id) : null,
        seller_name: item.seller?.nickname ?? null,
        competitor_count: competitorCount,
        listing_position: index + 1,
        permalink: item.permalink ?? null,
        thumbnail: item.thumbnail ?? null,
        raw_payload: item
      };
    });

    if (rows.length > 0) {
      const { error: upsertError } = await supabase
        .from("marketplace_product_opportunities")
        .upsert(rows, {
          onConflict: "organization_id,category_id,external_item_id"
        });

      if (upsertError) throw upsertError;
    }

    return NextResponse.json({
      accountName: currentAccount.account_name,
      categoryId: categoryId || categoryKey,
      categoryName,
      competitorCount,
      query,
      results: rows,
      total: searchPayload.paging?.total ?? rows.length,
      syncedAt: new Date().toISOString()
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Nao foi possivel buscar oportunidades."
      },
      { status: 500 }
    );
  }
}
