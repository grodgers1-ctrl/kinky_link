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

## Glama Dockerfile (for automated safety/quality checks)

Glama runs your Dockerfile to validate the server. A production-ready `Dockerfile`
is included in the repo root — it builds the Next.js app and exposes the MCP
endpoint on port 3000.

### Configure on Glama (server admin page)

1. Claim the server under **admin settings** on your Glama server page.
2. Provide the repo URL — Glama picks up the `Dockerfile` at the repo root.
3. Set these **environment variables** in the Glama admin env config so the
   container can run:

   | Variable | Value |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | `https://oqzymbhniajvinbwhrmv.supabase.co` |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | (anon key from Settings → API) |
   | `SUPABASE_SERVICE_ROLE_KEY` | (service role key from Settings → API) |
   | `AUTH_SECRET` | any random string (used by NextAuth only for web flows) |
   | `MCP_TEST_KEY` | `sk_ll_glama_test` |

4. For the **Authorization header** Glama uses during checks, set it to the same
   value as `MCP_TEST_KEY` (e.g. `Bearer sk_ll_glama_test`).

The `MCP_TEST_KEY` env var puts the server into a check-friendly mode: that
literal token is accepted as a valid key for a synthetic test user, so the
`initialize` / `tools/list` / `tools/call` probes pass without a real API key.
It is opt-in — without the env var set, authentication is unchanged and only
real `sk_ll_...` keys issued from the dashboard work.

### Local smoke test of the Docker image

```bash
cd linklight
docker build -t linklight .
docker run -d --name linklight -p 3000:3000 \
  -e NEXT_PUBLIC_SUPABASE_URL=https://oqzymbhniajvinbwhrmv.supabase.co \
  -e SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_KEY \
  -e AUTH_SECRET=random-string \
  -e MCP_TEST_KEY=sk_ll_glama_test \
  linklight
curl http://localhost:3000/api/mcp        # -> {"status":"ok",...}
curl -X POST http://localhost:3000/api/mcp \
  -H "Authorization: Bearer sk_ll_glama_test" -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
docker rm -f linklight
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
