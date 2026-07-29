import { NextRequest, NextResponse } from "next/server"
import { verifyKey } from "@/lib/api-keys"
import {
  MCP_PROTOCOL_VERSION,
  SERVER_INFO,
  ok,
  err,
  METHOD_NOT_FOUND,
  INVALID_REQUEST,
  INTERNAL_ERROR,
} from "@/lib/mcp/protocol"
import type { JsonRpcRequest } from "@/lib/mcp/types"
import { toolSchemas, findTool, errorResult } from "@/lib/mcp/tools"
import "@/lib/mcp/handlers"

export const runtime = "nodejs"

function extractBearer(req: NextRequest): string | null {
  const h = req.headers.get("authorization") || ""
  const m = h.match(/^Bearer\s+(.+)$/i)
  return m ? m[1].trim() : null
}

export async function POST(req: NextRequest) {
  const token = extractBearer(req)
  const userId = token ? await verifyKey(token) : null
  if (!userId) {
    return NextResponse.json(
      { jsonrpc: "2.0", id: null, error: { code: -32001, message: "Unauthorized" } },
      { status: 401 },
    )
  }

  let rpc: JsonRpcRequest
  try {
    rpc = (await req.json()) as JsonRpcRequest
  } catch {
    return NextResponse.json({
      jsonrpc: "2.0",
      id: null,
      error: { code: INVALID_REQUEST, message: "Invalid JSON" },
    })
  }

  if (rpc.jsonrpc !== "2.0" || typeof rpc.method !== "string") {
    return NextResponse.json(err(rpc, INVALID_REQUEST, "Invalid JSON-RPC request"))
  }

  try {
    switch (rpc.method) {
      case "initialize":
        return NextResponse.json(
          ok(rpc, {
            protocolVersion: MCP_PROTOCOL_VERSION,
            capabilities: { tools: {} },
            serverInfo: SERVER_INFO,
          }),
        )
      case "notifications/initialized":
        return new NextResponse(null, { status: 202 })
      case "tools/list":
        return NextResponse.json(ok(rpc, { tools: toolSchemas() }))
      case "tools/call": {
        const params =
          (rpc.params as { name?: string; arguments?: Record<string, unknown> }) || {}
        const tool = params.name ? findTool(params.name) : undefined
        if (!tool) {
          return NextResponse.json(ok(rpc, errorResult(`Unknown tool: ${params.name}`)))
        }
        const result = await tool.handler(userId, params.arguments || {})
        return NextResponse.json(ok(rpc, result))
      }
      case "resources/list":
        return NextResponse.json(ok(rpc, { resources: [] }))
      case "prompts/list":
        return NextResponse.json(ok(rpc, { prompts: [] }))
      default:
        return NextResponse.json(err(rpc, METHOD_NOT_FOUND, `Method ${rpc.method} not found`))
    }
  } catch (error) {
    console.error("MCP handler error:", error)
    const message = error instanceof Error ? error.message : "Internal error"
    return NextResponse.json(err(rpc, INTERNAL_ERROR, message))
  }
}

export async function GET() {
  return NextResponse.json({
    status: "ok",
    server: SERVER_INFO.name,
    version: SERVER_INFO.version,
  })
}
