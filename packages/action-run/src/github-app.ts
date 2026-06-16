import { createSign } from 'node:crypto';

type InstallationTokenResponse = {
  token: string;
  expires_at: string;
};

type TokenCacheEntry = {
  token: string;
  expiresAtMs: number;
};

function toBase64Url(input: string): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function signJwt(payload: Record<string, number | string>, privateKeyPem: string): string {
  const header = { alg: 'RS256', typ: 'JWT' };
  const encodedHeader = toBase64Url(JSON.stringify(header));
  const encodedPayload = toBase64Url(JSON.stringify(payload));
  const signer = createSign('RSA-SHA256');
  signer.update(`${encodedHeader}.${encodedPayload}`);
  signer.end();
  const signature = signer
    .sign(privateKeyPem)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

async function githubRequest<T>(apiUrl: string, token: string, path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${apiUrl}${path}`, {
    ...init,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`GitHub App auth request failed (${res.status}) on ${path}: ${body}`);
  }
  return (await res.json()) as T;
}

export class GitHubAppTokenProvider {
  private readonly cache = new Map<string, TokenCacheEntry>();

  constructor(
    private readonly appId: string,
    private readonly privateKeyPem: string,
    private readonly apiUrl = process.env.GITHUB_API_URL ?? 'https://api.github.com',
  ) {}

  private appJwt(): string {
    const now = Math.floor(Date.now() / 1000);
    return signJwt(
      {
        iat: now - 60,
        exp: now + 9 * 60,
        iss: this.appId,
      },
      this.privateKeyPem,
    );
  }

  async tokenForRepo(owner: string, repo: string): Promise<string> {
    const key = `${owner}/${repo}`;
    const cached = this.cache.get(key);
    if (cached && cached.expiresAtMs > Date.now() + 60_000) {
      return cached.token;
    }

    const jwt = this.appJwt();
    const installation = await githubRequest<{ id: number }>(
      this.apiUrl,
      jwt,
      `/repos/${owner}/${repo}/installation`,
    );
    const tokenResp = await githubRequest<InstallationTokenResponse>(
      this.apiUrl,
      jwt,
      `/app/installations/${installation.id}/access_tokens`,
      { method: 'POST' },
    );

    this.cache.set(key, {
      token: tokenResp.token,
      expiresAtMs: Date.parse(tokenResp.expires_at),
    });
    return tokenResp.token;
  }
}
