import { NextResponse } from "next/server";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createDashmarketMcpServer } from "@/lib/mcp/core";

function getValidSecrets(): string[] {
  return [
    process.env.DASHMARKET_MCP_CONNECTOR_SECRET?.trim(),
    process.env.DASHMARKET_N8N_MCP_CONNECTOR_SECRET?.trim()
  ].filter((s): s is string => Boolean(s));
}

function isValidSecret(secret: string): boolean {
  const valid = getValidSecrets();
  return valid.length > 0 && valid.includes(secret);
}

async function handleMcpRequest(request: Request, secret: string): Promise<Response> {
  if (!isValidSecret(secret)) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  try {
    const server = createDashmarketMcpServer();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined // stateless — nova instância por request
    });

    await server.connect(transport);
    const response = await transport.handleRequest(request);
    return response;
  } catch (error) {
    console.error("[MCP] Error handling request:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "MCP server error" },
      { status: 500 }
    );
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ secret: string }> }
) {
  const { secret } = await params;
  return handleMcpRequest(request, secret);
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ secret: string }> }
) {
  const { secret } = await params;
  return handleMcpRequest(request, secret);
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ secret: string }> }
) {
  const { secret } = await params;
  if (!isValidSecret(secret)) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  // DELETE é usado pelo protocolo MCP para fechar sessões;
  // como somos stateless, respondemos 200 sem fazer nada
  return new NextResponse(null, { status: 200 });
}
