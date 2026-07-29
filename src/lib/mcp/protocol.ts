import type { JsonRpcRequest, JsonRpcResponse } from "./types"

export const MCP_PROTOCOL_VERSION = "2025-06-18"

export const SERVER_INFO = {
  name: "linklight",
  version: "0.1.0",
}

export function ok(req: JsonRpcRequest, result: unknown): JsonRpcResponse {
  return { jsonrpc: "2.0", id: req.id ?? null, result }
}

export function err(
  req: JsonRpcRequest,
  code: number,
  message: string,
  data?: unknown,
): JsonRpcResponse {
  return { jsonrpc: "2.0", id: req.id ?? null, error: { code, message, data } }
}

export const PARSE_ERROR = -32700
export const INVALID_REQUEST = -32600
export const METHOD_NOT_FOUND = -32601
export const INVALID_PARAMS = -32602
export const INTERNAL_ERROR = -32603
