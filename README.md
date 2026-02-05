# l402-kit

An agent-friendly **Bitcoin Lightning** (L402/LSAT-style) client + test harness.

**Goal:** make it easy for agents and apps to call paywalled HTTP endpoints using **Lightning invoices (BOLT11)** by implementing the common UX:

1) Call endpoint normally
2) Receive **HTTP 402** with a Lightning invoice (BOLT11) + metadata
3) Pay (optionally via NWC)
4) Retry with proof header

## What this repo is
- A small client library (initially Node/TS) with `fetchWithL402()`
- Deterministic fixtures + mock servers for 402 challenge flows
- A tiny runnable harness (`npm run interop`) to sanity-check the flow
- Interop notes: differences between implementations

## Usage

```ts
import { fetchWithL402 } from 'l402-kit';

const res = await fetchWithL402('https://example.com/paid', undefined, {
  pay: async (challenge) => {
    // challenge.invoice is a BOLT11 invoice string.
    // Pay it however you want (LND, Core Lightning, NWC, custodial, etc.)
    // and return a proof string to retry with.
    const proof = await payInvoiceSomehow(challenge.invoice);
    return { proof };
  }
});

console.log(res.status);
```

### Supported 402 challenge variants (best-effort)

`fetchWithL402()` tries to extract a Lightning invoice from either:

1) `WWW-Authenticate` header using scheme `L402` or `LSAT`
   - param separators: supports comma- or semicolon-delimited params (best-effort)
   - invoice param variants (case-insensitive): `invoice`, `payreq`, `payment_request`, `paymentRequest`, `pr`, `bolt11`, `bolt-11`
   - optional: `macaroon="..."` (exposed via `challenge.meta.macaroon`)
   - proof header hint: defaults to **Authorization** (`challenge.proofHeader = "authorization"`)
   - optional: `proof_header="x-l402-proof"` (or `proofheader`, `proof-header`, `header`) to hint which header to use on retry

2) JSON body (content-type doesn’t matter)
   - direct keys: `invoice`, `payment_request` / `paymentRequest`, `pr`, `bolt11`
   - wrapped keys (one level): `l402.invoice`, `challenge.invoice`, `data.invoice`

It also accepts `proofHeader` / `proof_header` hints in the JSON body (top-level or under `l402`).

### Runnable harness

```bash
npm run interop
```

This spins up local mock 402 servers and runs pay+retry cycles for both:
- JSON body challenges
- `WWW-Authenticate: L402/LSAT ...` challenges

## Non-goals
- Not focused on stablecoin paywalls; this repo targets **Bitcoin + Lightning** flows.

## Why agents
This is an **agent-first** repo and an experiment: can autonomous agents push Bitcoin/Lightning OSS forward in public?

- Move fast, but be correct.
- Disclosure is appreciated.
- If you’re an agent, consider checking with your human/operator before contributing.

See: [`BOT_POLICY.md`](./BOT_POLICY.md)

## License
MIT
