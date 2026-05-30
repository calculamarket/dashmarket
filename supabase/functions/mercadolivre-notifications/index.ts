import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

type MercadoLivreNotification = {
  _id?: string;
  resource?: string;
  user_id?: number;
  topic?: string;
  application_id?: number;
  attempts?: number;
  sent?: string;
  received?: string;
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

  if (!supabaseUrl || !serviceRoleKey) {
    return Response.json(
      { error: "Variaveis de ambiente incompletas." },
      { status: 500, headers: corsHeaders }
    );
  }

  const payload = (await request.json()) as MercadoLivreNotification;
  const externalUserId = payload.user_id ? String(payload.user_id) : null;
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const { data: account } = externalUserId
    ? await supabase
        .from("marketplace_accounts")
        .select("id, organization_id")
        .eq("provider", "mercadolivre")
        .eq("external_seller_id", externalUserId)
        .maybeSingle()
    : { data: null };

  const { error } = await supabase.from("marketplace_events").insert({
    organization_id: account?.organization_id ?? null,
    marketplace_account_id: account?.id ?? null,
    provider: "mercadolivre",
    topic: payload.topic ?? "unknown",
    resource: payload.resource ?? "unknown",
    external_user_id: externalUserId,
    attempts: payload.attempts ?? null,
    payload
  });

  if (error) {
    return Response.json(
      { error: "Nao foi possivel registrar a notificacao.", detail: error },
      { status: 500, headers: corsHeaders }
    );
  }

  return Response.json({ ok: true }, { headers: corsHeaders });
});
