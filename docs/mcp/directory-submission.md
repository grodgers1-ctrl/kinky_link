# Submitting linklight to MCP Directories

Ready-to-paste listing details for the major MCP server directories. Fill in the form fields with the values below; no code changes required.

## The canonical listing

Use these values everywhere:

| Field | Value |
|---|---|
| **Name** | linklight |
| **Short description** | The MCP server for SEO — find prospects, draft outreach, and monitor backlinks from your AI agent. |
| **Long description** | linklight gives your AI agent a full link-building toolkit: search for prospect sites by keyword (Tavily + Moz DA), find pages that link to your competitors in roundup/alternatives articles, discover similar prospects via Exa.ai, look up contact emails (Hunter), draft personalised outreach emails with a built-in spam score (OpenAI), and query your campaigns, prospects, backlinks, and replies. Sending is never automated — every email needs your approval. |
| **Repo URL** | https://github.com/grodgers1-ctrl/kinky_link |
| **Website / docs** | https://lightlinks.dev/docs/mcp |
| **Transport** | HTTP (Streamable HTTP over POST) |
| **Endpoint URL** | https://lightlinks.dev/api/mcp |
| **Auth** | Bearer token (`Authorization: Bearer sk_ll_...`). API keys are self-serve from Settings → API Access. |
| **Category / tags** | SEO, Marketing, Link Building, Outreach, Backlinks, Keyword Research |
| **Pricing** | $19/mo, 7-day free trial, no credit card required |
| **Languages / frameworks** | Next.js 16, TypeScript |
| **Data / privacy note** | Requires a Google account (Gmail + Search Console scopes). No email is ever sent without manual user approval. |

## MCP client config to publish

```json
{
  "mcpServers": {
    "linklight": {
      "type": "http",
      "url": "https://lightlinks.dev/api/mcp",
      "headers": { "Authorization": "Bearer sk_ll_YOUR_API_KEY" }
    }
  }
}
```

## Tools list (14) — paste into "Tools" field if the directory has one

```
search_prospects — find prospect sites for a keyword (Tavily + Moz DA)
find_competitor_backlinks — find pages linking to a competitor in roundups/alternatives; pass my_domain for only-new opportunities
find_similar_prospects — semantically similar URLs to a known-good prospect (Exa.ai)
enrich_domain — Moz DA + contact email + homepage title/description
find_email — contact email lookup (Hunter)
draft_email — personalised outreach email + spam score (OpenAI)
save_draft — save a draft against a prospect for review (never sends)
find_quick_win_keywords — striking-distance GSC keywords
find_prospect_gaps — campaign prospects missing an email, sorted by DA
list_lost_backlinks — broken/unreachable/redirected backlinks
list_campaigns — list campaigns
list_prospects — list prospects (filter by campaign/status)
list_replies — prospects who replied
list_backlinks — backlinks earned to your sites
```

## Submission links

| Directory | Submit at |
|---|---|
| **mcp.so** | https://mcp.so/register (or https://github.com/Kilo-Org/mcp.so submit an issue) |
| **Glama MCP Directory** | https://glama.ai/mcp/servers — "Add your server" |
| **Smithery** | https://smithery.ai/docs/deploy — supports HTTP servers via a config JSON |
| **PulseMCP** | https://www.pulsemcp.com/submit |
| **MCP Market** | https://mcpmarket.com/submit |
| **Official MCP Servers registry** | https://github.com/modelcontextprotocol/servers — requires a standalone server package; linklight is a hosted HTTP server so list it in README + awesome lists instead |
| **awesome-mcp-servers** | https://github.com/punkpeye/awesome-mcp-servers — open a PR adding a linklight entry |

## After submission checklist

- [ ] Add a "Listed on" badges section to README once directories approve
- [ ] Verify the endpoint responds from a fresh MCP client: `curl https://lightlinks.dev/api/mcp` returns `{"status":"ok",...}`
- [ ] Keep the demo GIF (`public/demos/lightlinks-screencast.gif`) in the repo — directories with images convert better
- [ ] Keep `/docs/mcp` in sync with the tools table whenever new tools ship
