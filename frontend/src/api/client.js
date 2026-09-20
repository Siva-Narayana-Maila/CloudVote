// Everything goes through /api, which Vite proxies to the API Gateway in
// dev (vite.config.js) and which a production build would hit directly at
// whatever domain fronts the gateway (a GKE Ingress, a load balancer, etc).
// No service hostname ever appears here — that's the gateway's job — so
// moving from local Docker Compose to the cloud never touches this file.
const BASE = '/api';

function getToken() {
  return sessionStorage.getItem('cloudvote_token');
}

function setToken(token) {
  sessionStorage.setItem('cloudvote_token', token);
}

function clearToken() {
  sessionStorage.removeItem('cloudvote_token');
}

async function request(path, { method = 'GET', body, auth = false } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (auth) {
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  return data;
}

export const api = {
  register: (email, password) => request('/auth/register', { method: 'POST', body: { email, password } }),
  mfaSetup: () => request('/auth/mfa/setup', { method: 'POST', auth: true }),
  mfaConfirmSetup: (code) => request('/auth/mfa/confirm-setup', { method: 'POST', body: { code }, auth: true }),
  login: (email, password) => request('/auth/login', { method: 'POST', body: { email, password } }),
  mfaVerify: (preAuthToken, code) =>
    request('/auth/mfa/verify', { method: 'POST', body: { preAuthToken, code } }),
  castVote: (candidateId) =>
    request('/vote', { method: 'POST', body: { candidateId }, auth: true }),
  getElection: () => request('/election'),
  getResults: () => request('/results'),
  getLedgerIntegrity: () => request('/ledger/integrity'),
  verifyReceipt: (receiptId) => request(`/ledger/verify/${encodeURIComponent(receiptId)}`),
  getToken,
  setToken,
  clearToken,
  getProfile: () => request('/auth/me', { auth: true }),
  updateProfile: (payload) => request('/auth/me', { method: 'PATCH', body: payload, auth: true }),
  getMyVotes: () => request('/my-votes', { auth: true }),
};
