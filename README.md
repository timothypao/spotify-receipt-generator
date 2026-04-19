# Spotify Receipt Generator

A Spotify-connected web app that logs users in via Spotify OAuth and renders their top tracks as a thermal-style receipt — complete with torn zigzag edges, an AI-generated personality roast, and customizable display options.

## Features

- **Spotify OAuth** — secure server-side Authorization Code flow, tokens never exposed to the client
- **Top tracks receipt** — displays your most-played songs in a thermal paper receipt UI
- **Three time ranges** — Last Month, Last 6 Months, All Time
- **Track length (AMT)** — each song's duration displayed as a receipt line item
- **Total listening time** — summed at the bottom like a receipt total
- **AI Cashier Note** — Claude (Anthropic API) generates a witty 2-3 sentence personality roast based on your top tracks
- **Dynamic zigzag edges** — torn paper effect generated fresh on every page load via client-side SVG clip path
- **Customizable receipt** — toggle between Top 10 / Top 25 tracks and Classic / Modern font
- **Mobile-friendly** — receipt is screenshot-ready on any screen size

## Tech Stack

- Node.js + Express
- Handlebars (server-side templating)
- Spotify Web API
- Anthropic Claude API (`claude-sonnet-4-20250514`)
- Vanilla CSS
- express-session for auth state

## Setup

1. Clone the repository:

```bash
git clone https://github.com/timothypao/spotify-receipt-generator.git
cd spotify-receipt-generator
```

2. Install dependencies:

```bash
npm install
```

3. Create your environment file:

```bash
cp .env.example .env
```

4. Register an app in the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard):
   - Add `http://127.0.0.1:3000/callback` as an allowed Redirect URI (not localhost)
   - Copy your Client ID and Client Secret

5. Get an Anthropic API key at [console.anthropic.com](https://console.anthropic.com)

6. Fill in `.env`:

```
SPOTIFY_CLIENT_ID=your_spotify_client_id
SPOTIFY_CLIENT_SECRET=your_spotify_client_secret
REDIRECT_URI=http://127.0.0.1:3000/callback
SESSION_SECRET=any_long_random_string
ANTHROPIC_API_KEY=your_anthropic_api_key
```

## Run locally

```bash
node app.js
```

Then open [http://127.0.0.1:3000](http://127.0.0.1:3000).

> Use `127.0.0.1` not `localhost` — Spotify's OAuth requires this for local development.

## Environment variables

| Variable | Description |
|---|---|
| `SPOTIFY_CLIENT_ID` | From Spotify Developer Dashboard |
| `SPOTIFY_CLIENT_SECRET` | From Spotify Developer Dashboard |
| `REDIRECT_URI` | `http://127.0.0.1:3000/callback` for local dev |
| `SESSION_SECRET` | Any long random string |
| `ANTHROPIC_API_KEY` | From Anthropic Console |

## Spotify Developer Mode limits

This app runs in Spotify's Development Mode, which limits access to **5 users** total. To share it publicly beyond 5 users, you must apply for Extended Quota Mode in the Spotify Developer Dashboard — which requires a registered business and 250k MAU.

## Production notes

- Set `SESSION_SECRET` to a long, random string
- Set `secure: true` on the session cookie config in `app.js` when serving over HTTPS
- Add your production URL (e.g. `https://your-app.up.railway.app/callback`) as a second Redirect URI in the Spotify Dashboard
- Set all `.env` variables in your hosting platform's environment variable settings (Railway, Render, etc.)
