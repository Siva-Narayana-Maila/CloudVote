require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const { createProxyMiddleware } = require('http-proxy-middleware');

const app = express();
app.use(helmet());
app.use(cors({ origin: process.env.CORS_ORIGIN || 'http://localhost:3000' }));

// --- Service locations -----------------------------------------------------
// The ONLY place that changes between environments: container names in
// Docker Compose, Kubernetes Service DNS names later — set purely through
// environment variables, no code change.
const AUTH_SERVICE_URL = process.env.AUTH_SERVICE_URL || 'http://localhost:4001';
const VOTING_SERVICE_URL = process.env.VOTING_SERVICE_URL || 'http://localhost:4002';
const TALLY_SERVICE_URL = process.env.TALLY_SERVICE_URL || 'http://localhost:4003';

// Health + status routes sit ABOVE the rate limiter so frequent polling by
// the navbar's status indicator never eats into anyone's request budget.
app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'api-gateway' }));

// Pings each downstream service's /health endpoint and reports the result.
async function checkService(name, url) {
  const started = Date.now();
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(2500) });
    return { name, status: res.ok ? 'up' : 'degraded', latencyMs: Date.now() - started };
  } catch {
    return { name, status: 'down', latencyMs: null };
  }
}

app.get('/api/status', async (_req, res) => {
  const checks = await Promise.all([
    checkService('Auth service', `${AUTH_SERVICE_URL}/health`),
    checkService('Voting service', `${VOTING_SERVICE_URL}/health`),
    checkService('Tally service', `${TALLY_SERVICE_URL}/health`),
    checkService('PostgreSQL database', `${TALLY_SERVICE_URL}/health/db`),
  ]);
  const services = [{ name: 'API gateway', status: 'up', latencyMs: 0 }, ...checks];
  res.set('Cache-Control', 'no-store');
  res.json({
    overall: services.every((s) => s.status === 'up') ? 'operational' : 'degraded',
    services,
    checkedAt: new Date().toISOString(),
  });
});

// System-wide rate limiting at the edge. In Docker Compose every browser
// request reaches the gateway from the frontend container's single address,
// so this budget is effectively shared — hence the generous ceiling.
app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 1000,
    standardHeaders: true,
    legacyHeaders: false,
  })
);

// NOTE on pathRewrite: Express strips the app.use() mount path before the
// proxy sees the request, so a regex like '^/api/vote' can never match.
// Function-form rewrites rebuild the target path explicitly instead.

// /api/auth/*  -> auth-service /*  (Express already strips '/api/auth')
app.use(
  '/api/auth',
  createProxyMiddleware({
    target: AUTH_SERVICE_URL,
    changeOrigin: true,
  })
);

// /api/vote -> voting-service POST /vote
app.use(
  '/api/vote',
  createProxyMiddleware({
    target: VOTING_SERVICE_URL,
    changeOrigin: true,
    pathRewrite: () => '/vote',
  })
);

// /api/my-votes -> voting-service GET /my-votes
app.use(
  '/api/my-votes',
  createProxyMiddleware({
    target: VOTING_SERVICE_URL,
    changeOrigin: true,
    pathRewrite: () => '/my-votes',
  })
);

// /api/election -> tally-service GET /election
app.use(
  '/api/election',
  createProxyMiddleware({
    target: TALLY_SERVICE_URL,
    changeOrigin: true,
    pathRewrite: () => '/election',
  })
);

// /api/archive -> tally-service GET /archive
app.use(
  '/api/archive',
  createProxyMiddleware({
    target: TALLY_SERVICE_URL,
    changeOrigin: true,
    pathRewrite: () => '/archive',
  })
);

// /api/results, /api/results/stream -> tally-service /results, /results/stream
app.use(
  '/api/results',
  createProxyMiddleware({
    target: TALLY_SERVICE_URL,
    changeOrigin: true,
    pathRewrite: (path) => `/results${path === '/' ? '' : path}`,
  })
);

// /api/ledger/*, incl. /api/ledger/verify/:id -> tally-service /ledger/*
app.use(
  '/api/ledger',
  createProxyMiddleware({
    target: TALLY_SERVICE_URL,
    changeOrigin: true,
    pathRewrite: (path) => `/ledger${path === '/' ? '' : path}`,
  })
);

// /api/admin/* -> voting-service /admin/*  (query strings are preserved)
app.use(
  '/api/admin',
  createProxyMiddleware({
    target: VOTING_SERVICE_URL,
    changeOrigin: true,
    pathRewrite: (path) => `/admin${path === '/' ? '' : path}`,
  })
);

app.use((_req, res) => res.status(404).json({ error: 'not found' }));

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`[api-gateway] listening on ${PORT}`));