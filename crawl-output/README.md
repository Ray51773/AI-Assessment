# Crawl output

Firecrawl crawl results committed for reference.

## Firecrawl MCP server

`.mcp.json` in the repo root registers the Firecrawl MCP server. It reads the
API key from the `FIRECRAWL_API_KEY` environment variable, so the key is never
committed:

```sh
export FIRECRAWL_API_KEY=fc-...
```

## Files

- `rcellis-com.md` — 10 pages crawled from https://rcellis.com in markdown format.
