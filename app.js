require("dotenv").config();

const Anthropic = require("@anthropic-ai/sdk");
const crypto = require("crypto");
const express = require("express");
const session = require("express-session");
const fetch = require("node-fetch");
const { engine } = require("express-handlebars");

const app = express();
const PORT = process.env.PORT || 3000;

const {
  ANTHROPIC_API_KEY,
  SPOTIFY_CLIENT_ID,
  SPOTIFY_CLIENT_SECRET,
  REDIRECT_URI,
  SESSION_SECRET
} = process.env;

const anthropic = ANTHROPIC_API_KEY ? new Anthropic({ apiKey: ANTHROPIC_API_KEY }) : null;

const VALID_RANGES = new Set(["short_term", "medium_term", "long_term"]);
const missingEnvVars = [
  "SPOTIFY_CLIENT_ID",
  "SPOTIFY_CLIENT_SECRET",
  "REDIRECT_URI",
  "SESSION_SECRET"
].filter((key) => !process.env[key]);

if (missingEnvVars.length > 0) {
  throw new Error(`Missing required environment variables: ${missingEnvVars.join(", ")}`);
}

app.engine(
  "hbs",
  engine({
    extname: ".hbs",
    defaultLayout: "main",
    helpers: {
      eq: (left, right) => left === right
    }
  })
);

app.set("view engine", "hbs");
app.set("views", `${__dirname}/views`);

app.use(express.urlencoded({ extended: false }));
app.use(express.static(`${__dirname}/public`));
app.use(
  session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: false,
      sameSite: "lax"
    }
  })
);

function getBasicAuthHeader() {
  const credentials = `${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`;
  return `Basic ${Buffer.from(credentials).toString("base64")}`;
}

function buildReceiptTimestamp() {
  return new Date().toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric"
  });
}

function formatDuration(ms = 0) {
  const mins = Math.floor(ms / 60000);
  const secs = Math.floor((ms % 60000) / 1000);
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

function getRandomReceiptMessage() {
  const messages = [
    "KEEP THE NEEDLE MOVING",
    "SPIN IT AGAIN SOON",
    "YOUR SOUNDTRACK AWAITS",
    "ANOTHER ENCORE, MAYBE",
    "PRESS PLAY TOMORROW",
    "MORE TRACKS, MORE MAGIC"
  ];
  return messages[Math.floor(Math.random() * messages.length)];
}

function buildTornEdge(isTop) {
  const points = ["0 100%"];
  const segments = 12;

  if (!isTop) {
    points.length = 0;
    points.push("0 0");
  }

  for (let i = 0; i <= segments; i += 1) {
    const x = Math.round((i / segments) * 100);
    const yBase = isTop ? 15 : 85;
    const variance = Math.floor(Math.random() * 28);
    const y = isTop ? yBase + variance : yBase - variance;
    points.push(`${x}% ${y}%`);
  }

  points.push(isTop ? "100% 100%" : "100% 0");
  return `polygon(${points.join(", ")})`;
}

function getFontParam(value) {
  return value === "modern" ? "modern" : "classic";
}

function normalizeTracks(items = []) {
  return items.map((track, index) => ({
    num: String(index + 1).padStart(2, "0"),
    name: track.name,
    artists: (track.artists || []).map((artist) => artist.name).join(", "),
    duration: formatDuration(track.duration_ms)
  }));
}

async function generateCashierNote(items = []) {
  if (!anthropic || items.length === 0) {
    return null;
  }

  const topTracksList = items
    .slice(0, 10)
    .map((track) => `${track.name} - ${(track.artists || []).map((artist) => artist.name).join(", ")}`)
    .join(", ");

  try {
    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 150,
      messages: [
        {
          role: "user",
          content:
            "You are a witty cashier roasting a customer based on their music taste. " +
            `Looking at these top 10 tracks: ${topTracksList}. ` +
            "Write 2-3 sharp, funny sentences about what this person's music taste says about them. " +
            "Be specific, reference actual songs/artists. No intro, just the roast."
        }
      ]
    });

    return (message.content || [])
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join(" ")
      .trim() || null;
  } catch (error) {
    return null;
  }
}

async function exchangeCodeForTokens(code) {
  const response = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      Authorization: getBasicAuthHeader(),
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: REDIRECT_URI
    }).toString()
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Token exchange failed: ${response.status} ${errorText}`);
  }

  return response.json();
}

async function refreshAccessToken(refreshToken) {
  const response = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      Authorization: getBasicAuthHeader(),
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken
    }).toString()
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Token refresh failed: ${response.status} ${errorText}`);
  }

  return response.json();
}

async function spotifyRequest(req, endpoint, hasRetried = false) {
  const accessToken = req.session.accessToken;
  if (!accessToken) {
    throw new Error("Missing access token in session.");
  }

  const response = await fetch(endpoint, {
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });

  if (response.status === 401 && req.session.refreshToken && !hasRetried) {
    try {
      const refreshedTokens = await refreshAccessToken(req.session.refreshToken);
      req.session.accessToken = refreshedTokens.access_token;
      if (refreshedTokens.refresh_token) {
        req.session.refreshToken = refreshedTokens.refresh_token;
      }
      return spotifyRequest(req, endpoint, true);
    } catch (refreshError) {
      req.session.destroy(() => {});
      const expiredError = new Error("SESSION_EXPIRED");
      expiredError.code = "SESSION_EXPIRED";
      throw expiredError;
    }
  }

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Spotify API request failed: ${response.status} ${errorText}`);
  }

  return response.json();
}

function ensureAuthenticated(req, res, next) {
  if (req.session.accessToken) {
    return next();
  }

  if (req.query.error === "session_expired") {
    return next();
  }

  return res.redirect("/");
}

function renderReceipt(res, viewModel = {}) {
  return res.render("receipt", {
    tracks: [],
    user: null,
    range: "short_term",
    length: "10",
    font: "classic",
    receiptFontClass: "font-classic",
    generatedAt: buildReceiptTimestamp(),
    totalDuration: "0:00",
    itemCount: 0,
    cashierNote: null,
    receiptMessage: getRandomReceiptMessage(),
    receiptTopEdge: buildTornEdge(true),
    receiptBottomEdge: buildTornEdge(false),
    errorMessage: null,
    ...viewModel
  });
}

app.get("/", (req, res) => {
  const errorMessage =
    req.query.error === "session_expired"
      ? "Your Spotify session expired. Please log in again."
      : null;

  res.render("index", { errorMessage });
});

app.get("/login", (req, res) => {
  if (!SPOTIFY_CLIENT_ID || !SPOTIFY_CLIENT_SECRET || !REDIRECT_URI) {
    return res.status(500).send("Missing Spotify environment variables.");
  }

  const state = crypto.randomBytes(8).toString("hex");
  req.session.oauthState = state;

  const authorizeUrl = new URL("https://accounts.spotify.com/authorize");
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("client_id", SPOTIFY_CLIENT_ID);
  authorizeUrl.searchParams.set("scope", "user-top-read");
  authorizeUrl.searchParams.set("redirect_uri", REDIRECT_URI);
  authorizeUrl.searchParams.set("state", state);

  res.redirect(authorizeUrl.toString());
});

app.get("/callback", async (req, res) => {
  const { code, state } = req.query;
  const storedState = req.session.oauthState;

  if (!code || !state || !storedState || state !== storedState) {
    console.warn("Spotify OAuth state mismatch detected.");
    return res.redirect("/");
  }

  delete req.session.oauthState;

  try {
    const tokens = await exchangeCodeForTokens(code);
    req.session.accessToken = tokens.access_token;
    req.session.refreshToken = tokens.refresh_token;
    res.redirect("/receipt");
  } catch (error) {
    console.error("Spotify callback failed:", error.message);
    res.redirect("/");
  }
});

app.get("/receipt", ensureAuthenticated, async (req, res) => {
  if (req.query.error === "session_expired") {
    return renderReceipt(res, {
      errorMessage: "Your Spotify session expired. Please log in again."
    });
  }

  const range = VALID_RANGES.has(req.query.range) ? req.query.range : "short_term";
  const parsedLength = parseInt(req.query.length, 10);
  const length = parsedLength === 25 ? "25" : "10";
  const font = getFontParam(req.query.font);
  const limit = parseInt(length, 10) || 10;

  try {
    const [tracksResponse, user] = await Promise.all([
      spotifyRequest(
        req,
        `https://api.spotify.com/v1/me/top/tracks?limit=${limit}&time_range=${range}`
      ),
      spotifyRequest(req, "https://api.spotify.com/v1/me")
    ]);

    const tracks = normalizeTracks(tracksResponse.items);
    const totalDurationMs = (tracksResponse.items || []).reduce(
      (sum, track) => sum + (track.duration_ms || 0),
      0
    );
    const cashierNote = await generateCashierNote(tracksResponse.items || []);

    renderReceipt(res, {
      tracks,
      user,
      range,
      length,
      font,
      receiptFontClass: font === "modern" ? "font-modern" : "font-classic",
      generatedAt: buildReceiptTimestamp(),
      totalDuration: formatDuration(totalDurationMs),
      itemCount: tracks.length,
      cashierNote,
      receiptMessage: getRandomReceiptMessage(),
      receiptTopEdge: buildTornEdge(true),
      receiptBottomEdge: buildTornEdge(false)
    });
  } catch (error) {
    if (error.code === "SESSION_EXPIRED" || error.message === "SESSION_EXPIRED") {
      return res.redirect("/receipt?error=session_expired");
    }

    console.error("Failed to render receipt:", error.message);
    renderReceipt(res, {
      range,
      length,
      font,
      receiptFontClass: font === "modern" ? "font-modern" : "font-classic",
      receiptMessage: getRandomReceiptMessage(),
      receiptTopEdge: buildTornEdge(true),
      receiptBottomEdge: buildTornEdge(false),
      errorMessage:
        "We couldn't load your Spotify receipt right now. Please try again in a moment."
    });
  }
});

app.get("/logout", (req, res) => {
  req.session.destroy(() => {
    res.clearCookie("connect.sid");
    res.redirect("/");
  });
});

app.listen(PORT, () => {
  console.log(`Receiptify Clone running at http://localhost:${PORT}`);
});
