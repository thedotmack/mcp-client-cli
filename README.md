# mcp-cli

**Why can't a human use MCP too?**

Command-line interface for any [Model Context Protocol (MCP)](https://modelcontextprotocol.io) server.

MCP enables AI assistants to interact with tools and data sources. `mcp-cli` brings that same power to the command line, making MCP accessible to humans for:
- 🤖 Shell scripting and automation
- 🔧 DevOps and CI/CD pipelines
- 🧪 Quick testing of MCP servers
- 📊 Data operations and queries
- ⚡ Rapid prototyping

## Features

- 🔌 **Universal**: Works with ANY MCP server
- 🚀 **Zero Schema Config**: Discovers tools dynamically from the server
- 🎯 **Automatic CLI Generation**: Tool schemas → Commander.js options (magically!)
- 📝 **Clean Output**: Parseable results perfect for piping
- 🛠️ **Human-Friendly**: No JSON-RPC knowledge needed

## Installation

```bash
npm install -g mcp-cli
```

## Quick Start

### Inline Server Specification

```bash
# Use any MCP server directly
mcp-cli --server "uvx chroma-mcp" --list-tools

# Call a tool
mcp-cli --server "uvx chroma-mcp" chroma_list_collections
```

### Named Server Configuration

Create `~/.mcp-cli.json`:

```json
{
  "servers": {
    "chroma": {
      "command": "uvx",
      "args": ["chroma-mcp", "--data-dir", "~/.chroma"]
    },
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_TOKEN": "your-token"
      }
    }
  },
  "defaultServer": "chroma"
}
```

Then use named servers:

```bash
# List tools from named server
mcp-cli --use chroma --list-tools

# Use default server (no --use needed)
mcp-cli chroma_query_documents --help

# Call a tool
mcp-cli --use github github_create_issue --repo "owner/repo" --title "Bug"
```

## How It Works

### 1. Connect to MCP Server

```bash
mcp-cli --server "uvx chroma-mcp" --list-tools
```

### 2. Server Discovers Its Own Tools

The CLI calls the MCP `tools/list` method - the server returns:

```json
{
  "tools": [
    {
      "name": "chroma_query_documents",
      "description": "Query documents with semantic search",
      "inputSchema": {
        "type": "object",
        "properties": {
          "collection_name": { "type": "string" },
          "query_texts": { "type": "array" },
          "n_results": { "type": "integer" }
        },
        "required": ["collection_name", "query_texts"]
      }
    }
  ]
}
```

### 3. CLI Generates Commands Dynamically

```bash
mcp-cli chroma_query_documents --help
```

Output:
```
Usage: mcp-cli chroma_query_documents [options]

Query documents with semantic search

Options:
  --collection_name <string>  Collection name (required)
  --query_texts <json>        Query texts (JSON array) (required)
  --n_results [integer]       Number of results
  -h, --help                  display help for command
```

### 4. Execute Tool

```bash
mcp-cli chroma_query_documents \
  --collection_name memories \
  --query_texts '["search term"]' \
  --n_results 5
```

**All generated from the MCP schema - zero manual configuration!**

## Usage Examples

### ChromaDB Operations

```bash
# List collections
mcp-cli --use chroma chroma_list_collections

# Query documents
mcp-cli chroma_query_documents \
  --collection_name memories \
  --query_texts '["important notes"]' \
  --n_results 10

# Add documents
mcp-cli chroma_add_documents \
  --collection_name memories \
  --documents '["Note 1", "Note 2"]' \
  --ids '["id1", "id2"]'
```

### GitHub Operations

```bash
# Create issue
mcp-cli --use github github_create_issue \
  --repo "myorg/myrepo" \
  --title "Bug: Login fails" \
  --body "Description here"

# List pull requests
mcp-cli --use github github_list_pull_requests \
  --repo "myorg/myrepo" \
  --state open
```

### Shell Scripting

```bash
#!/bin/bash
# Query memories and create GitHub issues for bugs

# Get bug reports from vector db
BUGS=$(mcp-cli chroma_query_documents \
  --collection_name bugs \
  --query_texts '["high priority bugs"]' \
  --n_results 5)

# Parse and create issues
echo "$BUGS" | jq -r '.documents[0][]' | while read bug; do
  mcp-cli --use github github_create_issue \
    --repo "myorg/myrepo" \
    --title "$bug"
done
```

## Configuration

### Config File Locations

The CLI looks for config in this order:

1. `./.mcp-cli.json` (current directory)
2. `~/.mcp-cli.json` (home directory)
3. `~/.config/mcp-cli/config.json`

### Config Schema

```json
{
  "servers": {
    "server-name": {
      "command": "executable",
      "args": ["arg1", "arg2"],
      "env": {
        "ENV_VAR": "value"
      },
      "description": "Optional description"
    }
  },
  "defaultServer": "server-name"
}
```

**Note**: The config ONLY specifies HOW to connect to servers. Tool schemas are discovered dynamically from the MCP server itself.

## CLI Options

```bash
# Specify server inline
mcp-cli --server "command args..." <tool-name> [options]

# Use named server from config
mcp-cli --use <server-name> <tool-name> [options]

# Use default server from config
mcp-cli <tool-name> [options]

# List available tools
mcp-cli --list-tools

# Get help for a tool (dynamically generated!)
mcp-cli <tool-name> --help

# Version
mcp-cli --version
```

## Output Format

Results are automatically formatted for readability:

```bash
# Simple values
$ mcp-cli chroma_get_collection_count --collection_name memories
42

# JSON objects (pretty-printed)
$ mcp-cli chroma_query_documents --collection_name memories --query_texts '["test"]'
{
  "ids": [["doc1", "doc2"]],
  "documents": [["First doc", "Second doc"]],
  "distances": [[0.1, 0.2]]
}
```

Perfect for piping to `jq`:

```bash
mcp-cli chroma_query_documents ... | jq '.documents[0][0]'
```

## Why This Exists

MCP servers expose powerful capabilities through a standard protocol. But to use them, you typically need to:

1. Write custom client code
2. Handle JSON-RPC manually
3. Parse tool schemas yourself
4. Build your own CLI

**mcp-cli does all of this automatically.**

You just specify the server command, and the CLI:
- ✅ Connects via stdio
- ✅ Discovers available tools
- ✅ Generates CLI commands from schemas
- ✅ Handles all the protocol details
- ✅ Formats output nicely

## Supported MCP Servers

Works with **any** MCP server that implements the standard protocol. Examples:

- `uvx chroma-mcp` - ChromaDB vector database
- `npx @modelcontextprotocol/server-github` - GitHub API
- `npx @modelcontextprotocol/server-filesystem` - Filesystem operations
- `npx @modelcontextprotocol/server-postgres` - PostgreSQL database
- Custom MCP servers you build

## Development

```bash
# Clone repo
git clone https://github.com/YOUR_USERNAME/mcp-cli.git
cd mcp-cli

# Install dependencies
npm install

# Build
npm run build

# Test locally
node bin/mcp-cli.js --server "uvx chroma-mcp" --list-tools
```

## Contributing

Contributions welcome! Please open an issue or PR.

## License

MIT

## Tagline

**"Why can't a human use MCP too?"**

Because now they can. 🚀
