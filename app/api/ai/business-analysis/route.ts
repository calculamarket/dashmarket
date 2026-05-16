import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { resolvePublicSupabaseConfig } from "@/lib/supabase/public-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const DEFAULT_OPENAI_MODEL = "gpt-5.2";

type AnalysisRequestBody = {
  organizationId?: string;
  [key: string]: unknown;
};

type OrganizationMemberRow = {
  organization_id: string;
  user_id: string;
};

type OrganizationRow = {
  id: string;
  name: string;
};

type OpenAiErrorPayload = {
  error?: {
    message?: string;
  };
};

type ResponseContent = {
  text?: string;
  type?: string;
};

type ResponseOutput = {
  content?: ResponseContent[];
  type?: string;
};

type OpenAiResponsePayload = {
  error?: {
    message?: string;
  };
  output?: ResponseOutput[];
  output_text?: string;
};

const analysisItemSchema = {
  type: "object",
  additionalProperties: false,
  required: ["title", "severity", "summary", "evidence", "recommendation"],
  properties: {
    title: { type: "string" },
    severity: {
      type: "string",
      enum: ["critical", "warning", "positive", "info"]
    },
    summary: { type: "string" },
    evidence: { type: "string" },
    recommendation: { type: "string" }
  }
};

const businessAnalysisSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "score",
    "status",
    "executiveSummary",
    "diagnosis",
    "opportunities",
    "risks",
    "recommendedActions",
    "adsAnalysis",
    "profitabilityAnalysis",
    "stockAnalysis",
    "skuHighlights",
    "questionsToInvestigate"
  ],
  properties: {
    score: { type: "number" },
    status: {
      type: "string",
      enum: ["critical", "warning", "positive", "info"]
    },
    executiveSummary: { type: "string" },
    diagnosis: {
      type: "array",
      items: analysisItemSchema
    },
    opportunities: {
      type: "array",
      items: analysisItemSchema
    },
    risks: {
      type: "array",
      items: analysisItemSchema
    },
    recommendedActions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["priority", "action", "expectedImpact", "reason"],
        properties: {
          priority: { type: "string" },
          action: { type: "string" },
          expectedImpact: { type: "string" },
          reason: { type: "string" }
        }
      }
    },
    adsAnalysis: {
      type: "object",
      additionalProperties: false,
      required: ["verdict", "tacosRead", "investmentRead", "recommendation"],
      properties: {
        verdict: { type: "string" },
        tacosRead: { type: "string" },
        investmentRead: { type: "string" },
        recommendation: { type: "string" }
      }
    },
    profitabilityAnalysis: {
      type: "object",
      additionalProperties: false,
      required: ["verdict", "marginRead", "trendRead", "recommendation"],
      properties: {
        verdict: { type: "string" },
        marginRead: { type: "string" },
        trendRead: { type: "string" },
        recommendation: { type: "string" }
      }
    },
    stockAnalysis: {
      type: "object",
      additionalProperties: false,
      required: ["verdict", "capitalRead", "riskRead", "recommendation"],
      properties: {
        verdict: { type: "string" },
        capitalRead: { type: "string" },
        riskRead: { type: "string" },
        recommendation: { type: "string" }
      }
    },
    skuHighlights: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["sku", "title", "severity", "issue", "evidence", "action"],
        properties: {
          sku: { type: "string" },
          title: { type: "string" },
          severity: {
            type: "string",
            enum: ["critical", "warning", "positive", "info"]
          },
          issue: { type: "string" },
          evidence: { type: "string" },
          action: { type: "string" }
        }
      }
    },
    questionsToInvestigate: {
      type: "array",
      items: { type: "string" }
    }
  }
};

function jsonError(status: number, error: string, details?: string) {
  return NextResponse.json({ details, error }, { status });
}

function unknownErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : undefined;
}

function bearerToken(request: Request) {
  return (request.headers.get("authorization") ?? "")
    .replace(/^Bearer\s+/i, "")
    .trim();
}

function extractResponseText(payload: OpenAiResponsePayload) {
  if (typeof payload.output_text === "string" && payload.output_text.trim()) {
    return payload.output_text;
  }

  for (const output of payload.output ?? []) {
    for (const content of output.content ?? []) {
      if (typeof content.text === "string" && content.text.trim()) {
        return content.text;
      }
    }
  }

  return "";
}

function compactBody(body: AnalysisRequestBody) {
  return {
    ...body,
    prioritySkus: Array.isArray(body.prioritySkus)
      ? body.prioritySkus.slice(0, 10)
      : [],
    recentSales: Array.isArray(body.recentSales) ? body.recentSales.slice(0, 15) : [],
    topProducts: Array.isArray(body.topProducts) ? body.topProducts.slice(0, 15) : []
  };
}

export async function POST(request: Request) {
  const openAiKey = process.env.OPENAI_API_KEY?.trim();
  const model = process.env.OPENAI_MODEL?.trim() || DEFAULT_OPENAI_MODEL;
  const publicSupabaseConfig = resolvePublicSupabaseConfig();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const accessToken = bearerToken(request);

  if (!publicSupabaseConfig) {
    return jsonError(500, "Supabase nao configurado.");
  }

  if (!accessToken) {
    return jsonError(401, "Sessao expirada. Entre novamente.");
  }

  const body = (await request.json().catch(() => ({}))) as AnalysisRequestBody;
  const organizationId = body.organizationId?.trim();

  if (!organizationId) {
    return jsonError(400, "Empresa nao identificada para analise.");
  }

  const authClient = createClient(
    publicSupabaseConfig.url,
    serviceRoleKey || publicSupabaseConfig.anonKey,
    {
      auth: { persistSession: false }
    }
  );

  const { data: userData, error: userError } =
    await authClient.auth.getUser(accessToken);

  if (userError || !userData.user) {
    return jsonError(
      401,
      "Sessao do DASHMARKET invalida ou expirada.",
      userError?.message
    );
  }

  const userClient = createClient(
    publicSupabaseConfig.url,
    publicSupabaseConfig.anonKey,
    {
      auth: { persistSession: false },
      global: {
        headers: {
          authorization: `Bearer ${accessToken}`
        }
      }
    }
  );

  let organization: OrganizationRow | null = null;

  if (serviceRoleKey) {
    const serviceClient = createClient(publicSupabaseConfig.url, serviceRoleKey, {
      auth: { persistSession: false }
    });

    const { data: member, error: memberError } = await serviceClient
      .from("organization_members")
      .select("organization_id, user_id")
      .eq("organization_id", organizationId)
      .eq("user_id", userData.user.id)
      .maybeSingle();

    if (memberError) {
      return jsonError(
        500,
        "Nao foi possivel validar o acesso a empresa.",
        memberError.message
      );
    }

    if (!(member as OrganizationMemberRow | null)) {
      return jsonError(403, "Usuario sem acesso a esta empresa.");
    }

    const { data: organizationData, error: organizationError } =
      await serviceClient
        .from("organizations")
        .select("id, name")
        .eq("id", organizationId)
        .maybeSingle();

    if (organizationError) {
      return jsonError(
        500,
        "Nao foi possivel validar a empresa.",
        organizationError.message
      );
    }

    organization = organizationData as OrganizationRow | null;
  } else {
    const { data: organizationData, error: organizationError } = await userClient
      .from("organizations")
      .select("id, name")
      .eq("id", organizationId)
      .maybeSingle();

    if (organizationError) {
      return jsonError(
        500,
        "Nao foi possivel validar a empresa.",
        organizationError.message
      );
    }

    organization = organizationData as OrganizationRow | null;
  }

  if (!organization) {
    return jsonError(403, "Usuario sem acesso a esta empresa.");
  }

  if (!openAiKey) {
    return jsonError(
      500,
      "OpenAI nao configurada.",
      "Configure OPENAI_API_KEY nas variaveis de ambiente da Vercel."
    );
  }

  const analysisInput = compactBody({
    ...body,
    organizationName: organization.name,
    userEmail: userData.user.email ?? null
  });

  let openAiResponse: Response;

  try {
    openAiResponse = await fetch(OPENAI_RESPONSES_URL, {
      body: JSON.stringify({
        input: [
          {
            content: [
              {
                text: [
                  "Analise o negocio do DASHMARKET com base nos dados abaixo.",
                  "Responda em portugues do Brasil, com linguagem objetiva para decisao comercial.",
                  "Use apenas os dados enviados. Quando faltar base, diga que falta base e sugira o que sincronizar/cadastrar.",
                  "Nao invente numeros. Priorize margem, ADS/TACOS, estoque, SKUs e financeiro.",
                  "",
                  JSON.stringify(analysisInput)
                ].join("\n"),
                type: "input_text"
              }
            ],
            role: "user"
          }
        ],
        max_output_tokens: 3000,
        model,
        text: {
          format: {
            name: "dashmarket_business_analysis",
            schema: businessAnalysisSchema,
            strict: true,
            type: "json_schema"
          }
        }
      }),
      headers: {
        authorization: `Bearer ${openAiKey}`,
        "content-type": "application/json"
      },
      method: "POST"
    });
  } catch (error) {
    return jsonError(
      502,
      "Nao foi possivel conversar com a OpenAI.",
      unknownErrorMessage(error)
    );
  }

  const openAiPayload = (await openAiResponse.json().catch(() => ({}))) as
    | OpenAiResponsePayload
    | OpenAiErrorPayload;

  if (!openAiResponse.ok) {
    return jsonError(
      openAiResponse.status,
      "Nao foi possivel gerar a analise com a OpenAI.",
      openAiPayload.error?.message
    );
  }

  const responseText = extractResponseText(openAiPayload as OpenAiResponsePayload);

  if (!responseText) {
    return jsonError(502, "A OpenAI nao retornou uma analise legivel.");
  }

  try {
    return NextResponse.json({
      analysis: JSON.parse(responseText),
      generatedAt: new Date().toISOString(),
      model
    });
  } catch {
    return jsonError(
      502,
      "A OpenAI retornou uma analise fora do formato esperado.",
      responseText.slice(0, 500)
    );
  }
}
