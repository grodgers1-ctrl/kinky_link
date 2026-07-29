import type { ToolDefinition, ToolResult } from "./types"

export type Handler = (
  userId: string,
  args: Record<string, unknown>,
) => Promise<ToolResult>

export interface Tool extends ToolDefinition {
  handler: Handler
}

export const TOOLS: Tool[] = []

export function registerTool(t: Tool) {
  if (TOOLS.some((x) => x.name === t.name)) {
    throw new Error(`Duplicate tool: ${t.name}`)
  }
  TOOLS.push(t)
}

export function toolSchemas(): ToolDefinition[] {
  return TOOLS.map(({ handler: _h, ...rest }) => rest)
}

export function findTool(name: string): Tool | undefined {
  return TOOLS.find((t) => t.name === name)
}

export function textResult(text: string): ToolResult {
  return { content: [{ type: "text", text }] }
}

export function jsonResult(obj: unknown): ToolResult {
  return textResult(JSON.stringify(obj, null, 2))
}

export function errorResult(msg: string): ToolResult {
  return { content: [{ type: "text", text: msg }], isError: true }
}
