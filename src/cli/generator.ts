import { Command } from 'commander';
import type { Tool } from '../types/mcp.js';
import { MCPClient } from '../client/MCPClient.js';

/**
 * Generate Commander.js options from MCP tool schema
 * Dynamically discovered from the MCP server's tools/list
 */
export function generateCommandOptions(tool: Tool, cmd: Command): void {
  const schema = tool.inputSchema;

  if (!schema.properties) return;

  const required = schema.required || [];

  for (const [propName, propSchema] of Object.entries(schema.properties)) {
    const prop = propSchema as any;
    const isRequired = required.includes(propName);

    // Determine type from schema
    let type = 'string';
    if (prop.type === 'integer' || prop.type === 'number') {
      type = 'number';
    } else if (prop.type === 'array') {
      type = 'json';
    } else if (prop.type === 'object') {
      type = 'json';
    } else if (prop.type === 'boolean') {
      type = 'boolean';
    }

    // Build flag
    const flag = isRequired
      ? `--${propName} <${type}>`
      : `--${propName} [${type}]`;

    // Build description from schema
    let description = prop.description || prop.title || propName;
    if (prop.default !== undefined) {
      description += ` (default: ${JSON.stringify(prop.default)})`;
    }
    if (type === 'json') {
      description += ' (JSON)';
    }

    // Add option to command
    if (isRequired) {
      cmd.requiredOption(flag, description);
    } else {
      cmd.option(flag, description);
    }
  }
}

/**
 * Convert CLI options to MCP tool arguments
 */
export function convertOptionsToArgs(options: Record<string, any>): Record<string, any> {
  const args: Record<string, any> = {};

  for (const [key, value] of Object.entries(options)) {
    // Skip commander internal properties
    if (key.startsWith('_') || typeof value === 'function') {
      continue;
    }

    // Try to parse JSON strings
    if (typeof value === 'string') {
      try {
        args[key] = JSON.parse(value);
      } catch {
        args[key] = value;
      }
    } else {
      args[key] = value;
    }
  }

  return args;
}

/**
 * Format MCP tool result for clean CLI output
 */
export function formatToolResult(result: any): string {
  // If result has content array (MCP protocol format)
  if (result?.content && Array.isArray(result.content)) {
    const textContent = result.content
      .filter((item: any) => item.type === 'text')
      .map((item: any) => item.text)
      .join('\n');

    // Try to parse as JSON for prettier output
    try {
      const parsed = JSON.parse(textContent);
      return JSON.stringify(parsed, null, 2);
    } catch {
      // Not JSON, return as-is
      return textContent;
    }
  }

  // If result is already an object, pretty print it
  if (typeof result === 'object') {
    return JSON.stringify(result, null, 2);
  }

  // Fallback to string
  return String(result);
}

/**
 * Execute a tool call and output the result
 */
export async function executeToolCommand(
  client: MCPClient,
  toolName: string,
  options: Record<string, any>
): Promise<void> {
  try {
    const args = convertOptionsToArgs(options);
    const result = await client.callTool(toolName, args);

    const formatted = formatToolResult(result);
    console.log(formatted);

    process.exit(0);
  } catch (error: any) {
    console.error(JSON.stringify({
      success: false,
      error: error.message || 'Unknown error calling tool',
      tool: toolName
    }, null, 2));

    process.exit(1);
  }
}
