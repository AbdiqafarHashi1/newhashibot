# Netlify Deployment Package

- Base directory: `v2`
- Build command: `npm run typecheck && npm run test:deployment`
- Publish directory: `v2/apps/web-runtime`
- Production URL: set `PLATFORM_PUBLIC_URL` after first deploy.

## Redirects and headers

Use `v2/netlify.toml`. It provides SPA routing, immutable cache for static assets, no-store for HTML/API health, and security headers: HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy, and a restrictive CSP.

## Verification

1. Deploy with Netlify CLI or connected Git branch.
2. Open `/health` and confirm a 200 response.
3. Log in as owner and verify Admin UI and Customer UI routes.
4. Roll back from Netlify Deploys by selecting the last known good deploy and confirming `/health`.
