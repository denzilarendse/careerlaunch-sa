# CareerLaunch SA deployment configuration

## Production URL

- Netlify: https://careerlaunchsa.netlify.app/
- Supabase project: CareerLaunch SA (`rqyvfbuvdhbtwakkqnok`)

## Netlify

The current frontend build does **not** require sensitive Netlify environment variables.
`public/runtime-config.js` contains only browser-safe Supabase public configuration.

For autonomous production deployment from GitHub Actions, configure these **GitHub repository Actions secrets**:

- `NETLIFY_AUTH_TOKEN` — private Netlify personal access token.
- `NETLIFY_SITE_ID` — the CareerLaunch SA Netlify site ID/API ID.

Do not put either value in source code, `.env`, browser runtime config, or chat.

## Live AI CV

AI generation and the conversational CV interview run only in the Supabase Edge Function, not in Netlify or the browser.

Required Supabase Edge Function secret:

- `CAREERLAUNCH_AI_API_KEY` — private OpenAI project API key.

Optional Supabase Edge Function overrides:

- `CAREERLAUNCH_AI_API_URL` — defaults to `https://api.openai.com/v1/responses`.
- `CAREERLAUNCH_AI_MODEL` — defaults to `gpt-6-luna` for cost-sensitive live testing.

The OpenAI key must never be stored in Netlify public variables or frontend files.

If the AI key is absent or the provider is unavailable, the Edge Function returns a structured evidence-only fallback CV instead of inventing candidate facts.

## Release verification

A production release is accepted only after:

1. repository checks pass;
2. the exact build is deployed;
3. `/release.json` on the canonical Netlify URL matches the Git commit;
4. authenticated CV generation is tested;
5. Android is rebuilt from the same commit;
6. security and RLS checks remain green.
