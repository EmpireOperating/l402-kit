import test from 'node:test';
import assert from 'node:assert/strict';

import { fetchWithL402 } from '../src/index.js';
import { startMockL402Server } from '../src/mock_server.js';

test('fetchWithL402: pays on 402 then retries with proof header', async () => {
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
