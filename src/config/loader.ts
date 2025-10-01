import fs from 'fs';
import path from 'path';
import { homedir } from 'os';

/**
 * Server configuration - ONLY how to launch, NOT what tools it has
 * Tools are discovered dynamically via MCP tools/list
 */
export interface ServerConfig {
  command: string;
  args?: string[];
  env?: Record<string, string>;
  description?: string;
}

export interface Config {
  servers: Record<string, ServerConfig>;
  defaultServer?: string;
}

/**
 * Load configuration from file
 * Config only defines HOW to connect to servers
 * Tool schemas are discovered dynamically from the MCP server
 */
export function loadConfig(): Config | null {
  const configPaths = [
    path.join(process.cwd(), '.mcp-cli.json'),
    path.join(homedir(), '.mcp-cli.json'),
    path.join(homedir(), '.config', 'mcp-cli', 'config.json')
  ];

  for (const configPath of configPaths) {
    if (fs.existsSync(configPath)) {
      try {
        const content = fs.readFileSync(configPath, 'utf-8');
        return JSON.parse(content);
      } catch (error) {
        console.error(`Failed to load config from ${configPath}:`, error);
      }
    }
  }

  return null;
}

/**
 * Get server config by name or use default
 */
export function getServerConfig(config: Config | null, serverName?: string): ServerConfig | null {
  if (!config) return null;

  const name = serverName || config.defaultServer;
  if (!name) return null;

  return config.servers[name] || null;
}

/**
 * Create a default config file
 */
export function createDefaultConfig(): Config {
  return {
    servers: {
      chroma: {
        command: 'uvx',
        args: ['chroma-mcp'],
        description: 'ChromaDB vector database'
      }
    },
    defaultServer: 'chroma'
  };
}

/**
 * Save config to file
 */
export function saveConfig(config: Config, configPath?: string): void {
  const targetPath = configPath || path.join(homedir(), '.mcp-cli.json');

  // Create directory if needed
  const dir = path.dirname(targetPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(targetPath, JSON.stringify(config, null, 2), 'utf-8');
}
