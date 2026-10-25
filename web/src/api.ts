export type RuntimeConfig = {
  apiBase?: string;
  contactUrl?: string;
  authDomain?: string;
  clientId?: string;
  redirectUri?: string;
  localDevelopment?: boolean;
};
declare global {
  interface Window {
    PORTFOLIO_CONFIG?: RuntimeConfig;
  }
}
export const config = () => window.PORTFOLIO_CONFIG ?? {};
export const localMode = () =>
  config().localDevelopment === true &&
  config().apiBase === '/api' &&
  ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
let accessToken = '';
export const setAccessToken = (value: string) => {
  accessToken = value;
};
export const authenticated = () => localMode() || !!accessToken;
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
export async function api<T>(
  path: string,
  options: RequestInit = {},
  admin = false,
): Promise<T> {
  const base = config().apiBase;
  if (!base)
    throw new ApiError(
      503,
      'NOT_CONFIGURED',
      'Project publishing is not connected yet.',
    );
  const headers = new Headers(options.headers);
  if (options.body) headers.set('Content-Type', 'application/json');
  if (admin) {
    if (!authenticated())
      throw new ApiError(401, 'LOGIN_REQUIRED', 'Please sign in.');
    headers.set(
      'Authorization',
      `Bearer ${localMode() ? 'local-owner' : accessToken}`,
    );
  }
  const response = await fetch(`${base.replace(/\/$/, '')}${path}`, {
    ...options,
    headers,
    cache: 'no-store',
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new ApiError(
      response.status,
      body.error?.code ?? 'REQUEST_FAILED',
      body.error?.message ?? `Request failed (${response.status}).`,
    );
  return body as T;
}
export const operation = () => crypto.randomUUID();
export function safeUrl(value: string) {
  try {
    const u = new URL(value);
    return u.protocol === 'https:' && !u.username && !u.password
      ? u.href
      : null;
  } catch {
    return null;
  }
}
const encode = (data: Uint8Array) =>
  btoa(String.fromCharCode(...data))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
export async function login() {
  const c = config();
  if (localMode()) return;
  if (!c.authDomain || !c.clientId || !c.redirectUri)
    throw new Error('Administrator sign-in is not configured.');
  const verifier = encode(crypto.getRandomValues(new Uint8Array(48)));
  const state = encode(crypto.getRandomValues(new Uint8Array(32)));
  const challenge = encode(
    new Uint8Array(
      await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)),
    ),
  );
  sessionStorage.setItem(
    'portfolio.oauth',
    JSON.stringify({ verifier, state, createdAt: Date.now() }),
  );
  const url = new URL(
    '/oauth2/authorize',
    `https://${c.authDomain.replace(/^https:\/\//, '')}`,
  );
  url.search = new URLSearchParams({
    response_type: 'code',
    client_id: c.clientId,
    redirect_uri: c.redirectUri,
    scope: 'openid',
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
  }).toString();
  location.assign(url.href);
}
let callbackPromise: Promise<void> | undefined;
export function finishLogin() {
  return (callbackPromise ??= (async () => {
    const c = config();
    const query = new URLSearchParams(location.search);
    const raw = sessionStorage.getItem('portfolio.oauth');
    sessionStorage.removeItem('portfolio.oauth');
    history.replaceState({}, '', '/admin/callback');
    if (!raw || !c.authDomain || !c.clientId || !c.redirectUri)
      throw new Error(
        'Your sign-in session has expired. Please sign in again.',
      );
    const saved = JSON.parse(raw);
    if (
      query.get('state') !== saved.state ||
      Date.now() - saved.createdAt > 600000 ||
      !query.get('code') ||
      query.has('error')
    )
      throw new Error('Sign-in verification failed. Please sign in again.');
    const response = await fetch(
      `https://${c.authDomain.replace(/^https:\/\//, '')}/oauth2/token`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          client_id: c.clientId,
          redirect_uri: c.redirectUri,
          code: query.get('code')!,
          code_verifier: saved.verifier,
        }),
      },
    );
    const tokens = await response.json();
    if (!response.ok || !tokens.access_token)
      throw new Error('Sign-in could not be completed.');
    setAccessToken(tokens.access_token);
    setTimeout(
      () => setAccessToken(''),
      Math.min(Number(tokens.expires_in) || 3600, 3600) * 1000,
    );
  })());
}
export function logout() {
  setAccessToken('');
  sessionStorage.removeItem('portfolio.oauth');
  const c = config();
  if (!localMode() && c.authDomain && c.clientId && c.redirectUri) {
    const url = new URL('/logout', c.authDomain);
    url.search = new URLSearchParams({
      client_id: c.clientId,
      logout_uri: new URL('/admin/login', c.redirectUri).href,
    }).toString();
    location.assign(url.href);
  } else location.assign('/');
}
export function publicMedia(slug: string, id: string) {
  return `${config().apiBase?.replace(/\/$/, '') ?? ''}/public/projects/${encodeURIComponent(slug)}/media/${encodeURIComponent(id)}`;
}
