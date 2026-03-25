# Netlify Deployment Guide for PostCraft AI

## Runtime Shape

This project now deploys to Netlify as:

- static frontend from `public/`
- on-demand Netlify Functions for generation, OAuth, publishing, and data APIs
- a scheduled Netlify Function that processes due queue items every 10 minutes
- Supabase as the persistent database for accounts, schedules, and queue items

No always-on Node server is required in production.

## Netlify Build Settings

- Build command: `npm run build`
- Publish directory: `public`
- Functions directory: `netlify/functions`

## Required Environment Variables

Add these in Netlify under Site configuration -> Environment variables:

- `GROQ_API_KEY`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `LINKEDIN_CLIENT_ID`
- `LINKEDIN_CLIENT_SECRET`

Recommended:

- `LINKEDIN_OAUTH_STATE_SECRET`
- `PUBLIC_SITE_URL`

Notes:

- `PUBLIC_SITE_URL` should be your production site URL, for example `https://your-site.netlify.app`
- If `PUBLIC_SITE_URL` is not set, the functions fall back to Netlify request headers and site env vars

## LinkedIn OAuth Redirect URI

In the LinkedIn developer app, set the redirect URI to:

`https://YOUR-SITE.netlify.app/.netlify/functions/linkedin-oauth-callback`

If you use a custom domain, use that domain instead.

## Queue Processing

The queue publisher runs through the scheduled function:

- function name: `process-queue`
- schedule: every 10 minutes

This is configured in `netlify.toml`.

## First Deployment Checklist

1. Push the project to GitHub.
2. Create a new Netlify site from that repository.
3. Add the environment variables listed above.
4. Deploy the site.
5. In LinkedIn Developer Portal, update the redirect URI to the deployed callback URL.
6. Open `https://YOUR-SITE.netlify.app/publisher.html`.
7. Connect LinkedIn and create a schedule.

## Local Testing

Use Netlify local dev so the static frontend and functions run together:

```bash
netlify dev
```

This is the closest match to production.

## Important Storage Note

Do not rely on `data/publishing-state.json` in production. Netlify functions are stateless and may run on different instances. Production persistence should come from Supabase.
