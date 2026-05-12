import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type MarketplaceAccount = {
  id: string;
  organization_id: string;
  external_seller_id: string;
  account_name: string;
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

type MercadoLivreSearchResponse = {
  results?: string[];
  scroll_id?: string | null;
  paging?: {
    total?: number;
  };
};

type MercadoLivreAttribute = {
  id?: string;
  name?: string;
  value_name?: string | null;
  value_id?: string | null;
};

type MercadoLivreVariation = {
  id?: number;
  seller_custom_field?: string | null;
  attribute_combinations?: MercadoLivreAttribute[];
  attributes?: MercadoLivreAttribute[];
};

type MercadoLivreItem = {
  id: string;
  title: string;
  seller_custom_field?: string | null;
  attributes?: MercadoLivreAttribute[];
  variations?: MercadoLivreVariation[];
  permalink?: string | null;
  listing_type_id?: string | null;
  shipping?: {
    logistic_type?: string | null;
    mode?: string | null;
  };
  status?: string | null;
};

type MercadoLivreMultiGetItem = {
  code: number;
  body: MercadoLivreItem;
};

type TokenRefreshResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
};

type ProductRow = {
  id: string;
  internal_sku: string;
};

type ListingPayload = {
  organization_id: string;
  marketplace_account_id: string;
  product_id: string;
  provider: "mercadolivre";
  external_item_id: string;
  seller_sku: string;
  title: string;
  permalink: string | null;
  listing_type: string | null;
  fulfillment_type: string | null;
  status: string | null;
  raw_payload: MercadoLivreItem;
};

const MAX_ITEMS_PER_SYNC = 500;
const BATCH_SIZE = 20;

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

function chunk<T>(items: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function normalizeSku(value?: string | null) {
  const normalized = value?.trim();
  return normalized ? normalized.slice(0, 120) : null;
}

function getAttributeValue(attributes: MercadoLivreAttribute[] | undefined, ids: string[]) {
  const attribute = attributes?.find((current) => {
    const currentId = current.id?.toUpperCase();
    const currentName = current.name?.toUpperCase();
    return ids.some((id) => id === currentId || id === currentName);
  });

  return normalizeSku(attribute?.value_name ?? attribute?.value_id);
}

function extractSellerSku(item: MercadoLivreItem) {
  const itemSku =
    normalizeSku(item.seller_custom_field) ??
    getAttributeValue(item.attributes, ["SELLER_SKU", "SKU"]);

  if (itemSku) return itemSku;

  for (const variation of item.variations ?? []) {
    const variationSku =
      normalizeSku(variation.seller_custom_field) ??
      getAttributeValue(variation.attributes, ["SELLER_SKU", "SKU"]) ??
      getAttributeValue(variation.attribute_combinations, ["SELLER_SKU", "SKU"]);

    if (variationSku) return variationSku;
  }

  return item.id;
}

function isTokenExpiring(credentials: MarketplaceCredentials) {
  if (!credentials.token_expires_at) return false;
  const expiresAt = new Date(credentials.token_expires_at).getTime();
  return Number.isFinite(expiresAt) && expiresAt < Date.now() + 5 * 60 * 1000;
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
    headers: {
      authorization: `Bearer ${accessToken}`
    }
  });

  if (!response.ok) {
    throw new Error(`Mercado Livre API respondeu ${response.status} em ${path}.`);
  }

  return response.json() as Promise<T>;
}

async function fetchItemIds(sellerId: string, accessToken: string) {
  const ids: string[] = [];
  let scrollId: string | null = null;
  let total = 0;

  do {
    const params = new URLSearchParams({
      search_type: "scan",
      limit: "100"
    });

    if (scrollId) params.set("scroll_id", scrollId);

    const payload = await mercadoLivreRequest<MercadoLivreSearchResponse>(
      `/users/${sellerId}/items/search?${params.toString()}`,
      accessToken
    );

    const results = payload.results ?? [];
    ids.push(...results);
    total = payload.paging?.total ?? total;
    scrollId = payload.scroll_id ?? null;
  } while (scrollId && ids.length > 0 && ids.length < MAX_ITEMS_PER_SYNC);

  return {
    ids: ids.slice(0, MAX_ITEMS_PER_SYNC),
    total
  };
}

async function fetchItems(ids: string[], accessToken: string) {
  const items: MercadoLivreItem[] = [];

  for (const group of chunk(ids, BATCH_SIZE)) {
    const params = new URLSearchParams({
      ids: group.join(","),
      attributes:
        "id,title,seller_custom_field,attributes,variations,permalink,listing_type_id,shipping,status"
    });

    const payload = await mercadoLivreRequest<MercadoLivreMultiGetItem[]>(
      `/items?${params.toString()}`,
      accessToken
    );

    for (const item of payload) {
      if (item.code >= 200 && item.code < 300 && item.body?.id) {
        items.push(item.body);
      }
    }
  }

  return items;
}

export async function POST(request: Request) {
  try {
    const { clientId, clientSecret, serviceRoleKey, supabaseUrl } = getEnv();
    const authorization = request.headers.get("authorization");
    const token = authorization?.replace(/^Bearer\s+/i, "");
    const body = (await request.json()) as { organizationId?: string };
    const organizationId = body.organizationId;

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
      .select("id, organization_id, external_seller_id, account_name")
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
        resource: "listings",
        status: "running",
        metadata: { source: "manual" }
      })
      .select("id")
      .single();

    if (syncRunError) throw syncRunError;

    try {
      const { ids, total } = await fetchItemIds(
        currentAccount.external_seller_id,
        accessToken
      );
      const items = await fetchItems(ids, accessToken);

      const productCandidates = new Map<string, { internal_sku: string; title: string }>();
      const itemSku = new Map<string, string>();

      for (const item of items) {
        const sku = extractSellerSku(item);
        itemSku.set(item.id, sku);
        productCandidates.set(sku, {
          internal_sku: sku,
          title: item.title
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
      const products =
        skus.length > 0
          ? await supabase
              .from("products")
              .select("id, internal_sku")
              .eq("organization_id", organizationId)
              .in("internal_sku", skus)
          : { data: [], error: null };

      if (products.error) throw products.error;

      const productsBySku = new Map(
        ((products.data ?? []) as ProductRow[]).map((product) => [
          product.internal_sku,
          product.id
        ])
      );

      const listings: ListingPayload[] = items
        .map((item) => {
          const sku = itemSku.get(item.id) ?? item.id;
          const productId = productsBySku.get(sku);

          if (!productId) return null;

          return {
            organization_id: organizationId,
            marketplace_account_id: currentAccount.id,
            product_id: productId,
            provider: "mercadolivre",
            external_item_id: item.id,
            seller_sku: sku,
            title: item.title,
            permalink: item.permalink ?? null,
            listing_type: item.listing_type_id ?? null,
            fulfillment_type: item.shipping?.logistic_type ?? item.shipping?.mode ?? null,
            status: item.status ?? null,
            raw_payload: item
          };
        })
        .filter((listing): listing is ListingPayload => Boolean(listing));

      if (listings.length > 0) {
        const { error: listingsError } = await supabase
          .from("marketplace_listings")
          .upsert(listings, {
            onConflict: "marketplace_account_id,external_item_id"
          });

        if (listingsError) throw listingsError;
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
          records_processed: listings.length,
          metadata: {
            remote_total: total,
            fetched_items: ids.length,
            synced_products: productCandidates.size
          }
        })
        .eq("id", syncRun.id);

      return NextResponse.json({
        accountName: currentAccount.account_name,
        fetchedItems: ids.length,
        remoteTotal: total,
        syncedListings: listings.length,
        syncedProducts: productCandidates.size,
        syncedAt: now
      });
    } catch (error) {
      await supabase
        .from("sync_runs")
        .update({
          status: "failed",
          finished_at: new Date().toISOString(),
          error_message:
            error instanceof Error ? error.message : "Falha ao sincronizar anuncios."
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
            : "Nao foi possivel sincronizar anuncios."
      },
      { status: 500 }
    );
  }
}
