require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const { createProxyMiddleware } = require('http-proxy-middleware');

const app = express();
app.use(helmet());
app.use(cors({ origin: process.env.CORS_ORIGIN || 'http://localhost:3000' }));

// System-wide rate limiting at the edge — the first line of defense before
// traffic ever reaches a backend service.
app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
  })
);

// --- Service locations -----------------------------------------------------
// This is the ONLY place that needs to change when moving between
// environments: local Docker Compose uses container names
// (http://auth-service:4001), a later Kubernetes deployment would use
// K8s Service DNS names (http://auth-service.cloudvote.svc.cluster.local),
// and each is set purely via environment variables — no code change needed.
const AUTH_SERVICE_URL = process.env.AUTH_SERVICE_URL || 'http://localhost:4001';
const VOTING_SERVICE_URL = process.env.VOTING_SERVICE_URL || 'http://localhost:4002';
const TALLY_SERVICE_URL = process.env.TALLY_SERVICE_URL || 'http://localhost:4003';

app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'api-gateway' }));

// NOTE on pathRewrite below: Express strips the app.use() mount path from
// req.url *before* the proxy middleware ever sees it. So mounting at
// '/api/vote' means the proxy receives '/' (not '/api/vote'), and a
// pathRewrite regex like '^/api/vote' can never match — it silently
// no-ops and the request gets forwarded to the target's root path
// instead of '/vote'. Using a function form of pathRewrite that
// reconstructs the target path explicitly avoids this entirely.

// /api/auth/*  -> auth-service /*
// Express already strips '/api/auth', leaving e.g. '/register', '/login',
// '/mfa/setup' — which happen to be auth-service's actual route paths, so
// no rewrite is needed here at all.
app.use(
  '/api/auth',
  createProxyMiddleware({
    target: AUTH_SERVICE_URL,
    changeOrigin: true,
  })
);

// /api/vote  -> voting-service POST /vote (single endpoint, no sub-paths)
app.use(
  '/api/vote',
  createProxyMiddleware({
    target: VOTING_SERVICE_URL,
    changeOrigin: true,
    pathRewrite: () => '/vote',
  })
);

// /api/results -> tally-service GET /results (single endpoint)
// /api/election -> tally-service GET /election
app.use(
  '/api/election',
  createProxyMiddleware({
    target: TALLY_SERVICE_URL,
    changeOrigin: true,
    pathRewrite: () => '/election',
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

// /api/admin/* -> voting-service /admin/*
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
