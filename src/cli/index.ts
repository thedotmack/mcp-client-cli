#!/usr/bin/env node

import { Command } from 'commander';
import { MCPClient } from '../client/MCPClient.js';
import type { ServerConfig } from '../config/loader.js';
import { loadConfig, saveConfig } from '../config/loader.js';
import { generateCommandOptions, executeToolCommand } from './generator.js';
import { ToolCache } from '../client/ToolCache.js';

const program = new Command();

// 전역 캐시 인스턴스
const toolCache = new ToolCache();

program
  .name('mcp-cli')
  .description('Why can\'t a human use MCP too? - Command-line interface for any MCP server')
  .version('0.1.0');

/**
 * Register server tools as subcommands
 */
async function registerServerTools(serverCmd: Command, serverName: string, serverConfig: ServerConfig) {
  try {
    // 캐시에서 도구 목록 가져옴 (연결 안 함!)
    const tools = await toolCache.getOrFetch(serverName, serverConfig);

    if (tools.length === 0) {
      console.log(`No tools available from ${serverName}`);
      return;
    }

    // 각 도구를 서브커맨드로 등록
    for (const tool of tools) {
      const toolCmd = serverCmd
        .command(tool.name)
        .description(tool.description || `Execute ${tool.name}`);

      generateCommandOptions(tool, toolCmd);

      toolCmd.action(async (options) => {
        // 실행 시점에 새 클라이언트 생성 및 연결 ← Lazy Connect!
        const client = new MCPClient(serverConfig);

        try {
          await client.connect();
          await executeToolCommand(client, tool.name, options);
          await client.disconnect();
        } catch (error) {
          await client.disconnect();
          throw error;
        }
      });
    }

    // disconnect() 제거! (더 이상 미리 연결 안 함)
  } catch (error: any) {
    console.error(`Error loading tools for ${serverName}:`, error.message);
    process.exit(1);
  }
}

/**
 * Management commands
 */

// List all configured servers
program
  .command('list')
  .description('List all configured MCP servers')
  .action(() => {
    const config = loadConfig();
    if (!config || Object.keys(config.servers).length === 0) {
      console.log('No MCP servers configured.');
      return;
    }

    console.log('Configured MCP servers:\n');
    for (const [name, serverConfig] of Object.entries(config.servers)) {
      console.log(`  ${name}`);
      if (serverConfig.description) {
        console.log(`    ${serverConfig.description}`);
      }
      console.log(`    Command: ${serverConfig.command} ${(serverConfig.args || []).join(' ')}`);
      if (serverConfig.env && Object.keys(serverConfig.env).length > 0) {
        console.log(`    Environment: ${Object.keys(serverConfig.env).join(', ')}`);
      }
      console.log();
    }
  });

// Get details for a specific server
program
  .command('get')
  .argument('<name>', 'Server name')
  .description('Get details for a specific MCP server')
  .action((name: string) => {
    const config = loadConfig();
    if (!config || !config.servers[name]) {
      console.error(`Server '${name}' not found.`);
      process.exit(1);
    }

    const serverConfig = config.servers[name];
    console.log(`Server: ${name}`);
    if (serverConfig.description) {
      console.log(`Description: ${serverConfig.description}`);
    }
    console.log(`Command: ${serverConfig.command}`);
    if (serverConfig.args && serverConfig.args.length > 0) {
      console.log(`Arguments: ${serverConfig.args.join(' ')}`);
    }
    if (serverConfig.env && Object.keys(serverConfig.env).length > 0) {
      console.log('Environment variables:');
      for (const [key, value] of Object.entries(serverConfig.env)) {
        console.log(`  ${key}=${value}`);
      }
    }
  });

// Remove a server
program
  .command('remove')
  .argument('<name>', 'Server name')
  .description('Remove an MCP server configuration')
  .action((name: string) => {
    const config = loadConfig() || { servers: {} };

    if (!config.servers[name]) {
      console.error(`Server '${name}' not found.`);
      process.exit(1);
    }

    delete config.servers[name];

    // Remove default if it was the removed server
    if (config.defaultServer === name) {
      delete config.defaultServer;
    }

    saveConfig(config);
    console.log(`Removed server '${name}'`);
  });

// Refresh tool cache for a server
program
  .command('refresh')
  .argument('<name>', 'Server name')
  .description('Refresh tool cache for a specific server')
  .action((name: string) => {
    const config = loadConfig();
    if (!config || !config.servers[name]) {
      console.error(`Server '${name}' not found.`);
      process.exit(1);
    }

    toolCache.invalidate(name);
    console.log(`Cache cleared for '${name}'. Tools will be fetched on next use.`);
  });

// Clear all tool caches
program
  .command('clear-cache')
  .description('Clear all tool caches')
  .action(() => {
    toolCache.clear();
    console.log('All tool caches cleared.');
  });

// Add a server
program
  .command('add')
  .argument('<name>', 'Server name')
  .option('--transport <type>', 'Transport type: stdio (default), sse, or http')
  .option('--url <url>', 'URL for SSE or HTTP transport')
  .option('--env <key=value>', 'Environment variable (can be specified multiple times)', (value, previous: Record<string, string> = {}) => {
    const [key, val] = value.split('=');
    previous[key] = val;
    return previous;
  })
  .option('--header <header>', 'HTTP header (can be specified multiple times)', (value, previous: string[] = []) => {
    previous.push(value);
    return previous;
  })
  .option('--description <desc>', 'Server description')
  .description('Add an MCP server configuration (use -- to separate server command from CLI options)')
  .allowUnknownOption()
  .action((name: string, options: any, command: Command) => {
    const config = loadConfig() || { servers: {} };

    if (config.servers[name]) {
      console.error(`Server '${name}' already exists. Remove it first with 'mcp-cli remove ${name}'`);
      process.exit(1);
    }

    // Get command args after the -- separator or after all options
    const rawArgs = command.args.slice(1); // Skip the name argument

    const transport = options.transport || 'stdio';
    const serverConfig: ServerConfig = {
      command: '',
      args: []
    };

    if (transport === 'stdio') {
      // Stdio transport: use command and args
      if (!rawArgs || rawArgs.length === 0) {
        console.error('Error: Command is required for stdio transport. Use -- to separate command: mcp-cli add <name> [options] -- <command>');
        process.exit(1);
      }

      serverConfig.command = rawArgs[0];
      serverConfig.args = rawArgs.slice(1);
    } else if (transport === 'sse' || transport === 'http') {
      // SSE/HTTP transport: use URL
      if (!options.url) {
        console.error(`Error: --url is required for ${transport} transport`);
        process.exit(1);
      }

      serverConfig.command = transport;
      serverConfig.args = [options.url];

      if (options.header) {
        serverConfig.env = serverConfig.env || {};
        serverConfig.env['HEADERS'] = JSON.stringify(options.header);
      }
    }

    if (options.env) {
      serverConfig.env = { ...serverConfig.env, ...options.env };
    }

    if (options.description) {
      serverConfig.description = options.description;
    }

    config.servers[name] = serverConfig;
    saveConfig(config);

    console.log(`Added server '${name}'`);
    console.log(`  Command: ${serverConfig.command} ${(serverConfig.args || []).join(' ')}`);
  });

/**
 * Main CLI entry point
 */
async function main() {
  const args = process.argv.slice(2);

  // Check if it's a management command
  const managementCommands = ['list', 'get', 'remove', 'add', 'refresh', 'clear-cache'];
  if (managementCommands.includes(args[0])) {
    await program.parseAsync(process.argv);
    return;
  }

  // Load configuration
  const config = loadConfig();

  if (!config || Object.keys(config.servers).length === 0) {
    console.error('Error: No MCP servers configured. Use "mcp-cli add" to add a server.');
    process.exit(1);
  }

  // If a server name is specified, connect to it and register tools
  const serverName = args[0];
  if (serverName && config.servers[serverName]) {
    const serverCmd = program
      .command(serverName)
      .description(config.servers[serverName].description || `Access ${serverName} MCP server`);

    // Eagerly load tools for this server
    await registerServerTools(serverCmd, serverName, config.servers[serverName]);
  } else {
    // No specific server requested, register all servers as subcommands
    for (const [name, serverConfig] of Object.entries(config.servers)) {
      program
        .command(name)
        .description(serverConfig.description || `Access ${name} MCP server`)
        .action(async () => {
          console.log(`Use 'mcp-cli ${name} <tool>' to execute a tool`);
          console.log(`Use 'mcp-cli ${name} --help' to see available tools`);
        });
    }
  }

  // Add help text for available servers
  program.addHelpText('after', () => {
    const serverList = Object.keys(config.servers).join(', ');
    return `\nAvailable MCP Servers:\n  ${serverList}\n\nManagement Commands:\n  list         List all configured servers\n  get          Get server details\n  add          Add a new server\n  remove       Remove a server\n  refresh      Refresh tool cache for a server\n  clear-cache  Clear all tool caches\n\nUse 'mcp-cli <server> --help' to see tools for a specific server.`;
  });

  // Parse command line
  await program.parseAsync(process.argv);
}

// Run CLI
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
