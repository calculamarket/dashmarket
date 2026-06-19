import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getMercadoLivreServerConfig } from "@/lib/marketplaces/mercadolivre-server-config";

// CORS headers configuration
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders,
  });
}

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

function isTokenExpiring(credentials: MarketplaceCredentials) {
  if (!credentials.token_expires_at) return Boolean(credentials.refresh_token);
  const expiresAt = new Date(credentials.token_expires_at).getTime();
  return !Number.isFinite(expiresAt) || expiresAt < Date.now() + 5 * 60 * 1000;
}

async function refreshAccessToken(
  supabase: any,
  accountId: string,
  credentials: MarketplaceCredentials,
  clientId: string,
  clientSecret: string
): Promise<string> {
  if (!credentials.refresh_token || !isTokenExpiring(credentials)) {
    return credentials.access_token;
  }

  const payload = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: credentials.refresh_token,
  });

  const response = await fetch("https://api.mercadolibre.com/oauth/token", {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/x-www-form-urlencoded",
    },
    body: payload,
  });

  if (!response.ok) {
    throw new Error(`Mercado Livre token refresh failed with status ${response.status}`);
  }

  const token = (await response.json()) as TokenRefreshResponse;
  const expiresAt = token.expires_in
    ? new Date(Date.now() + token.expires_in * 1000).toISOString()
    : credentials.token_expires_at;

  const upsertData: MarketplaceCredentialsUpsert = {
    account_id: accountId,
    access_token: token.access_token,
    refresh_token: token.refresh_token ?? credentials.refresh_token,
    token_expires_at: expiresAt,
    scopes: token.scope ? token.scope.split(" ") : credentials.scopes ?? [],
  };

  const { error } = await supabase
    .from("marketplace_account_credentials")
    .upsert(upsertData);

  if (error) {
    throw new Error(`Failed to save refreshed credentials: ${error.message}`);
  }

  return token.access_token;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const itemId = searchParams.get("itemId")?.trim().toUpperCase();
    const zipCode = searchParams.get("zipCode")?.trim() || "01311000"; // Default to Avenida Paulista, SP

    if (!itemId) {
      return NextResponse.json(
        { error: "Parameter 'itemId' is required." },
        { status: 400, headers: corsHeaders }
      );
    }

    // Load server configurations (Supabase + Mercado Livre credentials)
    const config = getMercadoLivreServerConfig(new URL(request.url));
    const { clientId, clientSecret, serviceRoleKey, supabaseUrl } = config;

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    // Retrieve the first active credentials in the database
    const { data: credentialRow, error: credError } = await supabase
      .from("marketplace_account_credentials")
      .select("account_id, access_token, refresh_token, token_expires_at, scopes")
      .limit(1)
      .maybeSingle();

    if (credError) {
      return NextResponse.json(
        { error: `Database error retrieving credentials: ${credError.message}` },
        { status: 500, headers: corsHeaders }
      );
    }

    if (!credentialRow) {
      return NextResponse.json(
        { error: "No connected Mercado Livre accounts found in Dashmarket. Please link an account first." },
        { status: 401, headers: corsHeaders }
      );
    }

    // Get a valid access token (refreshing if expired)
    let accessToken: string;
    try {
      accessToken = await refreshAccessToken(
        supabase,
        credentialRow.account_id,
        credentialRow,
        clientId,
        clientSecret
      );
    } catch (refreshErr: any) {
      return NextResponse.json(
        { error: `Error refreshing access token: ${refreshErr.message}` },
        { status: 500, headers: corsHeaders }
      );
    }

    // Fetch listing details from Mercado Livre API
    const itemResponse = await fetch(`https://api.mercadolibre.com/items/${itemId}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!itemResponse.ok) {
      const errorText = await itemResponse.text();
      return NextResponse.json(
        { error: `Mercado Livre API error fetching item details (${itemResponse.status}): ${errorText}` },
        { status: itemResponse.status, headers: corsHeaders }
      );
    }

    const item = await itemResponse.json();
    const siteId = item.site_id || itemId.slice(0, 3);
    const categoryId = item.category_id;
    const price = item.price;

    // Concurrently fetch listing fees, category name, and shipping options
    const [pricesRes, categoryRes, shippingRes] = await Promise.all([
      // 1. Listing prices (commissions)
      fetch(`https://api.mercadolibre.com/sites/${siteId}/listing_prices?price=${price}&category_id=${categoryId}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      }).then((res) => (res.ok ? res.json() : null)).catch(() => null),

      // 2. Category details
      fetch(`https://api.mercadolibre.com/categories/${categoryId}`).then((res) => (res.ok ? res.json() : null)).catch(() => null),

      // 3. Shipping options
      fetch(`https://api.mercadolibre.com/items/${itemId}/shipping_options?zip_code=${zipCode}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      }).then((res) => (res.ok ? res.json() : null)).catch(() => null),
    ]);

    // Parse commission options
    const commissions: Array<{
      id: string;
      name: string;
      percentage: number;
      amount: number;
      fixedFee: number;
    }> = [];

    if (Array.isArray(pricesRes)) {
      for (const priceOption of pricesRes) {
        const typeId = priceOption.listing_type_id;
        const typeName = priceOption.listing_type_name || typeId;
        const saleFeeAmount = priceOption.sale_fee_amount || 0;

        // In Brazil/Mercado Livre, price < 79 adds a fixed fee of R$ 6.00 to the commission.
        // We can isolate the percentage vs fixed fee.
        const isLowPrice = price < 79;
        const fixedFee = isLowPrice ? 6.00 : 0.00;
        const variableAmount = Math.max(0, saleFeeAmount - fixedFee);
        const percentage = price > 0 ? (variableAmount / price) * 100 : 0;

        commissions.push({
          id: typeId,
          name: typeName,
          percentage: parseFloat(percentage.toFixed(2)),
          amount: parseFloat(saleFeeAmount.toFixed(2)),
          fixedFee,
        });
      }
    }

    // Find commission details for the current listing type
    const activeCommission = commissions.find((c) => c.id === item.listing_type_id) || null;

    // Parse shipping details
    const shippingOptions = (shippingRes?.options || []).map((opt: any) => {
      const listCost = opt.list_cost || 0;
      const cost = opt.cost || 0;
      return {
        name: opt.name,
        listCost: parseFloat(listCost.toFixed(2)),
        buyerCost: parseFloat(cost.toFixed(2)),
        sellerCostReputation50: parseFloat((listCost * 0.5).toFixed(2)), // 50% discount for green reputation / official stores
        sellerCostReputation40: parseFloat((listCost * 0.6).toFixed(2)), // 40% discount for yellow reputation
      };
    });

    const primaryShipping = shippingOptions[0] || null;

    // Compute sales velocity (average sales per day)
    let salesVelocityPerDay = 0;
    if (item.date_created && item.sold_quantity) {
      const createdDate = new Date(item.date_created);
      const diffTime = Math.abs(Date.now() - createdDate.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      if (diffDays > 0) {
        salesVelocityPerDay = item.sold_quantity / diffDays;
      }
    }

    // Fetch seller information if available
    let sellerNickname = "Seller";
    if (item.seller_id) {
      const sellerRes = await fetch(`https://api.mercadolibre.com/users/${item.seller_id}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      }).then((res) => (res.ok ? res.json() : null)).catch(() => null);
      if (sellerRes) {
        sellerNickname = sellerRes.nickname;
      }
    }

    const payload = {
      id: item.id,
      title: item.title,
      price: parseFloat(price.toFixed(2)),
      currency: item.currency_id,
      soldQuantity: item.sold_quantity || 0,
      availableQuantity: item.available_quantity || 0,
      listingTypeId: item.listing_type_id,
      dateCreated: item.date_created,
      permalink: item.permalink,
      thumbnail: item.thumbnail,
      categoryId,
      categoryName: categoryRes?.name || "Outros",
      seller: {
        id: item.seller_id,
        nickname: sellerNickname,
      },
      shipping: {
        freeShipping: item.shipping?.free_shipping || false,
        logisticType: item.shipping?.logistic_type || "default",
        options: shippingOptions,
        primary: primaryShipping,
      },
      commissions,
      activeCommission,
      salesVelocity: {
        perDay: parseFloat(salesVelocityPerDay.toFixed(2)),
        perMonth: parseFloat((salesVelocityPerDay * 30).toFixed(2)),
      },
      analyzedAt: new Date().toISOString(),
    };

    return NextResponse.json(payload, { headers: corsHeaders });
  } catch (err: any) {
    return NextResponse.json(
      { error: `Server error: ${err.message}` },
      { status: 500, headers: corsHeaders }
    );
  }
}
