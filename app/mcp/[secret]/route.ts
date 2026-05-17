import { timingSafeEqual } from "node:crypto";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import {
  createDashmarketMcpServer,
  loadProjectEnv
} from "@/mcp/src/index";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    secret: string;
  }>;
};

const corsHeaders = {
  "Access-Control-Allow-Headers":
    "authorization, content-type, mcp-protocol-version, mcp-session-id",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Origin": "*",
  "Cache-Control": "no-store"
};

function jsonResponse(status: number, payload: Record<string, unknown>) {
  return Response.json(payload, {
    headers: corsHeaders,
    status
  });
}

function safeEquals(current: string, expected: string) {
  const currentBuffer = Buffer.from(current);
  const expectedBuffer = Buffer.from(expected);

  return (
    currentBuffer.length === expectedBuffer.length &&
    timingSafeEqual(currentBuffer, expectedBuffer)
  );
}

async function authorize(context: RouteContext) {
  const { secret } = await context.params;
  const expectedSecret = process.env.DASHMARKET_MCP_CONNECTOR_SECRET?.trim();

  if (!expectedSecret) {
    return {
      error: jsonResponse(503, {
        error:
          "MCP do ChatGPT ainda nao configurado. Configure DASHMARKET_MCP_CONNECTOR_SECRET na Vercel."
      })
    };
  }

  if (!safeEquals(secret, expectedSecret)) {
    return {
      error: jsonResponse(404, {
        error: "MCP nao encontrado."
      })
    };
  }

  return { error: null };
}

function withCors(response: Response) {
  const headers = new Headers(response.headers);

  for (const [key, value] of Object.entries(corsHeaders)) {
    headers.set(key, value);
  }

  return new Response(response.body, {
    headers,
    status: response.status,
    statusText: response.statusText
  });
}

async function handleMcpRequest(request: Request, context: RouteContext) {
  const authorization = await authorize(context);
  if (authorization.error) return authorization.error;

  loadProjectEnv();

  const server = createDashmarketMcpServer();
  const transport = new WebStandardStreamableHTTPServerTransport({
    enableJsonResponse: true,
    sessionIdGenerator: undefined
  });

  await server.connect(transport);

  try {
    return withCors(await transport.handleRequest(request));
  } catch (error) {
    return jsonResponse(500, {
      error: error instanceof Error ? error.message : "Falha no MCP DASHMARKET."
    });
  }
}

export async function OPTIONS() {
  return new Response(null, {
    headers: corsHeaders,
    status: 204
  });
}

export async function GET(request: Request, context: RouteContext) {
  return handleMcpRequest(request, context);
}

export async function POST(request: Request, context: RouteContext) {
  return handleMcpRequest(request, context);
}

export async function DELETE(request: Request, context: RouteContext) {
  return handleMcpRequest(request, context);
}
