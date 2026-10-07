# ibabs-mcp

A local [Model Context Protocol](https://modelcontextprotocol.io) (MCP) server for
[iBabs](https://www.ibabs.eu/). It logs into an iBabs site with your credentials,
caches the portal session, and exposes tools to list meetings,
read agenda items, and download attachments.

## Install

Published on npm as `ibabs-mcp`:

```sh
npx -y ibabs-mcp
```

Requires Node.js 20 or newer.

## Configuration

All configuration comes from environment variables. Set them in the MCP client
config (not in a file the server reads), or export them in your shell.

| Variable                | Required | Meaning                                                                 |
| ----------------------- | -------- | ----------------------------------------------------------------------- |
| `IBABS_SITE`            | yes      | Tenant/site name, e.g. `example-site`.                                 |
| `IBABS_EMAIL`           | yes      | Login e-mail address.                                                   |
| `IBABS_PASSWORD`        | yes*     | Login password.                                                         |
| `IBABS_SESSION_COOKIE`  | yes*     | A pre-existing `__Host-ibabsportal` cookie value, instead of password.  |
| `IBABS_CACHE_DIR`       | no       | Where the session is cached. Defaults to the OS cache dir.              |
| `IBABS_DOWNLOAD_DIR`    | no       | Where attachments are written. Defaults to `<cache>/downloads`.         |
| `IBABS_PORTAL_URL`      | no       | Defaults to `https://portal.ibabs.eu`.                                  |
| `IBABS_LOGIN_URL`       | no       | Defaults to `https://signon.ibabs.eu`.                                  |
| `IBABS_AUTHORIZE_URL`   | no       | Defaults to `https://signon.ibabs.eu/OAuth/Authorize`.                  |
| `IBABS_CLIENT_ID`       | no       | OAuth client id. Defaults to the public iBabs portal client.            |
| `IBABS_REDIRECT_URI`    | no       | OAuth redirect. Defaults to `https://portal.ibabs.eu/signin-iBabs`.     |

\* Provide either `IBABS_PASSWORD` or `IBABS_SESSION_COOKIE`.

See [`.env.example`](./.env.example) for a template.

## Use with Hermes Agent

Hermes reads `mcp_servers` from `~/.hermes/config.yaml` and passes only the env
you list explicitly. Keep the secret in `~/.hermes/.env` and reference it:

```yaml
mcp_servers:
  ibabs:
    command: "npx"
    args: ["-y", "ibabs-mcp"]
    env:
      IBABS_SITE: "example-site"
      IBABS_EMAIL: "${IBABS_EMAIL}"
      IBABS_PASSWORD: "${IBABS_PASSWORD}"
```

Then `~/.hermes/.env`:

```sh
IBABS_EMAIL=you@example.com
IBABS_PASSWORD=...
```

Restart Hermes (or run `/reload-mcp`). Tools appear as `mcp_ibabs_*`.

## Tools

- `list_meetings` — list meetings in a date range (defaults to the next 30 days),
  optionally restricted to council/committee meetings.
- `get_meeting` — one meeting with its agenda items and attachments.
- `get_attachment` — download an attachment by `documentId`, returning a local
  path and, for PDFs/plain text, the extracted text.

## Other MCP clients

Any stdio MCP client works — point it at `npx -y ibabs-mcp` with the env above.
For Claude Desktop / Cursor:

```json
{
  "mcpServers": {
    "ibabs": {
      "command": "npx",
      "args": ["-y", "ibabs-mcp"],
      "env": {
        "IBABS_SITE": "example-site",
        "IBABS_EMAIL": "you@example.com",
        "IBABS_PASSWORD": "..."
      }
    }
  }
}
```

## Development

```sh
npm install
npm run dev      # run from source with tsx
npm run test     # vitest
npm run build    # compile to dist/
```

## Releasing

Publishing uses npm **trusted publishing** (OIDC) — no long-lived token.

1. Bump the version in `package.json` and commit.
2. Tag and push: `git tag v0.1.0 && git push origin v0.1.0`.
3. The `Publish` GitHub Action builds, tests, and runs `npm publish`
   with provenance.

The npm trusted publisher must be configured for repository
`anned20/ibabs-mcp`, workflow `publish.yml`.

## License

[MIT](./LICENSE)
