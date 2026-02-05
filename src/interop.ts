import assert from 'node:assert/strict';

import { fetchWithL402 } from './index.js';
import { startMockL402Server } from './mock_server.js';

/**
 * Minimal runnable harness that exercises several common L402 challenge variants.
 *
 * Usage:
 *   npm run interop
 */
export async function runInteropHarness() {
  const results: Array<{ name: string; status: number; body: any }> = [];

  const run = async (name: string, fn: () => Promise<Response>) => {
    const res = await fn();
    const body = await res.json().catch(() => null);
    results.push({ name, status: res.status, body });
  };

  // JSON variants.
  for (const v of ['flat', 'l402', 'data', 'error.l402', 'details'] as const) {
    const srv = await startMockL402Server({ challengeJsonVariant: v, invoiceKey: 'payment_request', includeProofHeaderHint: true });
    try {
      await run(`json:${v}`, () =>
        fetchWithL402(`${srv.baseUrl}/paid`, undefined, {
          pay: async (challenge) => {
            assert.ok(challenge.invoice);
            // Our mock includes a proofHeader hint; client should respect it.
            assert.ok(challenge.proofHeader);
            return { proof: 'paid' };
          }
        })
      );
    } finally {
      await srv.close();
    }
  }

  // WWW-Authenticate challenge (L402/LSAT style).
  {
    const srv = await startMockL402Server({
      challengeInHeader: true,
      proofHeader: 'authorization',
      includeProofHeaderHint: true,
      invoiceKey: 'payreq'
    });
    try {
      await run('www-authenticate:l402', () =>
        fetchWithL402(`${srv.baseUrl}/paid`, undefined, {
          pay: async (challenge) => {
            assert.ok(challenge.invoice);
            assert.equal(challenge.proofHeader, 'authorization');
            return { proof: 'paid' };
          }
        })
      );
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
