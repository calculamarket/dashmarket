import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { resolveAppUrl } from "@/lib/marketplaces/mercadolivre-oauth";
import { getMercadoLivreServerConfig } from "@/lib/marketplaces/mercadolivre-server-config";

type OAuthState = {
  organizationId?: string;
};

type MercadoLivreTokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  user_id: number;
};

type MercadoLivreUser = {
  id: number;
  nickname?: string;
  first_name?: string;
  last_name?: string;
  site_id?: string;
};

function parseState(state: string | null): OAuthState {
  if (!state) return {};

  try {
    return JSON.parse(Buffer.from(state, "base64url").toString("utf8")) as OAuthState;
  } catch {
    return {};
  }
}

function redirectWithStatus(appUrl: string, status: string, detail?: string) {
  const redirectUrl = new URL("/", appUrl);
  redirectUrl.searchParams.set("ml_status", status);

  if (detail) {
    redirectUrl.searchParams.set("ml_detail", detail);
  }

  return NextResponse.redirect(redirectUrl);
}

function tokenErrorDetail(status: number, body: string) {
  try {
    const payload = JSON.parse(body) as {
      error?: string;
      message?: string;
      error_description?: string;
    };
    const detail = [
      payload.error,
      payload.error_description ?? payload.message
    ]
      .filter(Boolean)
      .join(": ");

    return detail ? detail.slice(0, 240) : `HTTP ${status}`;
  } catch {
    return `HTTP ${status}`;
  }
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const state = parseState(requestUrl.searchParams.get("state"));
  const appUrl = resolveAppUrl(requestUrl);

  if (!code || !state.organizationId) {
    return redirectWithStatus(appUrl, "invalid_callback");
  }

  let serverConfig: ReturnType<typeof getMercadoLivreServerConfig>;
  try {
    serverConfig = getMercadoLivreServerConfig(requestUrl);
  } catch (error) {
    return redirectWithStatus(
      appUrl,
      "missing_env",
      error instanceof Error ? error.message : "Variaveis de ambiente incompletas."
    );
  }

  const tokenPayload = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: serverConfig.clientId ?? "",
    client_secret: serverConfig.clientSecret ?? "",
    code,
    redirect_uri: serverConfig.redirectUri
  });

  const tokenResponse = await fetch("https://api.mercadolibre.com/oauth/token", {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/x-www-form-urlencoded"
    },
    body: tokenPayload
  });

  if (!tokenResponse.ok) {
    const tokenResponseBody = await tokenResponse.text();
    console.error("Mercado Livre token exchange failed", {
      status: tokenResponse.status,
      body: tokenResponseBody
    });
    return redirectWithStatus(
      appUrl,
      "token_error",
      tokenErrorDetail(tokenResponse.status, tokenResponseBody)
    );
  }

  const token = (await tokenResponse.json()) as MercadoLivreTokenResponse;
  const userResponse = await fetch("https://api.mercadolibre.com/users/me", {
    headers: {
      authorization: `Bearer ${token.access_token}`
    }
  });

  if (!userResponse.ok) {
    console.error("Mercado Livre user lookup failed", {
      status: userResponse.status,
      body: await userResponse.text()
    });
    return redirectWithStatus(appUrl, "user_error");
  }

  const user = (await userResponse.json()) as MercadoLivreUser;
  const supabase = createClient(serverConfig.supabaseUrl, serverConfig.serviceRoleKey, {
    auth: { persistSession: false }
  });
  const fallbackName = [user.first_name, user.last_name].filter(Boolean).join(" ");
  const accountName = user.nickname ?? (fallbackName || `Seller ${user.id}`);

  const { data: account, error: accountError } = await supabase
    .from("marketplace_accounts")
    .upsert(
      {
        organization_id: state.organizationId,
        provider: "mercadolivre",
        external_seller_id: String(user.id ?? token.user_id),
        account_name: accountName,
        site_id: user.site_id ?? "MLB",
        status: "connected",
        last_sync_at: new Date().toISOString()
      },
      {
        onConflict: "organization_id,provider,external_seller_id"
      }
    )
    .select("id")
    .single();

  if (accountError || !account) {
    console.error("Mercado Livre account save failed", accountError);
    return redirectWithStatus(appUrl, "save_error");
  }

  const expiresAt = token.expires_in
    ? new Date(Date.now() + token.expires_in * 1000).toISOString()
    : null;

  const { error: credentialsError } = await supabase
    .from("marketplace_account_credentials")
    .upsert({
      account_id: account.id,
      access_token: token.access_token,
      refresh_token: token.refresh_token,
      token_expires_at: expiresAt,
      scopes: token.scope ? token.scope.split(" ") : []
    });

  if (credentialsError) {
    console.error("Mercado Livre credentials save failed", credentialsError);
    return redirectWithStatus(appUrl, "save_error");
  }

  return redirectWithStatus(appUrl, "connected");
}
