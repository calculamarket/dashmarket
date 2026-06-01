import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getMercadoLivreOAuthConfig } from "@/lib/marketplaces/mercadolivre-oauth";
import { resolvePublicSupabaseConfig } from "@/lib/supabase/public-config";

type DiagnosticStatus = "ok" | "warning" | "error";

type DiagnosticCheck = {
  label: string;
  status: DiagnosticStatus;
  message: string;
};

function addCheck(
  checks: DiagnosticCheck[],
  label: string,
  status: DiagnosticStatus,
  message: string
) {
  checks.push({ label, status, message });
}

function summarize(checks: DiagnosticCheck[]) {
  const firstError = checks.find((check) => check.status === "error");
  const firstWarning = checks.find((check) => check.status === "warning");

  if (firstError) return firstError.message;
  if (firstWarning) return firstWarning.message;
  return "Diagnostico Mercado Livre aprovado.";
}

function overallStatus(checks: DiagnosticCheck[]): DiagnosticStatus {
  if (checks.some((check) => check.status === "error")) return "error";
  if (checks.some((check) => check.status === "warning")) return "warning";
  return "ok";
}

function isMissingRelationError(error: unknown) {
  if (!error || typeof error !== "object") return false;

  const maybeError = error as { code?: string; message?: string };
  const message = maybeError.message?.toLowerCase() ?? "";

  return maybeError.code === "42P01" || message.includes("does not exist");
}

function jsonResponse(checks: DiagnosticCheck[], extra: Record<string, unknown> = {}) {
  return NextResponse.json({
    checks,
    status: overallStatus(checks),
    summary: summarize(checks),
    ...extra
  });
}

export async function POST(request: Request) {
  const requestUrl = new URL(request.url);
  const checks: DiagnosticCheck[] = [];
  const oauthConfig = getMercadoLivreOAuthConfig(requestUrl);
  const publicSupabaseConfig = resolvePublicSupabaseConfig();
  const supabaseUrl = publicSupabaseConfig?.url ?? null;
  const supabaseAnonKey = publicSupabaseConfig?.anonKey ?? null;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const authHeader = request.headers.get("authorization") ?? "";
  const accessToken = authHeader.replace(/^Bearer\s+/i, "").trim();
  const body = (await request.json().catch(() => ({}))) as {
    organizationId?: string;
  };

  addCheck(
    checks,
    "Client ID",
    oauthConfig.clientId ? "ok" : "error",
    oauthConfig.clientId
      ? `Client ID configurado em ${oauthConfig.clientIdKey}.`
      : "Configure MERCADOLIVRE_CLIENT_ID na Vercel."
  );
  addCheck(
    checks,
    "Client Secret",
    oauthConfig.clientSecret ? "ok" : "error",
    oauthConfig.clientSecret
      ? `Client Secret configurado em ${oauthConfig.clientSecretKey}.`
      : "Configure MERCADOLIVRE_CLIENT_SECRET na Vercel."
  );
  addCheck(
    checks,
    "Callback",
    oauthConfig.redirectUri.startsWith("https://") ||
      oauthConfig.redirectUri.startsWith("http://localhost") ||
      oauthConfig.redirectUri.startsWith("http://127.0.0.1")
      ? "ok"
      : "error",
    `Callback em uso: ${oauthConfig.redirectUri}`
  );
  addCheck(
    checks,
    "Supabase publico",
    supabaseUrl && supabaseAnonKey ? "ok" : "error",
    supabaseUrl && supabaseAnonKey
      ? "Supabase publico configurado."
      : "Configure as variaveis publicas do Supabase ou use o fallback do DASHMARKET."
  );
  addCheck(
    checks,
    "Supabase servico",
    serviceRoleKey ? "ok" : "error",
    serviceRoleKey
      ? "Chave de servico configurada."
      : "Configure SUPABASE_SERVICE_ROLE_KEY."
  );

  if (!body.organizationId) {
    addCheck(
      checks,
      "Empresa",
      "error",
      "Empresa nao identificada na sessao do DASHMARKET."
    );
  }

  if (!accessToken) {
    addCheck(checks, "Sessao", "error", "Sessao expirada. Entre novamente.");
  }

  if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey || !accessToken) {
    return jsonResponse(checks, {
      appUrl: oauthConfig.appUrl,
      redirectUri: oauthConfig.redirectUri
    });
  }

  const userClient = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false },
    global: {
      headers: {
        authorization: `Bearer ${accessToken}`
      }
    }
  });
  const { data: userData, error: userError } =
    await userClient.auth.getUser(accessToken);

  if (userError || !userData.user) {
    addCheck(
      checks,
      "Sessao",
      "error",
      "Sessao do DASHMARKET invalida ou expirada."
    );
    return jsonResponse(checks, {
      appUrl: oauthConfig.appUrl,
      redirectUri: oauthConfig.redirectUri
    });
  }

  addCheck(checks, "Sessao", "ok", "Sessao do DASHMARKET valida.");

  if (body.organizationId) {
    const { error: memberError } = await userClient
      .from("organization_members")
      .select("role")
      .eq("organization_id", body.organizationId)
      .eq("user_id", userData.user.id)
      .maybeSingle();

    addCheck(
      checks,
      "Empresa",
      memberError ? "error" : "ok",
      memberError
        ? "Usuario sem acesso confirmado a esta empresa."
        : "Empresa vinculada ao usuario."
    );
  }

  const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false }
  });

  if (body.organizationId) {
    const { data: account, error: accountError } = await serviceClient
      .from("marketplace_accounts")
      .select("id, account_name, external_seller_id, status, last_sync_at")
      .eq("organization_id", body.organizationId)
      .eq("provider", "mercadolivre")
      .order("last_sync_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (accountError) {
      addCheck(
        checks,
        "Tabela marketplace",
        isMissingRelationError(accountError) ? "error" : "warning",
        isMissingRelationError(accountError)
          ? "Tabelas do Mercado Livre nao existem no Supabase. Execute a migration inicial."
          : accountError.message
      );
    } else if (!account) {
      addCheck(
        checks,
        "Conta Mercado Livre",
        "warning",
        "Nenhuma conta Mercado Livre conectada ainda."
      );
    } else {
      addCheck(
        checks,
        "Conta Mercado Livre",
        account.status === "connected" ? "ok" : "warning",
        `${account.account_name} (${account.external_seller_id}) esta com status ${account.status}.`
      );

      const { data: credentials, error: credentialsError } = await serviceClient
        .from("marketplace_account_credentials")
        .select("refresh_token, token_expires_at")
        .eq("account_id", account.id)
        .maybeSingle();

      if (credentialsError) {
        addCheck(
          checks,
          "Credenciais salvas",
          isMissingRelationError(credentialsError) ? "error" : "warning",
          isMissingRelationError(credentialsError)
            ? "Tabela de credenciais nao existe no Supabase."
            : credentialsError.message
        );
      } else if (!credentials) {
        addCheck(
          checks,
          "Credenciais salvas",
          "error",
          "Conta existe, mas os tokens nao foram salvos."
        );
      } else if (!credentials.token_expires_at && credentials.refresh_token) {
        addCheck(
          checks,
          "Credenciais salvas",
          "warning",
          "Tokens salvos, mas sem data de expiracao. A proxima sincronizacao tentara renovar automaticamente."
        );
      } else if (
        credentials.token_expires_at &&
        new Date(credentials.token_expires_at).getTime() < Date.now() &&
        credentials.refresh_token
      ) {
        addCheck(
          checks,
          "Credenciais salvas",
          "warning",
          "Token expirado, mas existe refresh token. A proxima sincronizacao tentara renovar automaticamente."
        );
      } else if (
        credentials.token_expires_at &&
        new Date(credentials.token_expires_at).getTime() < Date.now() &&
        !credentials.refresh_token
      ) {
        addCheck(
          checks,
          "Credenciais salvas",
          "error",
          "Token expirou e nao existe refresh token salvo."
        );
      } else {
        const tokenOk = credentials.token_expires_at
          ? `Tokens salvos. Expira em ${new Date(credentials.token_expires_at).toLocaleString("pt-BR")}.`
          : "Tokens salvos.";
        addCheck(checks, "Credenciais salvas", "ok", tokenOk);

        // Testa o token real fazendo uma chamada autenticada à API do ML
        try {
          const { data: creds } = await serviceClient
            .from("marketplace_account_credentials")
            .select("access_token, refresh_token")
            .eq("account_id", account.id)
            .maybeSingle();

          if (creds?.access_token) {
            const mlTestRes = await fetch(
              `https://api.mercadolibre.com/users/${account.external_seller_id}`,
              {
                cache: "no-store",
                headers: {
                  accept: "application/json",
                  authorization: `Bearer ${creds.access_token}`
                }
              }
            );
            if (mlTestRes.ok) {
              addCheck(checks, "Token autenticado", "ok", "Token válido — chamada autenticada à API do ML bem-sucedida.");
            } else if (mlTestRes.status === 401) {
              addCheck(
                checks,
                "Token autenticado",
                creds.refresh_token ? "warning" : "error",
                creds.refresh_token
                  ? "Token expirado, mas há refresh token. A próxima sincronização renovará automaticamente."
                  : "Token inválido/expirado e sem refresh token. Reconecte a conta no Conector."
              );
            } else {
              addCheck(checks, "Token autenticado", "warning", `API ML respondeu HTTP ${mlTestRes.status} na verificação do token.`);
            }
          }
        } catch {
          addCheck(checks, "Token autenticado", "warning", "Não foi possível testar o token autenticado.");
        }
      }
    }
  }

  try {
    const mercadoLivreResponse = await fetch(
      "https://api.mercadolibre.com/sites/MLB",
      { cache: "no-store" }
    );

    addCheck(
      checks,
      "API Mercado Livre",
      mercadoLivreResponse.ok ? "ok" : "warning",
      mercadoLivreResponse.ok
        ? "API publica do Mercado Livre respondeu."
        : `Mercado Livre respondeu HTTP ${mercadoLivreResponse.status}.`
    );
  } catch {
    addCheck(
      checks,
      "API Mercado Livre",
      "warning",
      "Nao foi possivel acessar a API publica do Mercado Livre a partir do servidor."
    );
  }

  return jsonResponse(checks, {
    appUrl: oauthConfig.appUrl,
    redirectUri: oauthConfig.redirectUri
  });
}
