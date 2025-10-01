#!/usr/bin/env node

import { Command } from 'commander';
import { MCPClient } from '../client/MCPClient.js';
import type { ServerConfig } from '../config/loader.js';
import { loadConfig, getServerConfig } from '../config/loader.js';
import { generateCommandOptions, executeToolCommand } from './generator.js';

const program = new Command();

program
  .name('mcp-cli')
  .description('Why can\'t a human use MCP too? - Command-line interface for any MCP server')
  .version('0.1.0');

/**
 * Main CLI entry point
 * Dynamically discovers tools from MCP server and registers them as commands
 */
async function main() {
  const args = process.argv.slice(2);

  // Handle help and version flags early
  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    program.outputHelp();
    process.exit(0);
  }

  if (args[0] === '--version' || args[0] === '-V') {
    console.log(program.version());
    process.exit(0);
  }

  // Parse server specification
  let serverConfig: ServerConfig | null = null;
  let serverName: string | undefined;

  // Check for --server flag (inline server specification)
  const serverFlagIndex = args.indexOf('--server');
  if (serverFlagIndex !== -1 && serverFlagIndex + 1 < args.length) {
    const serverSpec = args[serverFlagIndex + 1];
    const parts = serverSpec.split(/\s+/);
    serverConfig = {
      command: parts[0],
      args: parts.slice(1)
    };
    // Remove --server and its value from args
    args.splice(serverFlagIndex, 2);
  }

  // Check for --use flag (named server from config)
  const useFlagIndex = args.indexOf('--use');
  if (useFlagIndex !== -1 && useFlagIndex + 1 < args.length) {
    serverName = args[useFlagIndex + 1];
    const config = loadConfig();
    serverConfig = getServerConfig(config, serverName);
    if (!serverConfig) {
      console.error(`Error: Server '${serverName}' not found in config`);
      process.exit(1);
    }
    // Remove --use and its value from args
    args.splice(useFlagIndex, 2);
  }

  // If no server specified, try default from config
  if (!serverConfig) {
    const config = loadConfig();
    if (config) {
      serverConfig = getServerConfig(config);
    }

    if (!serverConfig) {
      console.error('Error: No MCP server specified. Use --server or --use flag, or configure a default server in ~/.mcp-cli.json');
      process.exit(1);
    }
  }

  // Check for special commands
  if (args[0] === '--list-tools') {
    await listTools(serverConfig);
    return;
  }

  // Connect to MCP server
  const client = new MCPClient(serverConfig);

  try {
    await client.connect();

    // Discover tools from the server
    const tools = await client.listTools();

    if (tools.length === 0) {
      console.log('No tools available from this MCP server');
      await client.disconnect();
      process.exit(0);
    }

    // Register each tool as a command
    for (const tool of tools) {
      const cmd = program
        .command(tool.name)
        .description(tool.description || `Execute ${tool.name}`);

      // Generate options from tool schema
      generateCommandOptions(tool, cmd);

      // Set action handler
      cmd.action(async (options) => {
        await executeToolCommand(client, tool.name, options);
        await client.disconnect();
      });
    }

    // Parse and execute
    await program.parseAsync(process.argv);

    await client.disconnect();
  } catch (error: any) {
    console.error('Error:', error.message);
    await client.disconnect();
    process.exit(1);
  }
}

/**
 * List all available tools from the server
 */
async function listTools(serverConfig: ServerConfig) {
  const client = new MCPClient(serverConfig);

  try {
    await client.connect();
    const tools = await client.listTools();

    console.log(`Available tools (${tools.length}):\n`);

    for (const tool of tools) {
      console.log(`  ${tool.name}`);
      if (tool.description) {
        console.log(`    ${tool.description}`);
      }
      console.log();
    }

    await client.disconnect();
  } catch (error: any) {
    console.error('Error listing tools:', error.message);
    await client.disconnect();
    process.exit(1);
  }
}

// Run CLI
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
