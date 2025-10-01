# mcp-client-cli - Launch Summary

## "Why can't a human use MCP too?"

We built a universal command-line interface for **any** MCP server that dynamically discovers and generates CLI commands from the server's tool schemas.

## What We Built

### Core Architecture

```
User Command
    ↓
mcp-cli (connects to MCP server)
    ↓
Server calls tools/list (MCP protocol)
    ↓
Returns tool schemas dynamically
    ↓
CLI generates Commander.js commands
    ↓
User gets auto-generated --help
    ↓
Execute tool, format output
```

### Key Features

✅ **Universal MCP Support** - Works with ANY MCP server
✅ **Zero Schema Config** - Tools discovered via `tools/list`
✅ **Automatic CLI Generation** - Schemas → Commander.js options
✅ **Clean Output** - Formatted, parseable results
✅ **Server Configs** - Named servers in `.mcp-cli.json`

## Files Created

### Core Client (`src/client/MCPClient.ts`)
- Generic MCP client (any server, not just chroma)
- Handles stdio communication
- JSON-RPC 2.0 protocol
- Initialize handshake
- Tool discovery and execution
- Graceful disconnect with timeout

### CLI Generator (`src/cli/generator.ts`)
- Converts MCP schemas to Commander options
- Handles all JSON schema types
- Auto-detects required/optional fields
- Formats tool results cleanly
- JSON parsing for complex arguments

### Main CLI (`src/cli/index.ts`)
- Entry point with arg parsing
- Connects to MCP server
- Calls `tools/list` to discover tools
- Registers each tool as a command
- Generates help dynamically
- Handles `--server`, `--use`, `--list-tools`

### Config Loader (`src/config/loader.ts`)
- Loads `.mcp-cli.json` from multiple locations
- Server config: command + args + env
- NO tool schemas (discovered dynamically!)
- Default server support

### Types (`src/types/mcp.ts`)
- MCP protocol type definitions
- Tool, Resource, Prompt interfaces
- Request/Response/Notification types

## Working Demo

```bash
# Discover 13 tools from chroma-mcp
$ mcp-cli --server "uvx chroma-mcp" --list-tools
Available tools (13):
  chroma_list_collections
  chroma_create_collection
  chroma_query_documents
  ...

# Auto-generated help (from MCP schema!)
$ mcp-cli chroma_query_documents --help
Usage: mcp-cli chroma_query_documents [options]

Options:
  --collection_name <string>  Collection name (required)
  --query_texts <json>        Query texts (JSON array) (required)
  --n_results [integer]       Number of results

# Execute tool
$ mcp-cli chroma_query_documents \
    --collection_name memories \
    --query_texts '["search"]'
{
  "ids": [["doc1"]],
  "documents": [["Result"]],
  "distances": [[0.1]]
}
```

## How It's Different

### vs Manual MCP Clients
❌ Write custom JSON-RPC code
❌ Parse schemas manually
❌ Build CLI interface
✅ **Automatic everything**

### vs Static CLIs
❌ Hardcode tool definitions
❌ Update code for new tools
❌ Duplicate schema info
✅ **Dynamic discovery**

### vs Claude Code Integration
❌ Only AI can use MCP
✅ **Humans can too!**

## Magic Moment

The config file **ONLY** specifies:
```json
{
  "command": "uvx",
  "args": ["chroma-mcp"]
}
```

The CLI:
1. Connects to server
2. Calls `tools/list`
3. Gets back 13 tools with full schemas
4. Generates 13 CLI commands automatically
5. Each command has auto-generated `--help`
6. All options map to schema properties
7. Type conversion handled automatically

**Zero manual schema configuration!**

## Repository Structure

```
mcp-client-cli/
├── src/
│   ├── client/MCPClient.ts       # Generic MCP client
│   ├── cli/
│   │   ├── generator.ts          # Schema → CLI
│   │   └── index.ts              # Main entry
│   ├── config/loader.ts          # Config management
│   └── types/mcp.ts              # Protocol types
├── bin/mcp-cli.js                # Executable
├── examples/chroma-mcp/          # Example config
├── README.md                     # Comprehensive docs
├── package.json
└── tsconfig.json
```

## Testing Results

✅ Connects to chroma-mcp server
✅ Discovers 13 tools dynamically
✅ Generates help for all tools
✅ Executes tools successfully
✅ Clean output formatting
✅ Proper error handling
✅ Graceful disconnect

## Next Steps

- [ ] Publish to npm as `mcp-cli`
- [ ] Add example configs for popular servers
- [ ] Create GitHub repo
- [ ] Add to MCP ecosystem registry
- [ ] Write blog post
- [ ] Add interactive mode
- [ ] Support for resources and prompts (not just tools)
- [ ] Better error messages
- [ ] Progress indicators for long operations
- [ ] Shell completion

## Use Cases

### DevOps Automation
```bash
# Backup vector database
mcp-cli chroma_fork_collection --collection_name prod --new_collection_name backup
```

### CI/CD Pipelines
```bash
# Query test results from vector db
mcp-cli chroma_query_documents --collection_name test_results ...
```

### Data Operations
```bash
# Bulk insert data
cat data.json | jq -c '.[]' | while read item; do
  mcp-cli chroma_add_documents ...
done
```

### GitHub Automation
```bash
# Create issues from memory search
mcp-cli chroma_query_documents --query_texts '["bugs"]' | \
  jq -r '.documents[0][]' | \
  xargs -I{} mcp-cli --use github github_create_issue --title "{}"
```

## Why This Matters

MCP is the protocol that powers Claude Code's tool integrations. It's incredibly powerful but locked behind AI-only interfaces.

**mcp-cli democratizes MCP** by giving humans the same programmatic access that AI has.

Now you can:
- Script MCP operations
- Build pipelines with MCP tools
- Debug MCP servers
- Prototype integrations
- Use MCP from any language (via shell commands)

## Tagline

**"Why can't a human use MCP too?"**

Because now they can. 🚀

---

**Status**: Working Prototype
**Created**: 2025-10-01
**Tested**: chroma-mcp (13 tools)
**Lines of Code**: ~500 TypeScript
**Magic Factor**: 💯
