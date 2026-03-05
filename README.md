# autodiscover-worker

Cloudflare Worker that reverse-proxies Exchange Autodiscover requests to a configurable upstream endpoint.

## Problem

When using hosted Exchange-compatible mail services (e.g. AWS WorkMail), email clients like Outlook perform [Autodiscover](https://learn.microsoft.com/en-us/exchange/client-developer/exchange-web-services/autodiscover-for-exchange) to automatically configure mailbox settings. The process has three phases:

- **Phase 1** — SCP lookup in Active Directory (domain-joined clients only)
- **Phase 2** — HTTPS POST to `https://<domain>/autodiscover/autodiscover.xml` and `https://autodiscover.<domain>/autodiscover/autodiscover.xml`
- **Phase 3** — Unauthenticated HTTP GET to `http://autodiscover.<domain>/autodiscover/autodiscover.xml`, following 302 redirects

A common approach is to set a CNAME record pointing `autodiscover.<domain>` to the mail service. However, this only enables Phase 3 (HTTP redirect). Some email clients on Android and iOS — such as the built-in mail apps — do not support Phase 3 and rely solely on Phase 2 (direct HTTPS). For these clients, the CNAME approach results in Autodiscover failure on mobile devices.

This worker solves the problem by sitting at `autodiscover.<domain>` on Cloudflare and directly proxying HTTPS requests to your upstream Autodiscover endpoint, enabling both Phase 2 and Phase 3 to work across all clients.

## How It Works

```
Email Client                  Cloudflare Worker                    Mail Service
    |                               |                                   |
    |  POST /autodiscover/...       |                                   |
    |------------------------------>|                                   |
    |  (autodiscover.example.com)   |  Rewrite host → upstream          |
    |                               |---------------------------------->|
    |                               |          Autodiscover response    |
    |          Response             |<----------------------------------|
    |<------------------------------|                                   |
```

The worker rewrites the request hostname to the configured `UPSTREAM` value and proxies the request as-is, preserving method, headers, and body.

## Configuration

| Environment Variable | Description | Example |
|---|---|---|
| `UPSTREAM` | Autodiscover endpoint hostname of your mail service | `autodiscover-service.mail.us-west-2.awsapps.com` |

See `wrangler.jsonc.example` for a full configuration reference.

## Deployment

### Prerequisites

- A Cloudflare account with your domain configured
- Node.js 24+, pnpm

### 1. Fork and Clone

Fork this repository to your own GitHub account, then clone it:

```bash
git clone https://github.com/<your-username>/autodiscover-worker.git
cd autodiscover-worker
pnpm install
```

### 2. Configure

You can configure the worker in two ways:

#### Option A: Via `wrangler.jsonc`

Edit `wrangler.jsonc` to add your environment variable and custom domain:

```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "autodiscover-proxy",
  "main": "src/index.ts",
  "compatibility_date": "2025-04-01",
  "vars": {
    "UPSTREAM": "autodiscover-service.mail.us-west-2.awsapps.com"
  },
  "routes": [
    {
      "pattern": "autodiscover.example.com",
      "custom_domain": true
    }
  ]
}
```

Then deploy:

```bash
pnpm run deploy
```

#### Option B: Via Cloudflare Dashboard

Keep `wrangler.jsonc` as-is (with `keep_vars: true`) and configure everything in the Dashboard:

1. Deploy the worker first: `pnpm run deploy`
2. Go to **Workers & Pages → autodiscover-proxy → Settings**
3. **Variables and Secrets** → Add `UPSTREAM` with your mail service endpoint
4. **Domains & Routes** → Add custom domain `autodiscover.example.com`

The `keep_vars` setting in `wrangler.jsonc` ensures that subsequent deployments will not overwrite your Dashboard-configured variables.

### 3. Automated Deployment (Optional)

You can connect your forked GitHub repository to Cloudflare for automatic deployment on push:

1. Go to **Workers & Pages** → **Create** → **Import a repository**
2. Select your forked repository
3. Set **Build command** to `pnpm install && pnpm run deploy`
4. Configure environment variables and custom domain in Dashboard as described in Option B

## Testing

After deployment, verify the worker is proxying requests correctly:

```bash
# Send a test Autodiscover request
curl -s -o /dev/null -w "%{http_code}" \
  -X POST \
  -H "Content-Type: text/xml" \
  -d '<?xml version="1.0" encoding="utf-8"?>
<Autodiscover xmlns="http://schemas.microsoft.com/exchange/autodiscover/outlook/requestschema/2006">
  <Request>
    <EMailAddress>user@example.com</EMailAddress>
    <AcceptableResponseSchema>http://schemas.microsoft.com/exchange/autodiscover/outlook/responseschema/2006a</AcceptableResponseSchema>
  </Request>
</Autodiscover>' \
  https://autodiscover.example.com/autodiscover/autodiscover.xml

# Expected: 200 (or 401 if the upstream requires authentication)
```

### Local Development

Create a `.dev.vars` file (not committed to git) for local environment variables:

```
UPSTREAM=autodiscover-service.mail.us-west-2.awsapps.com
```

Then start the local dev server:

```bash
pnpm dev
```

## License

MIT
