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

type TokenRefreshResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
};

type MercadoLivreOrderItem = {
  item?: {
    id?: string;
    title?: string;
    seller_sku?: string | null;
    seller_custom_field?: string | null;
  };
  quantity?: number;
  unit_price?: number;
  full_unit_price?: number;
  sale_fee?: number;
  currency_id?: string;
};

type MercadoLivreOrder = {
  id: number | string;
  status?: string | null;
  date_created?: string | null;
  date_closed?: string | null;
  total_amount?: number | null;
  paid_amount?: number | null;
  shipping_cost?: number | null;
  order_items?: MercadoLivreOrderItem[];
  shipping?: {
    id?: number | string | null;
    cost?: number | null;
    receiver_address?: {
      state?: {
        name?: string | null;
      };
    } | null;
  } | null;
  taxes?: {
    amount?: number | null;
  } | null;
};

type MercadoLivreOrdersSearchResponse = {
  results?: MercadoLivreOrder[];
  paging?: {
    total?: number;
    offset?: number;
    limit?: number;
  };
};

type MercadoLivreShipmentCosts = {
  gross_amount?: number | null;
  receiver?: {
    user_id?: number | string | null;
    cost?: number | null;
    compensation?: number | null;
    save?: number | null;
  } | null;
  senders?: Array<{
    user_id?: number | string | null;
    cost?: number | null;
    compensation?: number | null;
    save?: number | null;
  }> | null;
};

type ListingRow = {
  id: string;
  product_id: string | null;
  external_item_id: string;
  seller_sku: string | null;
  title: string;
};

type ProductRow = {
  id: string;
  internal_sku: string;
};

type OrderRow = {
  id: string;
  provider_order_id: string;
};

type DashmarketShippingPayload = {
  buyer_cost_amount: number;
  seller_cost_amount: number;
  gross_amount: number;
  source: "shipments_costs" | "order";
};

type NormalizedOrderItem = {
  externalItemId: string | null;
  sellerSku: string;
  title: string;
  quantity: number;
  unitPrice: number;
  grossAmount: number;
  marketplaceFeeAmount: number;
  discountAmount: number;
  rawPayload: MercadoLivreOrderItem & {
    dashmarket_shipping?: DashmarketShippingPayload;
  };
};

type NormalizedOrder = {
  providerOrderId: string;
  soldAt: string;
  status: string;
  buyerState: string | null;
  grossAmount: number;
  marketplaceFeeAmount: number;
  shippingCostAmount: number;
  buyerShippingCostAmount: number;
  sellerShippingCostAmount: number;
  shippingGrossAmount: number;
  shippingCostSource: DashmarketShippingPayload["source"];
  discountsAmount: number;
  taxesAmount: number;
  netAmount: number;
  items: NormalizedOrderItem[];
  rawPayload: MercadoLivreOrder & {
    dashmarket_shipping?: DashmarketShippingPayload;
  };
};

const MAX_ORDERS_PER_SYNC = 10000;
const ORDERS_PAGE_SIZE = 50;
const DEFAULT_DAYS_BACK = 30;

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

function normalizeSku(value?: string | null) {
  const normalized = value?.trim();
  return normalized ? normalized.slice(0, 120) : null;
}

function sellerShippingCostFromShipment(
  shipmentCosts: MercadoLivreShipmentCosts | null | undefined,
  sellerId: string
) {
  const senders = shipmentCosts?.senders ?? [];
  const sellerSenders = senders.filter(
    (sender) => String(sender.user_id ?? "") === sellerId
  );
  const selectedSenders = sellerSenders.length > 0 ? sellerSenders : senders;

  return selectedSenders.reduce((total, sender) => total + toNumber(sender.cost), 0);
}

function shippingAmountsFromOrder(
  order: MercadoLivreOrder,
  shipmentCosts: MercadoLivreShipmentCosts | null | undefined,
  sellerId: string
) {
  const buyerCostFromShipment = toNumber(shipmentCosts?.receiver?.cost);
  const sellerCostFromShipment = sellerShippingCostFromShipment(
    shipmentCosts,
    sellerId
  );
  const orderShippingCost = toNumber(order.shipping_cost ?? order.shipping?.cost);
  const hasShipmentCosts = Boolean(shipmentCosts);

  return {
    buyerShippingCostAmount:
      buyerCostFromShipment > 0 ? buyerCostFromShipment : orderShippingCost,
    sellerShippingCostAmount: sellerCostFromShipment,
    shippingGrossAmount: toNumber(shipmentCosts?.gross_amount),
    shippingCostSource: hasShipmentCosts ? "shipments_costs" : "order"
  } satisfies Pick<
    NormalizedOrder,
    | "buyerShippingCostAmount"
    | "sellerShippingCostAmount"
    | "shippingGrossAmount"
    | "shippingCostSource"
  >;
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

async function fetchOrderDetails(orderId: number | string, accessToken: string) {
  return mercadoLivreRequest<MercadoLivreOrder>(`/orders/${orderId}`, accessToken);
}

async function fetchShipmentCosts(shippingId: string, accessToken: string) {
  try {
    return await mercadoLivreRequest<MercadoLivreShipmentCosts>(
      `/shipments/${shippingId}/costs`,
      accessToken
    );
  } catch {
    return null;
  }
}

function getShippingId(order: MercadoLivreOrder) {
  const shippingId = order.shipping?.id;
  return shippingId === null || shippingId === undefined ? null : String(shippingId);
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<R>
) {
  const results: R[] = [];

  for (let index = 0; index < items.length; index += limit) {
    const chunk = items.slice(index, index + limit);
    results.push(...(await Promise.all(chunk.map(worker))));
  }

  return results;
}

async function fetchShipmentCostsById(
  orders: MercadoLivreOrder[],
  accessToken: string
) {
  const shippingIds = Array.from(
    new Set(
      orders
        .map(getShippingId)
        .filter((shippingId): shippingId is string => Boolean(shippingId))
    )
  );
  const shipmentCosts = await mapWithConcurrency(
    shippingIds,
    8,
    async (shippingId) =>
      [shippingId, await fetchShipmentCosts(shippingId, accessToken)] as const
  );

  return new Map(
    shipmentCosts.filter(
      (entry): entry is readonly [string, MercadoLivreShipmentCosts] =>
        Boolean(entry[1])
    )
  );
}

async function fetchOrders(
  sellerId: string,
  accessToken: string,
  daysBack: number
) {
  const orders: MercadoLivreOrder[] = [];
  let offset = 0;
  let total = 0;
  const fromDate = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000);

  do {
    const params = new URLSearchParams({
      seller: sellerId,
      "order.status": "paid",
      "order.date_created.from": fromDate.toISOString(),
      sort: "date_desc",
      limit: String(ORDERS_PAGE_SIZE),
      offset: String(offset)
    });

    const payload = await mercadoLivreRequest<MercadoLivreOrdersSearchResponse>(
      `/orders/search?${params.toString()}`,
      accessToken
    );

    const results = payload.results ?? [];
    orders.push(...results);
    total = payload.paging?.total ?? total;
    offset += ORDERS_PAGE_SIZE;
  } while (
    orders.length < Math.min(total, MAX_ORDERS_PER_SYNC) &&
    orders.length < MAX_ORDERS_PER_SYNC
  );

  const selectedOrders = orders.slice(0, MAX_ORDERS_PER_SYNC);
  const detailedOrders: MercadoLivreOrder[] = [];

  for (const order of selectedOrders) {
    if (order.order_items?.length) {
      detailedOrders.push(order);
    } else {
      detailedOrders.push(await fetchOrderDetails(order.id, accessToken));
    }
  }

  return {
    orders: detailedOrders,
    total
  };
}

function normalizeOrder(
  order: MercadoLivreOrder,
  listingsByItemId: Map<string, ListingRow>,
  shipmentCosts: MercadoLivreShipmentCosts | null | undefined,
  sellerId: string
): NormalizedOrder {
  const items = (order.order_items ?? []).map((orderItem) => {
    const externalItemId = orderItem.item?.id ?? null;
    const listing = externalItemId ? listingsByItemId.get(externalItemId) : null;
    const sellerSku =
      normalizeSku(orderItem.item?.seller_sku) ??
      normalizeSku(orderItem.item?.seller_custom_field) ??
      normalizeSku(listing?.seller_sku) ??
      externalItemId ??
      String(order.id);
    const quantity = toNumber(orderItem.quantity);
    const unitPrice = toNumber(orderItem.unit_price ?? orderItem.full_unit_price);
    const grossAmount = quantity * unitPrice;

    return {
      externalItemId,
      sellerSku,
      title: orderItem.item?.title ?? listing?.title ?? sellerSku,
      quantity,
      unitPrice,
      grossAmount,
      marketplaceFeeAmount: toNumber(orderItem.sale_fee),
      discountAmount: 0,
      rawPayload: orderItem
    };
  });

  const itemGrossAmount = items.reduce((total, item) => total + item.grossAmount, 0);
  const orderTotalAmount = toNumber(order.total_amount);
  const paidAmount = toNumber(order.paid_amount);
  const discountsAmount = Math.max(
    0,
    itemGrossAmount - (orderTotalAmount || paidAmount || itemGrossAmount)
  );
  const marketplaceFeeAmount = items.reduce(
    (total, item) => total + item.marketplaceFeeAmount,
    0
  );
  const {
    buyerShippingCostAmount,
    sellerShippingCostAmount,
    shippingGrossAmount,
    shippingCostSource
  } = shippingAmountsFromOrder(order, shipmentCosts, sellerId);
  const shippingCostAmount = sellerShippingCostAmount;
  const taxesAmount = toNumber(order.taxes?.amount);
  const discountRatio = itemGrossAmount > 0 ? discountsAmount / itemGrossAmount : 0;

  const itemsWithDiscount = items.map((item) => ({
    ...item,
    discountAmount: item.grossAmount * discountRatio
  }));
  const grossAmount = itemGrossAmount || orderTotalAmount || paidAmount;
  const netAmount =
    grossAmount -
    discountsAmount -
    marketplaceFeeAmount -
    shippingCostAmount -
    taxesAmount;

  return {
    providerOrderId: String(order.id),
    soldAt: order.date_closed ?? order.date_created ?? new Date().toISOString(),
    status: order.status ?? "paid",
    buyerState: order.shipping?.receiver_address?.state?.name ?? null,
    grossAmount,
    marketplaceFeeAmount,
    shippingCostAmount,
    buyerShippingCostAmount,
    sellerShippingCostAmount,
    shippingGrossAmount,
    shippingCostSource,
    discountsAmount,
    taxesAmount,
    netAmount,
    items: itemsWithDiscount,
    rawPayload: {
      ...order,
      dashmarket_shipping: {
        buyer_cost_amount: buyerShippingCostAmount,
        seller_cost_amount: sellerShippingCostAmount,
        gross_amount: shippingGrossAmount,
        source: shippingCostSource
      }
    }
  };
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
        ? Math.min(Math.floor(body.daysBack), 365)
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
        resource: "orders",
        status: "running",
        metadata: { days_back: daysBack, source: "manual" }
      })
      .select("id")
      .single();

    if (syncRunError) throw syncRunError;

    try {
      const { orders, total } = await fetchOrders(
        currentAccount.external_seller_id,
        accessToken,
        daysBack
      );
      const externalItemIds = Array.from(
        new Set(
          orders
            .flatMap((order) => order.order_items ?? [])
            .map((item) => item.item?.id)
            .filter((id): id is string => Boolean(id))
        )
      );

      const { data: listingsData, error: listingsError } =
        externalItemIds.length > 0
          ? await supabase
              .from("marketplace_listings")
              .select("id, product_id, external_item_id, seller_sku, title")
              .eq("marketplace_account_id", currentAccount.id)
              .in("external_item_id", externalItemIds)
          : { data: [], error: null };

      if (listingsError) throw listingsError;

      const listingsByItemId = new Map(
        ((listingsData ?? []) as ListingRow[]).map((listing) => [
          listing.external_item_id,
          listing
        ])
      );
      const shipmentCostsById = await fetchShipmentCostsById(orders, accessToken);
      const normalizedOrders = orders.map((order) =>
        normalizeOrder(
          order,
          listingsByItemId,
          shipmentCostsById.get(getShippingId(order) ?? ""),
          currentAccount.external_seller_id
        )
      );
      const productCandidates = new Map<string, { internal_sku: string; title: string }>();

      for (const order of normalizedOrders) {
        for (const item of order.items) {
          productCandidates.set(item.sellerSku, {
            internal_sku: item.sellerSku,
            title: item.title
          });
        }
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

      if (normalizedOrders.length > 0) {
        const { error: ordersUpsertError } = await supabase.from("orders").upsert(
          normalizedOrders.map((order) => ({
            organization_id: organizationId,
            marketplace_account_id: currentAccount.id,
            provider_order_id: order.providerOrderId,
            sold_at: order.soldAt,
            status: order.status,
            buyer_state: order.buyerState,
            gross_amount: order.grossAmount,
            marketplace_fee_amount: order.marketplaceFeeAmount,
            shipping_cost_amount: order.shippingCostAmount,
            discounts_amount: order.discountsAmount,
            taxes_amount: order.taxesAmount,
            net_amount: order.netAmount,
            raw_payload: order.rawPayload
          })),
          { onConflict: "marketplace_account_id,provider_order_id" }
        );

        if (ordersUpsertError) throw ordersUpsertError;
      }

      const providerOrderIds = normalizedOrders.map((order) => order.providerOrderId);
      const { data: savedOrdersData, error: savedOrdersError } =
        providerOrderIds.length > 0
          ? await supabase
              .from("orders")
              .select("id, provider_order_id")
              .eq("marketplace_account_id", currentAccount.id)
              .in("provider_order_id", providerOrderIds)
          : { data: [], error: null };

      if (savedOrdersError) throw savedOrdersError;

      const savedOrdersByProviderId = new Map(
        ((savedOrdersData ?? []) as OrderRow[]).map((order) => [
          order.provider_order_id,
          order.id
        ])
      );
      const savedOrderIds = Array.from(savedOrdersByProviderId.values());

      if (savedOrderIds.length > 0) {
        const { error: deleteItemsError } = await supabase
          .from("order_items")
          .delete()
          .in("order_id", savedOrderIds);

        if (deleteItemsError) throw deleteItemsError;
      }

      const orderItemsPayload = normalizedOrders.flatMap((order) => {
        const orderId = savedOrdersByProviderId.get(order.providerOrderId);
        if (!orderId) return [];

        return order.items.map((item) => {
          const listing = item.externalItemId
            ? listingsByItemId.get(item.externalItemId)
            : null;
          const itemBuyerShippingCost =
            order.grossAmount > 0
              ? order.buyerShippingCostAmount *
                (item.grossAmount / order.grossAmount)
              : 0;
          const itemSellerShippingCost =
            order.grossAmount > 0
              ? order.sellerShippingCostAmount *
                (item.grossAmount / order.grossAmount)
              : 0;

          return {
            organization_id: organizationId,
            order_id: orderId,
            product_id: productsBySku.get(item.sellerSku) ?? listing?.product_id ?? null,
            marketplace_listing_id: listing?.id ?? null,
            external_item_id: item.externalItemId,
            seller_sku: item.sellerSku,
            title: item.title,
            quantity: item.quantity,
            unit_price: item.unitPrice,
            gross_amount: item.grossAmount,
            marketplace_fee_amount: item.marketplaceFeeAmount,
            shipping_cost_amount: itemSellerShippingCost,
            discount_amount: item.discountAmount,
            raw_payload: {
              ...item.rawPayload,
              dashmarket_shipping: {
                buyer_cost_amount: itemBuyerShippingCost,
                seller_cost_amount: itemSellerShippingCost,
                gross_amount:
                  order.grossAmount > 0
                    ? order.shippingGrossAmount *
                      (item.grossAmount / order.grossAmount)
                    : 0,
                source: order.shippingCostSource
              }
            }
          };
        });
      });

      if (orderItemsPayload.length > 0) {
        const { error: orderItemsError } = await supabase
          .from("order_items")
          .insert(orderItemsPayload);

        if (orderItemsError) throw orderItemsError;
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
          records_processed: normalizedOrders.length,
          metadata: {
            days_back: daysBack,
            remote_total: total,
            synced_items: orderItemsPayload.length,
            gross_amount: normalizedOrders.reduce(
              (sum, order) => sum + order.grossAmount,
              0
            )
          }
        })
        .eq("id", syncRun.id);

      return NextResponse.json({
        accountName: currentAccount.account_name,
        daysBack,
        remoteTotal: total,
        syncedOrders: normalizedOrders.length,
        syncedItems: orderItemsPayload.length,
        grossAmount: normalizedOrders.reduce(
          (sum, order) => sum + order.grossAmount,
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
            error instanceof Error ? error.message : "Falha ao sincronizar vendas."
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
            : "Nao foi possivel sincronizar vendas."
      },
      { status: 500 }
    );
  }
}
