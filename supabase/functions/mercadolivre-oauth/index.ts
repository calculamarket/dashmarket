import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

type OAuthRequest = {
  code: string;
  organization_id: string;
  redirect_uri: string;
  code_verifier?: string;
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

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return Response.json(
      { error: "Metodo nao permitido." },
      { status: 405, headers: corsHeaders }
    );
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const clientId = Deno.env.get("MERCADOLIVRE_CLIENT_ID");
  const clientSecret = Deno.env.get("MERCADOLIVRE_CLIENT_SECRET");

  if (!supabaseUrl || !serviceRoleKey || !clientId || !clientSecret) {
    return Response.json(
      { error: "Variaveis de ambiente incompletas." },
      { status: 500, headers: corsHeaders }
    );
  }

  const body = (await request.json()) as OAuthRequest;

  if (!body.code || !body.organization_id || !body.redirect_uri) {
    return Response.json(
      { error: "code, organization_id e redirect_uri sao obrigatorios." },
      { status: 400, headers: corsHeaders }
    );
  }

  const tokenPayload = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: clientId,
    client_secret: clientSecret,
    code: body.code,
    redirect_uri: body.redirect_uri
  });

  if (body.code_verifier) {
    tokenPayload.set("code_verifier", body.code_verifier);
  }

  const tokenResponse = await fetch("https://api.mercadolibre.com/oauth/token", {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/x-www-form-urlencoded"
    },
    body: tokenPayload
  });

  if (!tokenResponse.ok) {
    return Response.json(
      {
        error: "Falha ao trocar codigo OAuth.",
        detail: await tokenResponse.text()
      },
      { status: tokenResponse.status, headers: corsHeaders }
    );
  }

  const token = (await tokenResponse.json()) as MercadoLivreTokenResponse;
  const userResponse = await fetch("https://api.mercadolibre.com/users/me", {
    headers: {
      authorization: `Bearer ${token.access_token}`
    }
  });

  if (!userResponse.ok) {
    return Response.json(
      {
        error: "Token recebido, mas usuario nao pode ser consultado.",
        detail: await userResponse.text()
      },
      { status: userResponse.status, headers: corsHeaders }
    );
  }

  const user = (await userResponse.json()) as MercadoLivreUser;
  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const fallbackName = [user.first_name, user.last_name].filter(Boolean).join(" ");
  const accountName = user.nickname ?? (fallbackName || `Seller ${user.id}`);

  const { data: account, error: accountError } = await supabase
    .from("marketplace_accounts")
    .upsert(
      {
        organization_id: body.organization_id,
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
    .select("id, organization_id, provider, external_seller_id, account_name, site_id, status")
    .single();

  if (accountError || !account) {
    return Response.json(
      { error: "Nao foi possivel salvar a conta Mercado Livre.", detail: accountError },
      { status: 500, headers: corsHeaders }
    );
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
    return Response.json(
      { error: "Conta criada, mas credenciais nao foram salvas.", detail: credentialsError },
      { status: 500, headers: corsHeaders }
    );
  }

  return Response.json({ account }, { headers: corsHeaders });
});
