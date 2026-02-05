import test from 'node:test';
import assert from 'node:assert/strict';

import { fetchWithL402 } from '../src/index.js';
import { startMockL402Server } from '../src/mock_server.js';

test('fetchWithL402: pays on 402 then retries with proof header (json challenge)', async () => {
  const srv = await startMockL402Server();
  try {
    let payCalls = 0;
    const res = await fetchWithL402(`${srv.baseUrl}/paid`, undefined, {
      pay: async (challenge) => {
        payCalls += 1;
        assert.equal(challenge.invoice, 'lnbc1mockinvoice');
        return { proof: 'paid' };
      }
    });

    assert.equal(payCalls, 1);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.equal(body.paid, true);
  } finally {
    await srv.close();
  }
});

test('fetchWithL402: pays on 402 then retries with Authorization header (WWW-Authenticate L402)', async () => {
  const srv = await startMockL402Server({ challengeInHeader: true, proofHeader: 'authorization' });
  try {
    let payCalls = 0;
    const res = await fetchWithL402(`${srv.baseUrl}/paid`, undefined, {
      pay: async (challenge) => {
        payCalls += 1;
        assert.equal(challenge.invoice, 'lnbc1mockinvoice');
        assert.equal(challenge.proofHeader, 'authorization');
        assert.equal((challenge.meta as any)?.macaroon, 'mockmacaroon');
        return { proof: 'paid' };
      }
    });

    assert.equal(payCalls, 1);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.equal(body.paid, true);
  } finally {
    await srv.close();
  }
});

test('fetchWithL402: parses JSON variants (payment_request + proof_header)', async () => {
  const { baseUrl, close } = await (async () => {
    const http = await import('node:http');
    const server = http.createServer((req: any, res: any) => {
      const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
      if (url.pathname !== '/paid') {
        res.writeHead(404, { 'content-type': 'text/plain' });
        res.end('not found');
        return;
      }

      const proof = req.headers['x-l402-proof'] ? String(req.headers['x-l402-proof']) : '';
      if (proof !== 'paid') {
        res.writeHead(402, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ payment_request: 'lnbc1mockinvoice', proof_header: 'x-l402-proof' }));
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
    return {
      baseUrl: `http://127.0.0.1:${addr.port}`,
      close: () => new Promise<void>((resolve, reject) => server.close((err?: any) => (err ? reject(err) : resolve())))
    };
  })();

  try {
    let payCalls = 0;
    const res = await fetchWithL402(`${baseUrl}/paid`, undefined, {
      pay: async (challenge) => {
        payCalls += 1;
        assert.equal(challenge.invoice, 'lnbc1mockinvoice');
        assert.equal(challenge.proofHeader, 'x-l402-proof');
        return { proof: 'paid' };
      }
    });

    assert.equal(payCalls, 1);
    assert.equal(res.status, 200);
  } finally {
    await close();
  }
});

test('fetchWithL402: parses payreq variant in WWW-Authenticate (LSAT)', async () => {
  const { baseUrl, close } = await (async () => {
    const http = await import('node:http');
    const server = http.createServer((req: any, res: any) => {
      const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
      if (url.pathname !== '/paid') {
        res.writeHead(404, { 'content-type': 'text/plain' });
        res.end('not found');
        return;
      }

      const auth = req.headers['authorization'] ? String(req.headers['authorization']) : '';
      if (auth !== 'paid') {
        res.writeHead(402, {
          'content-type': 'text/plain',
          'www-authenticate': 'LSAT macaroon="mockmacaroon", payreq="lnbc1mockinvoice"'
        });
        res.end('payment required');
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
    return {
      baseUrl: `http://127.0.0.1:${addr.port}`,
      close: () => new Promise<void>((resolve, reject) => server.close((err?: any) => (err ? reject(err) : resolve())))
    };
  })();

  try {
    let payCalls = 0;
    const res = await fetchWithL402(`${baseUrl}/paid`, undefined, {
      pay: async (challenge) => {
        payCalls += 1;
        assert.equal(challenge.invoice, 'lnbc1mockinvoice');
        assert.equal(challenge.proofHeader, 'authorization');
        assert.equal((challenge.meta as any)?.macaroon, 'mockmacaroon');
        return { proof: 'paid' };
      }
    });

    assert.equal(payCalls, 1);
    assert.equal(res.status, 200);
  } finally {
    await close();
  }
});

test('fetchWithL402: handles combined WWW-Authenticate header (Bearer + L402)', async () => {
  const { baseUrl, close } = await (async () => {
    const http = await import('node:http');
    const server = http.createServer((req: any, res: any) => {
      const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
      if (url.pathname !== '/paid') {
        res.writeHead(404, { 'content-type': 'text/plain' });
        res.end('not found');
        return;
      }

      const auth = req.headers['authorization'] ? String(req.headers['authorization']) : '';
      if (auth !== 'paid') {
        res.writeHead(402, {
          'content-type': 'text/plain',
          'www-authenticate': 'Bearer realm="example", L402 macaroon="mockmacaroon", invoice="lnbc1mockinvoice"'
        });
        res.end('payment required');
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
    return {
      baseUrl: `http://127.0.0.1:${addr.port}`,
      close: () => new Promise<void>((resolve, reject) => server.close((err?: any) => (err ? reject(err) : resolve())))
    };
  })();

  try {
    let payCalls = 0;
    const res = await fetchWithL402(`${baseUrl}/paid`, undefined, {
      pay: async (challenge) => {
        payCalls += 1;
        assert.equal(challenge.invoice, 'lnbc1mockinvoice');
        assert.equal(challenge.proofHeader, 'authorization');
        assert.equal((challenge.meta as any)?.macaroon, 'mockmacaroon');
        return { proof: 'paid' };
      }
    });

    assert.equal(payCalls, 1);
    assert.equal(res.status, 200);
  } finally {
    await close();
  }
});

test('fetchWithL402: parses semicolon-delimited WWW-Authenticate params', async () => {
  const { baseUrl, close } = await (async () => {
    const http = await import('node:http');
    const server = http.createServer((req: any, res: any) => {
      const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
      if (url.pathname !== '/paid') {
        res.writeHead(404, { 'content-type': 'text/plain' });
        res.end('not found');
        return;
      }

      const auth = req.headers['authorization'] ? String(req.headers['authorization']) : '';
      if (auth !== 'paid') {
        res.writeHead(402, {
          'content-type': 'text/plain',
          'www-authenticate': 'L402 macaroon="mockmacaroon"; invoice="lnbc1mockinvoice"'
        });
        res.end('payment required');
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
    return {
      baseUrl: `http://127.0.0.1:${addr.port}`,
      close: () => new Promise<void>((resolve, reject) => server.close((err?: any) => (err ? reject(err) : resolve())))
    };
  })();

  try {
    let payCalls = 0;
    const res = await fetchWithL402(`${baseUrl}/paid`, undefined, {
      pay: async (challenge) => {
        payCalls += 1;
        assert.equal(challenge.invoice, 'lnbc1mockinvoice');
        assert.equal(challenge.proofHeader, 'authorization');
        assert.equal((challenge.meta as any)?.macaroon, 'mockmacaroon');
        return { proof: 'paid' };
      }
    });

    assert.equal(payCalls, 1);
    assert.equal(res.status, 200);
  } finally {
    await close();
  }
});

test('fetchWithL402: parses space-delimited WWW-Authenticate params', async () => {
  const { baseUrl, close } = await (async () => {
    const http = await import('node:http');
    const server = http.createServer((req: any, res: any) => {
      const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
      if (url.pathname !== '/paid') {
        res.writeHead(404, { 'content-type': 'text/plain' });
        res.end('not found');
        return;
      }

      const auth = req.headers['authorization'] ? String(req.headers['authorization']) : '';
      if (auth !== 'paid') {
        // Some implementations omit commas/semicolons and just space-separate params.
        res.writeHead(402, {
          'content-type': 'text/plain',
          'www-authenticate': 'L402 macaroon="mockmacaroon" invoice="lnbc1mockinvoice"'
        });
        res.end('payment required');
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
    return {
      baseUrl: `http://127.0.0.1:${addr.port}`,
      close: () => new Promise<void>((resolve, reject) => server.close((err?: any) => (err ? reject(err) : resolve())))
    };
  })();

  try {
    let payCalls = 0;
    const res = await fetchWithL402(`${baseUrl}/paid`, undefined, {
      pay: async (challenge) => {
        payCalls += 1;
        assert.equal(challenge.invoice, 'lnbc1mockinvoice');
        assert.equal(challenge.proofHeader, 'authorization');
        assert.equal((challenge.meta as any)?.macaroon, 'mockmacaroon');
        return { proof: 'paid' };
      }
    });

    assert.equal(payCalls, 1);
    assert.equal(res.status, 200);
  } finally {
    await close();
  }
});

test('fetchWithL402: respects proof_header hint in WWW-Authenticate', async () => {
  const { baseUrl, close } = await (async () => {
    const http = await import('node:http');
    const server = http.createServer((req: any, res: any) => {
      const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
      if (url.pathname !== '/paid') {
        res.writeHead(404, { 'content-type': 'text/plain' });
        res.end('not found');
        return;
      }

      // NOTE: node lowercases header keys.
      const proof = req.headers['x-l402-proof'] ? String(req.headers['x-l402-proof']) : '';
      if (proof !== 'paid') {
        res.writeHead(402, {
          'content-type': 'text/plain',
          'www-authenticate': 'L402 invoice="lnbc1mockinvoice", proof_header="x-l402-proof"'
        });
        res.end('payment required');
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
    return {
      baseUrl: `http://127.0.0.1:${addr.port}`,
      close: () => new Promise<void>((resolve, reject) => server.close((err?: any) => (err ? reject(err) : resolve())))
    };
  })();

  try {
    let payCalls = 0;
    const res = await fetchWithL402(`${baseUrl}/paid`, undefined, {
      // Default is x-l402-proof; we want to ensure we obey the hint from the header challenge.
      proofHeader: 'x-l402-proof',
      pay: async (challenge) => {
        payCalls += 1;
        assert.equal(challenge.invoice, 'lnbc1mockinvoice');
        assert.equal(challenge.proofHeader, 'x-l402-proof');
        return { proof: 'paid' };
      }
    });

    assert.equal(payCalls, 1);
    assert.equal(res.status, 200);
  } finally {
    await close();
  }
});

test('fetchWithL402: parses JSON variants (payreq)', async () => {
  const { baseUrl, close } = await (async () => {
    const http = await import('node:http');
    const server = http.createServer((req: any, res: any) => {
      const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
      if (url.pathname !== '/paid') {
        res.writeHead(404, { 'content-type': 'text/plain' });
        res.end('not found');
        return;
      }

      const proof = req.headers['x-l402-proof'] ? String(req.headers['x-l402-proof']) : '';
      if (proof !== 'paid') {
        res.writeHead(402, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ payreq: 'lnbc1mockinvoice', proof_header: 'x-l402-proof' }));
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
    return {
      baseUrl: `http://127.0.0.1:${addr.port}`,
      close: () => new Promise<void>((resolve, reject) => server.close((err?: any) => (err ? reject(err) : resolve())))
    };
  })();

  try {
    let payCalls = 0;
    const res = await fetchWithL402(`${baseUrl}/paid`, undefined, {
      pay: async (challenge) => {
        payCalls += 1;
        assert.equal(challenge.invoice, 'lnbc1mockinvoice');
        assert.equal(challenge.proofHeader, 'x-l402-proof');
        return { proof: 'paid' };
      }
    });

    assert.equal(payCalls, 1);
    assert.equal(res.status, 200);
  } finally {
    await close();
  }
});

test('fetchWithL402: parses wrapped JSON challenge variants (l402.invoice)', async () => {
  const { baseUrl, close } = await (async () => {
    const http = await import('node:http');
    const server = http.createServer((req: any, res: any) => {
      const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
      if (url.pathname !== '/paid') {
        res.writeHead(404, { 'content-type': 'text/plain' });
        res.end('not found');
        return;
      }

      const proof = req.headers['x-l402-proof'] ? String(req.headers['x-l402-proof']) : '';
      if (proof !== 'paid') {
        res.writeHead(402, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ l402: { invoice: 'lnbc1mockinvoice', proof_header: 'x-l402-proof' } }));
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
    return {
      baseUrl: `http://127.0.0.1:${addr.port}`,
      close: () => new Promise<void>((resolve, reject) => server.close((err?: any) => (err ? reject(err) : resolve())))
    };
  })();

  try {
    let payCalls = 0;
    const res = await fetchWithL402(`${baseUrl}/paid`, undefined, {
      pay: async (challenge) => {
        payCalls += 1;
        assert.equal(challenge.invoice, 'lnbc1mockinvoice');
        assert.equal(challenge.proofHeader, 'x-l402-proof');
        return { proof: 'paid' };
      }
    });

    assert.equal(payCalls, 1);
    assert.equal(res.status, 200);
  } finally {
    await close();
  }
});

test('fetchWithL402: parses JSON error wrapper variants (error.invoice)', async () => {
  const { baseUrl, close } = await (async () => {
    const http = await import('node:http');
    const server = http.createServer((req: any, res: any) => {
      const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
      if (url.pathname !== '/paid') {
        res.writeHead(404, { 'content-type': 'text/plain' });
        res.end('not found');
        return;
      }

      const proof = req.headers['x-l402-proof'] ? String(req.headers['x-l402-proof']) : '';
      if (proof !== 'paid') {
        res.writeHead(402, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: { invoice: 'lnbc1mockinvoice', proofHeader: 'x-l402-proof' } }));
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
    return {
      baseUrl: `http://127.0.0.1:${addr.port}`,
      close: () => new Promise<void>((resolve, reject) => server.close((err?: any) => (err ? reject(err) : resolve())))
    };
  })();

  try {
    let payCalls = 0;
    const res = await fetchWithL402(`${baseUrl}/paid`, undefined, {
      pay: async (challenge) => {
        payCalls += 1;
        assert.equal(challenge.invoice, 'lnbc1mockinvoice');
        assert.equal(challenge.proofHeader, 'x-l402-proof');
        return { proof: 'paid' };
      }
    });

    assert.equal(payCalls, 1);
    assert.equal(res.status, 200);
  } finally {
    await close();
  }
});

test('fetchWithL402: returns 402 if challenge cannot be parsed', async () => {
  // A server that returns plain text 402.
  const { baseUrl, close } = await (async () => {
    const http = await import('node:http');
    const server = http.createServer((req: any, res: any) => {
      res.writeHead(402, { 'content-type': 'text/plain' });
      res.end('pay me');
    });
    await new Promise<void>((resolve, reject) => {
      server.listen(0, '127.0.0.1', () => resolve());
      server.on('error', reject);
    });
    const addr = server.address();
    if (!addr || typeof addr === 'string') throw new Error('failed to bind');
    return {
      baseUrl: `http://127.0.0.1:${addr.port}`,
      close: () => new Promise<void>((resolve, reject) => server.close((err?: any) => (err ? reject(err) : resolve())))
    };
  })();

  try {
    const res = await fetchWithL402(`${baseUrl}/anything`, undefined, {
      pay: async () => ({ proof: 'paid' })
    });
    assert.equal(res.status, 402);
  } finally {
    await close();
  }
});
