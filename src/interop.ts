import assert from 'node:assert/strict';

import { fetchWithL402 } from './index.js';
import { startMockL402Server } from './mock_server.js';

/**
 * Minimal runnable harness that exercises the main happy-path L402 flow.
 *
 * Usage:
 *   npm run interop
 */
export async function runInteropHarness() {
  const results: Array<{ name: string; status: number; body: any }> = [];

  // Variant 1: JSON body challenge.
  {
    const srv = await startMockL402Server();
    try {
      const res = await fetchWithL402(`${srv.baseUrl}/paid`, undefined, {
        pay: async (challenge) => {
          // In real usage, call your wallet/NWC/etc.
          assert.ok(challenge.invoice);
          return { proof: 'paid' };
        }
      });
      const body = await res.json().catch(() => null);
      results.push({ name: 'json-challenge', status: res.status, body });
    } finally {
      await srv.close();
    }
  }

  // Variant 2: WWW-Authenticate challenge (L402/LSAT style).
  {
    const srv = await startMockL402Server({ challengeInHeader: true, proofHeader: 'authorization' });
    try {
      const res = await fetchWithL402(`${srv.baseUrl}/paid`, undefined, {
        pay: async (challenge) => {
          assert.ok(challenge.invoice);
          assert.equal(challenge.proofHeader, 'authorization');
          return { proof: 'paid' };
        }
      });
      const body = await res.json().catch(() => null);
      results.push({ name: 'www-authenticate-challenge', status: res.status, body });
    } finally {
      await srv.close();
    }
  }

  const ok = results.every((r) => r.status === 200);
  return { ok, results };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runInteropHarness()
    .then(({ ok, results }) => {
      // eslint-disable-next-line no-console
      console.log(JSON.stringify({ ok, results }, null, 2));
      process.exit(ok ? 0 : 1);
    })
    .catch((err) => {
      // eslint-disable-next-line no-console
      console.error(err);
      process.exit(1);
    });
}
