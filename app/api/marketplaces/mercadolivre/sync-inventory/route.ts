import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getMercadoLivreServerConfig } from "@/lib/marketplaces/mercadolivre-server-config";

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

type TokenRefreshResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
};

type MercadoLivreAttribute = {
  id?: string;
  name?: string;
  value_name?: string | null;
  value_id?: string | null;
};

type MercadoLivreVariation = {
  id?: number | string;
  seller_custom_field?: string | null;
  inventory_id?: string | null;
  user_product_id?: string | null;
  available_quantity?: number | null;
  attributes?: MercadoLivreAttribute[];
  attribute_combinations?: MercadoLivreAttribute[];
};

type MercadoLivreItem = {
  id: string;
  title: string;
  seller_custom_field?: string | null;
  inventory_id?: string | null;
  user_product_id?: string | null;
  available_quantity?: number | null;
  variations?: MercadoLivreVariation[];
  shipping?: {
    logistic_type?: string | null;
    mode?: string | null;
  } | null;
  attributes?: MercadoLivreAttribute[];
};

type FulfillmentStockResponse = {
  inventory_id: string;
  total?: number | null;
  available_quantity?: number | null;
  not_available_quantity?: number | null;
  not_available_detail?: Array<{
    status?: string;
    quantity?: number;
  }>;
};

type UserProductStockResponse = {
  id: string;
  locations?: Array<{
    type?: string;
    quantity?: number;
  }>;
};

type ListingRow = {
  id: string;
  product_id: string | null;
  external_item_id: string;
  seller_sku: string | null;
  title: string;
  raw_payload: MercadoLivreItem | null;
};

type ProductRow = {
  id: string;
  internal_sku: string;
};

type InventorySource = {
  externalItemId: string;
  sellerSku: string;
  title: string;
  productId: string | null;
  inventoryId: string | null;
  userProductId: string | null;
  fallbackAvailableQuantity: number | null;
  logisticType: string;
};

const MAX_LISTINGS_PER_SYNC = 300;

function getEnv(request: Request) {
  const config = getMercadoLivreServerConfig(new URL(request.url));
  const { clientId, clientSecret, serviceRoleKey, supabaseUrl } = config;

  if (!clientId || !clientSecret) {
    throw new Error("Variaveis do Mercado Livre incompletas.");
  }

  return { clientId, clientSecret, serviceRoleKey, supabaseUrl };
}

function normalizeSku(value?: string | null) {
  const normalized = value?.trim();
  return normalized ? normalized.slice(0, 120) : null;
}

function toInt(value: unknown) {
  const numeric = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(numeric) ? Math.max(0, Math.round(numeric)) : 0;
}

function getAttributeValue(attributes: MercadoLivreAttribute[] | undefined, ids: string[]) {
  const attribute = attributes?.find((current) => {
    const currentId = current.id?.toUpperCase();
    const currentName = current.name?.toUpperCase();
    return ids.some((id) => id === currentId || id === currentName);
  });

  return normalizeSku(attribute?.value_name ?? attribute?.value_id);
}

function getLogisticChannel(item: MercadoLivreItem) {
  const logisticType = item.shipping?.logistic_type ?? item.shipping?.mode ?? "marketplace";
  return logisticType === "fulfillment" ? "full" : logisticType;
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

async function mercadoLivreOptionalRequest<T>(path: string, accessToken: string) {
  const response = await fetch(`https://api.mercadolibre.com${path}`, {
    headers: {
      authorization: `Bearer ${accessToken}`
    }
  });

  if (!response.ok) {
    if ([400, 403, 404].includes(response.status)) return null;
    throw new Error(`Mercado Livre API respondeu ${response.status} em ${path}.`);
  }

  return response.json() as Promise<T>;
}

async function fetchItem(itemId: string, accessToken: string) {
  const params = new URLSearchParams({
    attributes:
      "id,title,seller_custom_field,inventory_id,user_product_id,available_quantity,shipping,attributes,variations"
  });

  return mercadoLivreRequest<MercadoLivreItem>(
    `/items/${itemId}?${params.toString()}`,
    accessToken
  );
}

async function fetchFulfillmentStock(inventoryId: string, accessToken: string) {
  return mercadoLivreOptionalRequest<FulfillmentStockResponse>(
    `/inventories/${inventoryId}/stock/fulfillment`,
    accessToken
  );
}

async function fetchUserProductStock(userProductId: string, accessToken: string) {
  return mercadoLivreOptionalRequest<UserProductStockResponse>(
    `/user-products/${userProductId}/stock`,
    accessToken
  );
}

function extractSources(listing: ListingRow, item: MercadoLivreItem) {
  const baseSku =
    normalizeSku(item.seller_custom_field) ??
    getAttributeValue(item.attributes, ["SELLER_SKU", "SKU"]) ??
    normalizeSku(listing.seller_sku) ??
    item.id;
  const logisticType = getLogisticChannel(item);

  if (!item.variations?.length) {
    return [
      {
        externalItemId: item.id,
        sellerSku: baseSku,
        title: item.title ?? listing.title,
        productId: listing.product_id,
        inventoryId: item.inventory_id ?? null,
        userProductId: item.user_product_id ?? null,
        fallbackAvailableQuantity: item.available_quantity ?? null,
        logisticType
      }
    ] satisfies InventorySource[];
  }

  return item.variations.map((variation) => {
    const variationSku =
      normalizeSku(variation.seller_custom_field) ??
      getAttributeValue(variation.attributes, ["SELLER_SKU", "SKU"]) ??
      getAttributeValue(variation.attribute_combinations, ["SELLER_SKU", "SKU"]) ??
      `${baseSku}-${variation.id ?? "VAR"}`;

    return {
      externalItemId: variation.id ? `${item.id}:${variation.id}` : item.id,
      sellerSku: variationSku,
      title: item.title ?? listing.title,
      productId: listing.product_id,
      inventoryId: variation.inventory_id ?? item.inventory_id ?? null,
      userProductId: variation.user_product_id ?? item.user_product_id ?? null,
      fallbackAvailableQuantity: variation.available_quantity ?? null,
      logisticType
    } satisfies InventorySource;
  });
}

function channelFromLocationType(type: string | undefined) {
  if (type === "meli_facility") return "full";
  if (type === "selling_address") return "selling_address";
  if (type === "seller_warehouse") return "seller_warehouse";
  return type ?? "marketplace";
}

export async function POST(request: Request) {
  try {
    const { clientId, clientSecret, serviceRoleKey, supabaseUrl } = getEnv(request);
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
        resource: "inventory",
        status: "running",
        metadata: { source: "manual" }
      })
      .select("id")
      .single();

    if (syncRunError) throw syncRunError;

    try {
      const { data: listingsData, error: listingsError } = await supabase
        .from("marketplace_listings")
        .select("id, product_id, external_item_id, seller_sku, title, raw_payload")
        .eq("marketplace_account_id", currentAccount.id)
        .order("updated_at", { ascending: false })
        .limit(MAX_LISTINGS_PER_SYNC);

      if (listingsError) throw listingsError;

      const listings = (listingsData ?? []) as ListingRow[];

      if (listings.length === 0) {
        await supabase
          .from("sync_runs")
          .update({
            status: "failed",
            finished_at: new Date().toISOString(),
            error_message: "Sincronize os SKUs antes de sincronizar estoque."
          })
          .eq("id", syncRun.id);

        return NextResponse.json(
          { error: "Sincronize os SKUs antes de sincronizar estoque." },
          { status: 409 }
        );
      }

      const sources: InventorySource[] = [];

      for (const listing of listings) {
        const item = await fetchItem(listing.external_item_id, accessToken);
        sources.push(...extractSources(listing, item));
      }

      const productCandidates = new Map<string, { internal_sku: string; title: string }>();

      for (const source of sources) {
        productCandidates.set(source.sellerSku, {
          internal_sku: source.sellerSku,
          title: source.title
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
      const snapshots = [];

      for (const source of sources) {
        const fulfillmentStock = source.inventoryId
          ? await fetchFulfillmentStock(source.inventoryId, accessToken)
          : null;
        const userProductStock = source.userProductId
          ? await fetchUserProductStock(source.userProductId, accessToken)
          : null;
        const hasFullStock = Boolean(fulfillmentStock);
        let hasFullLocationStock = false;

        if (fulfillmentStock) {
          snapshots.push({
            organization_id: organizationId,
            marketplace_account_id: currentAccount.id,
            product_id: productsBySku.get(source.sellerSku) ?? source.productId,
            external_item_id: source.externalItemId,
            seller_sku: source.sellerSku,
            fulfillment_channel: "full",
            available_quantity: toInt(fulfillmentStock.available_quantity),
            reserved_quantity: 0,
            not_available_quantity: toInt(fulfillmentStock.not_available_quantity),
            raw_payload: {
              source,
              stock: fulfillmentStock
            }
          });
        }

        for (const location of userProductStock?.locations ?? []) {
          const channel = channelFromLocationType(location.type);
          if (channel !== "full" || hasFullStock) continue;

          hasFullLocationStock = true;

          snapshots.push({
            organization_id: organizationId,
            marketplace_account_id: currentAccount.id,
            product_id: productsBySku.get(source.sellerSku) ?? source.productId,
            external_item_id: source.externalItemId,
            seller_sku: source.sellerSku,
            fulfillment_channel: channel,
            available_quantity: toInt(location.quantity),
            reserved_quantity: 0,
            not_available_quantity: 0,
            raw_payload: {
              source,
              stock: userProductStock,
              location
            }
          });
        }

        if (
          !fulfillmentStock &&
          !hasFullLocationStock &&
          source.logisticType === "full" &&
          source.fallbackAvailableQuantity !== null
        ) {
          snapshots.push({
            organization_id: organizationId,
            marketplace_account_id: currentAccount.id,
            product_id: productsBySku.get(source.sellerSku) ?? source.productId,
            external_item_id: source.externalItemId,
            seller_sku: source.sellerSku,
            fulfillment_channel: source.logisticType,
            available_quantity: toInt(source.fallbackAvailableQuantity),
            reserved_quantity: 0,
            not_available_quantity: 0,
            raw_payload: { source }
          });
        }
      }

      if (snapshots.length > 0) {
        const { error: snapshotsError } = await supabase
          .from("inventory_snapshots")
          .insert(snapshots);

        if (snapshotsError) throw snapshotsError;
      }

      const now = new Date().toISOString();
      const fullSnapshots = snapshots.filter(
        (snapshot) => snapshot.fulfillment_channel === "full"
      );

      await supabase
        .from("marketplace_accounts")
        .update({ last_sync_at: now })
        .eq("id", currentAccount.id);

      await supabase
        .from("sync_runs")
        .update({
          status: "success",
          finished_at: now,
          records_processed: snapshots.length,
          metadata: {
            listings_checked: listings.length,
            sku_sources: sources.length,
            full_snapshots: fullSnapshots.length,
            available_quantity: snapshots.reduce(
              (sum, snapshot) => sum + snapshot.available_quantity,
              0
            )
          }
        })
        .eq("id", syncRun.id);

      return NextResponse.json({
        accountName: currentAccount.account_name,
        listingsChecked: listings.length,
        skuSources: sources.length,
        snapshots: snapshots.length,
        fullSnapshots: fullSnapshots.length,
        availableQuantity: snapshots.reduce(
          (sum, snapshot) => sum + snapshot.available_quantity,
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
            error instanceof Error ? error.message : "Falha ao sincronizar estoque."
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
            : "Nao foi possivel sincronizar estoque."
      },
      { status: 500 }
    );
  }
}
