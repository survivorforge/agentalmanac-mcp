# agentalmanac-mcp

An MCP server for searching the [Agent Almanac](https://agentalmanac.org) — the public catalog of 9,000+ Model Context Protocol servers.

> The MCP server for finding MCP servers. Discover, inspect, and install MCP tools from inside any MCP-aware agent.

## Install

```json
{
  "mcpServers": {
    "agentalmanac": {
      "command": "npx",
      "args": ["-y", "agentalmanac-mcp"]
    }
  }
}
```

Add this to your Claude Desktop / Cursor / Continue / Zed MCP config. No auth, no setup.

## Tools

| Tool | What it does |
|---|---|
| `search_mcp_servers(query, transport?, limit?)` | Search the catalog by capability, name, or description (FTS5-backed) |
| `get_server_details(slug)` | Full per-server info: install command, tool list, repo, version |
| `list_recent_servers(limit?, transport?)` | Most recently updated MCP servers in the catalog |

## Example usage

After installing, ask your agent:

> Find me an MCP server for working with Postgres.

> Get details on `io-github-proompteng-bilig-workpaper`.

> What's been updated in the MCP ecosystem this week?

The server returns formatted text. Your agent does the rest.

## What's the Agent Almanac

[agentalmanac.org](https://agentalmanac.org) is a neutral, open catalog of MCP servers. It ingests from the official Model Context Protocol Registry and surfaces searchable, installable entries. No login. Free. JSON API: `https://agentalmanac.org/api/v1/mcp/servers`.

## Configuration

| Env var | Default | Use |
|---|---|---|
| `AGENTALMANAC_API_BASE` | `https://agentalmanac.org/api/v1` | Override for testing against a different base URL |

## License

MIT. Issues + PRs: https://github.com/survivorforge/agentalmanac-mcp
