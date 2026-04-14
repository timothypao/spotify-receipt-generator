# Receiptify Clone

A Spotify-connected web app that logs users in with Spotify OAuth and renders their top tracks as a thermal-style receipt.

## Setup

1. Clone the repository.
2. Install dependencies:

```bash
npm install
```

3. Create your environment file from the example:

```bash
cp .env.example .env
```

4. Create a Spotify app in the Spotify Developer Dashboard.
5. Add `http://localhost:3000/callback` as an allowed redirect URI in the Spotify app settings.
6. Fill in `.env` with your Spotify client ID, client secret, redirect URI, and a session secret.

## Run locally

Start the app with:

```bash
node app.js
```

Then open [http://localhost:3000](http://localhost:3000).

## Environment variables

- `SPOTIFY_CLIENT_ID`
- `SPOTIFY_CLIENT_SECRET`
- `REDIRECT_URI`
- `SESSION_SECRET`

## Production notes

- Set `SESSION_SECRET` to a long, random string in production.
- Update the session cookie config in `app.js` to `secure: true` when serving over HTTPS in production.
