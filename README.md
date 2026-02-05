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
- Interop notes: differences between implementations

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
