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
};

export async function startMockL402Server(opts: MockL402ServerOpts = {}) {
  const path = opts.path || '/paid';
  const proofHeader = (opts.proofHeader || 'x-l402-proof').toLowerCase();
  const requiredProof = opts.requiredProof || 'paid';

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
        res.writeHead(402, {
          'content-type': 'text/plain',
          // Common L402/LSAT style.
          'www-authenticate': `L402 macaroon="mockmacaroon", invoice="lnbc1mockinvoice"`
        });
        res.end('payment required');
        return;
      }

      res.writeHead(402, { 'content-type': 'application/json' });
      res.end(
        JSON.stringify({
          invoice: 'lnbc1mockinvoice',
          proofHeader: proofHeader,
          meta: { kind: 'mock' }
        })
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
    close: () => new Promise<void>((resolve, reject) => server.close((err?: Error | null) => (err ? reject(err) : resolve())))
  };
}
