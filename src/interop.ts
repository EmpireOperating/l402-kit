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
    return { status: res.status, body };
  } finally {
    await srv.close();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runInteropHarness()
    .then(({ status, body }) => {
      // eslint-disable-next-line no-console
      console.log(JSON.stringify({ ok: status === 200, status, body }, null, 2));
      process.exit(status === 200 ? 0 : 1);
    })
    .catch((err) => {
      // eslint-disable-next-line no-console
      console.error(err);
      process.exit(1);
    });
}
