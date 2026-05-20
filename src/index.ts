#!/usr/bin/env node
/**
 * agentalmanac-mcp — an MCP server for searching the Agent Almanac catalog.
 *
 * Exposes tools for any MCP-aware agent to discover Model Context Protocol
 * servers by capability, name, or recency. Backed by https://agentalmanac.org.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const API_BASE = process.env.AGENTALMANAC_API_BASE ?? "https://agentalmanac.org/api/v1";
const USER_AGENT = "agentalmanac-mcp/0.1.0 (+https://agentalmanac.org)";
const HTTP_TIMEOUT_MS = 15_000;

interface ServerSummary {
  slug: string;
  name: string;
  title: string;
  description: string;
  version: string;
  transports: string[];
  status: string;
  updated_at: string;
  url: string;
}

interface ServerDetail extends ServerSummary {
  install_command: string | null;
  repository_url: string | null;
  tools: string[];
  published_at: string;
}

async function api<T>(path: string): Promise<T> {
  const url = `${API_BASE}${path}`;
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), HTTP_TIMEOUT_MS);
  try {
    const r = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      signal: ac.signal,
    });
    if (!r.ok) {
      throw new Error(`Agent Almanac API ${r.status}: ${r.statusText}`);
    }
    return (await r.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

function formatSummary(s: ServerSummary): string {
  const lines = [
    `**${s.title}**`,
    `\`${s.name}\` · v${s.version || "?"} · ${s.transports.join(", ") || "—"}`,
    s.description || "_(no description)_",
    `→ ${s.url}`,
  ];
  return lines.join("\n");
}

function formatDetail(d: ServerDetail): string {
  const parts: string[] = [];
  parts.push(`# ${d.title}`);
  parts.push(`\`${d.name}\` — version ${d.version || "?"}`);
  parts.push("");
  if (d.description) parts.push(d.description);
  parts.push("");
  if (d.install_command) {
    parts.push("## Install");
    parts.push("```");
    parts.push(d.install_command);
    parts.push("```");
    parts.push("");
  }
  parts.push("## Details");
  parts.push(`- Transports: ${d.transports.join(", ") || "—"}`);
  parts.push(`- Status: ${d.status}`);
  if (d.repository_url) parts.push(`- Repository: ${d.repository_url}`);
  parts.push(`- Updated: ${d.updated_at?.slice(0, 10) || "—"}`);
  if (d.tools.length > 0) {
    parts.push("");
    parts.push(`## Tools (${d.tools.length})`);
    parts.push(d.tools.map((t) => `- \`${t}\``).join("\n"));
  }
  parts.push("");
  parts.push(`Catalog page: ${d.url}`);
  return parts.join("\n");
}

const server = new Server(
  { name: "agentalmanac", version: "0.1.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "search_mcp_servers",
      description:
        "Search the Agent Almanac catalog of 9,000+ MCP (Model Context Protocol) servers by name, capability, or description. Use this when the user is looking for an MCP server that does a specific thing (e.g. 'an MCP server for postgres', 'MCP server for github issues', 'video processing MCP').",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string", description: "Search query — e.g. 'postgres', 'video processing', 'github actions'" },
          transport: {
            type: "string",
            enum: ["stdio", "sse", "streamable-http"],
            description: "Optional: filter by transport type",
          },
          limit: { type: "number", description: "Max results (default 10, max 50)", default: 10 },
        },
        required: ["query"],
      },
    },
    {
      name: "get_server_details",
      description:
        "Get full details on a specific MCP server by its slug (from search results). Returns install command, tool list, repository link, version, transports.",
      inputSchema: {
        type: "object",
        properties: {
          slug: {
            type: "string",
            description: "The server's catalog slug (e.g. 'io-github-proompteng-bilig-workpaper'). Get this from search_mcp_servers.",
          },
        },
        required: ["slug"],
      },
    },
    {
      name: "list_recent_servers",
      description:
        "List the most recently updated MCP servers in the catalog. Use to discover what's new or being actively maintained.",
      inputSchema: {
        type: "object",
        properties: {
          limit: { type: "number", description: "How many recent servers to return (default 10, max 50)", default: 10 },
          transport: {
            type: "string",
            enum: ["stdio", "sse", "streamable-http"],
            description: "Optional: filter by transport type",
          },
        },
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const name = req.params.name;
  const args = (req.params.arguments ?? {}) as Record<string, unknown>;

  try {
    if (name === "search_mcp_servers") {
      const query = String(args.query ?? "").trim();
      if (!query) throw new Error("'query' is required");
      const limit = Math.min(Math.max(Number(args.limit) || 10, 1), 50);
      const transport = args.transport ? String(args.transport) : null;
      const qs = new URLSearchParams({ q: query, limit: String(limit) });
      if (transport) qs.set("transport", transport);
      const data = await api<{ count: number; servers: ServerSummary[] }>(`/mcp/servers?${qs}`);
      if (data.count === 0) {
        return {
          content: [
            { type: "text", text: `No results for "${query}" in the Agent Almanac catalog. Try a broader term.` },
          ],
        };
      }
      const body = [
        `Found ${data.count} MCP server${data.count === 1 ? "" : "s"} for "${query}":`,
        "",
        ...data.servers.map(formatSummary),
        "",
        `Browse all: https://agentalmanac.org/catalog?q=${encodeURIComponent(query)}`,
      ].join("\n\n");
      return { content: [{ type: "text", text: body }] };
    }

    if (name === "get_server_details") {
      const slug = String(args.slug ?? "").trim();
      if (!slug) throw new Error("'slug' is required");
      const d = await api<ServerDetail>(`/mcp/servers/${encodeURIComponent(slug)}`);
      return { content: [{ type: "text", text: formatDetail(d) }] };
    }

    if (name === "list_recent_servers") {
      const limit = Math.min(Math.max(Number(args.limit) || 10, 1), 50);
      const transport = args.transport ? String(args.transport) : null;
      const qs = new URLSearchParams({ limit: String(limit) });
      if (transport) qs.set("transport", transport);
      const data = await api<{ count: number; servers: ServerSummary[] }>(`/mcp/servers?${qs}`);
      const body = [
        `Most recently updated MCP servers (${data.count}):`,
        "",
        ...data.servers.map(formatSummary),
        "",
        `Browse the full catalog: https://agentalmanac.org/catalog`,
      ].join("\n\n");
      return { content: [{ type: "text", text: body }] };
    }

    throw new Error(`Unknown tool: ${name}`);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      content: [{ type: "text", text: `Error: ${message}` }],
      isError: true,
    };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // Stay alive; transport handles the lifecycle
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
