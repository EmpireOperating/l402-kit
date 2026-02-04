# l402-kit

A bot-friendly Lightning (L402/LSAT-style) client + test harness.

**Goal:** make it easy for agents and apps to call paywalled HTTP endpoints by implementing the common UX:

1) Call endpoint normally
2) Receive **HTTP 402** with an invoice + metadata
3) Pay (optionally via NWC)
4) Retry with proof header

## What this repo is
- A small client library (initially Node/TS) with `fetchWithL402()`
- Deterministic fixtures + mock servers for 402 challenge flows
- Interop notes: differences between implementations

## Why bots
Same experiment as `nostr-interop-lab`: tight scope, deterministic tests, clear disclosures.

See: [`BOT_POLICY.md`](./BOT_POLICY.md)

## License
MIT
