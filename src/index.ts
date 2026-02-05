export type L402Challenge = {
  invoice: string;
  /** Optional hint for what header to use on retry. */
  proofHeader?: string;
  meta?: Record<string, unknown>;
};

export type PayFn = (challenge: L402Challenge) => Promise<{ proof: string }>;

export type FetchWithL402Options = {
  /**
   * Called when the server returns HTTP 402 with an L402 challenge.
   * Should pay the invoice (or otherwise obtain proof) and return proof string.
   */
  pay: PayFn;

  /** Header name to attach proof on retry. Defaults to `x-l402-proof`. */
  proofHeader?: string;

  /** Max retries on 402. Defaults to 1 (i.e., one pay + retry). */
  max402Retries?: number;
};

function parseAuthParams(s: string): Record<string, string> {
  // Parses `k=v` / `k="v"` params from a WWW-Authenticate challenge.
  // Minimal, not a full RFC parser (good enough for common L402 shapes).
  const out: Record<string, string> = {};
  const parts = s
    .split(',')
    .map(p => p.trim())
    .filter(Boolean);

  for (const part of parts) {
    const eq = part.indexOf('=');
    if (eq <= 0) continue;
    const k = part.slice(0, eq).trim().toLowerCase();
    let v = part.slice(eq + 1).trim();
    if (v.startsWith('"') && v.endsWith('"') && v.length >= 2) v = v.slice(1, -1);
    out[k] = v;
  }

  return out;
}

function parseWwwAuthenticateL402(res: Response): L402Challenge | null {
  const h = res.headers.get('www-authenticate');
  if (!h) return null;

  // Common shape: `L402 macaroon="...", invoice="lnbc..."`
  // Some implementations use `LSAT` scheme; we treat both.
  //
  // Note: multiple WWW-Authenticate values may be concatenated with `,` by some fetch impls.
  // We split only on commas that look like they're starting a new auth challenge.
  const segments = h.split(/,(?=\s*(?:L402|LSAT)\s)/i).map(s => s.trim()).filter(Boolean);

  for (const seg of segments) {
    const space = seg.indexOf(' ');
    const scheme = (space === -1 ? seg : seg.slice(0, space)).trim().toLowerCase();
    const rest = space === -1 ? '' : seg.slice(space + 1).trim();

    if (scheme !== 'l402' && scheme !== 'lsat') continue;

    const params = parseAuthParams(rest);

    // Invoice param variants seen in the wild.
    const invoice = params.invoice || params.payreq || params.payment_request || params.paymentrequest || params.pr || params.bolt11;
    if (!invoice || typeof invoice !== 'string' || !invoice.trim()) continue;

    const meta: Record<string, unknown> = {};
    if (params.macaroon) meta.macaroon = params.macaroon;

    return {
      invoice,
      proofHeader: 'authorization',
      meta
    };
  }

  return null;
}

function parseJsonChallenge(bodyText: string): L402Challenge | null {
  // Accept JSON bodies that carry a BOLT11 invoice.
  // Variants seen in the wild include: invoice, payment_request, paymentRequest, pr, bolt11.
  try {
    const j = JSON.parse(bodyText);
    if (!j || typeof j !== 'object') return null;

    const candidate = (j as any).invoice ?? (j as any).payment_request ?? (j as any).paymentRequest ?? (j as any).pr ?? (j as any).bolt11;
    if (typeof candidate !== 'string' || !candidate.trim()) return null;

    const proofHeader =
      typeof (j as any).proofHeader === 'string'
        ? (j as any).proofHeader
        : typeof (j as any).proof_header === 'string'
          ? (j as any).proof_header
          : undefined;

    const meta = typeof (j as any).meta === 'object' && (j as any).meta ? (j as any).meta : undefined;

    return { invoice: candidate, proofHeader, meta };
  } catch {
    return null;
  }
}

function parseChallenge(res: Response, bodyText: string): L402Challenge | null {
  // Prefer header-based challenges when present.
  return parseWwwAuthenticateL402(res) || parseJsonChallenge(bodyText);
}

export async function fetchWithL402(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  opts: FetchWithL402Options
): Promise<Response> {
  if (!opts?.pay) throw new Error('fetchWithL402: opts.pay is required');

  const maxRetries = Math.max(0, Number(opts.max402Retries ?? 1));
  const defaultProofHeader = String(opts.proofHeader || 'x-l402-proof');

  // Clone init each attempt (headers are mutable).
  const baseInit: RequestInit = { ...init };

  let attempt = 0;
  while (true) {
    const res = await fetch(input as any, { ...baseInit, headers: new Headers(baseInit.headers || undefined) });

    if (res.status !== 402) return res;

    if (attempt >= maxRetries) return res;

    const bodyText = await res.text().catch(() => '');
    const challenge = parseChallenge(res, bodyText);
    if (!challenge) return res;

    const { proof } = await opts.pay(challenge);
    const hdrName = String(challenge.proofHeader || defaultProofHeader);

    const headers = new Headers(baseInit.headers || undefined);
    headers.set(hdrName, proof);

    baseInit.headers = headers;
    attempt += 1;
  }
}
