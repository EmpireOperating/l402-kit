import http, { IncomingMessage, ServerResponse } from 'node:http';

export type MockL402ServerOpts = {
  /** Path that requires payment (default: /paid) */
  path?: string;
  /** Header name required on retry (default: x-l402-proof) */
  proofHeader?: string;
  /** Proof value considered valid (default: "paid") */
  requiredProof?: string;

  /** If true, send the L402 challenge via WWW-Authenticate header instead of JSON body. */
  challengeInHeader?: boolean;

  /**
   * JSON challenge shape to emit when challengeInHeader=false.
   * Defaults to "flat".
   */
  challengeJsonVariant?:
    | 'flat'
    | 'l402'
    | 'challenge'
    | 'data'
    | 'details'
    | 'error'
    | 'error.l402'
    | 'data.l402'
    | 'data.challenge';

  /** Which key name to use for the invoice field (default: invoice). */
  invoiceKey?: 'invoice' | 'payment_request' | 'paymentRequest' | 'payreq' | 'pr' | 'bolt11' | 'bolt-11' | 'bolt_11';

  /** If true, include proof header hint in the challenge response. */
  includeProofHeaderHint?: boolean;

  /** If true, include a macaroon param in header challenges (default true). */
  includeMacaroon?: boolean;
};

function buildJsonChallenge(opts: {
  variant: NonNullable<MockL402ServerOpts['challengeJsonVariant']>;
  invoiceKey: NonNullable<MockL402ServerOpts['invoiceKey']>;
  invoice: string;
  proofHeader: string;
  includeProofHeaderHint: boolean;
}) {
  const base: any = { [opts.invoiceKey]: opts.invoice };
  if (opts.includeProofHeaderHint) base.proofHeader = opts.proofHeader;

  switch (opts.variant) {
    case 'flat':
      return { ...base, meta: { kind: 'mock' } };
    case 'l402':
      return { l402: { ...base, meta: { kind: 'mock' } } };
    case 'challenge':
      return { challenge: { ...base } };
    case 'data':
      return { data: { ...base } };
    case 'details':
      return { details: { ...base } };
    case 'error':
      return { error: { ...base } };
    case 'error.l402':
      return { error: { l402: { ...base } } };
    case 'data.l402':
      return { data: { l402: { ...base } } };
    case 'data.challenge':
      return { data: { challenge: { ...base } } };
    default:
      return { ...base };
  }
}

export async function startMockL402Server(opts: MockL402ServerOpts = {}) {
  const path = opts.path || '/paid';
  const proofHeader = (opts.proofHeader || 'x-l402-proof').toLowerCase();
  const requiredProof = opts.requiredProof || 'paid';

  const challengeJsonVariant = opts.challengeJsonVariant || 'flat';
  const invoiceKey = opts.invoiceKey || 'invoice';
  const includeProofHeaderHint = Boolean(opts.includeProofHeaderHint);
  const includeMacaroon = opts.includeMacaroon ?? true;

  const server = http.createServer((req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

    if (url.pathname === '/healthz') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
      return;
    }

    if (url.pathname !== path) {
      res.writeHead(404, { 'content-type': 'text/plain' });
      res.end('not found');
      return;
    }

    const proof = req.headers[proofHeader] ? String(req.headers[proofHeader]) : '';
    if (proof !== requiredProof) {
      if (opts.challengeInHeader) {
        const macaroon = includeMacaroon ? 'mockmacaroon' : undefined;
        // Common L402/LSAT style.
        const parts = [
          'L402',
          ...(macaroon ? [`macaroon="${macaroon}"`] : []),
          // Exercise non-"invoice" invoice param names as well.
          // We always include "invoice" too, since some clients are strict.
          `invoice="lnbc1mockinvoice"`,
          ...(invoiceKey !== 'invoice' ? [`${invoiceKey}="lnbc1mockinvoice"`] : []),
          ...(includeProofHeaderHint ? [`proof_header="${proofHeader}"`] : [])
        ];

        res.writeHead(402, {
          'content-type': 'text/plain',
          'www-authenticate': parts.join(', ')
        });
        res.end('payment required');
        return;
      }

      res.writeHead(402, { 'content-type': 'application/json' });
      res.end(
        JSON.stringify(
          buildJsonChallenge({
            variant: challengeJsonVariant,
            invoiceKey,
            invoice: 'lnbc1mockinvoice',
            proofHeader,
            includeProofHeaderHint
          })
        )
      );
      return;
    }

    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, paid: true }));
  });

  await new Promise<void>((resolve, reject) => {
    server.listen(0, '127.0.0.1', () => resolve());
    server.on('error', reject);
  });

  const addr = server.address();
  if (!addr || typeof addr === 'string') throw new Error('failed to bind');
  const baseUrl = `http://127.0.0.1:${addr.port}`;

  return {
    baseUrl,
    close: () =>
      new Promise<void>((resolve, reject) =>
        server.close((err?: Error | null) => (err ? reject(err) : resolve()))
      )
  };
}
