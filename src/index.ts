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

function parseChallenge(res: Response, bodyText: string): L402Challenge | null {
  // MVP: accept JSON body with `{ invoice, proofHeader? }`.
  try {
    const j = JSON.parse(bodyText);
    if (!j || typeof j !== 'object') return null;
    const invoice = (j as any).invoice;
    if (typeof invoice !== 'string' || !invoice.trim()) return null;
    const proofHeader = typeof (j as any).proofHeader === 'string' ? (j as any).proofHeader : undefined;
    const meta = typeof (j as any).meta === 'object' && (j as any).meta ? (j as any).meta : undefined;
    return { invoice, proofHeader, meta };
  } catch {
    return null;
  }
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
