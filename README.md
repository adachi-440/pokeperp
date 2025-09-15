# PokePerp: Modular On-Chain Perpetuals with a Native Oracle

PokePerp is a decentralized perpetuals protocol designed around clarity, composability, and risk-first engineering. It combines a compact, auditable set of smart contracts with a lightweight off-chain reporter and a simple web UI to enable margin-based long/short exposure with deterministic on-chain settlement. The system is built with Solidity (Foundry) and a TypeScript reporter, and supports local E2E testing with Anvil as well as real deployments for demo purposes.

- Live demo: https://pokeperp-delta.vercel.app/
- Slides: https://docs.google.com/presentation/d/13GV88PAlOnoZYcgbjzyceVPo_uOk4gvg92DCcTG59gc/edit?usp=sharing
- Network: Arbitrum Sepolia (Chain ID: 421614)

## What It Does
- Enables margin trading on perpetual markets with transparent on-chain settlement.
- Uses a native Oracle to provide reliable index prices for fills and PnL.
- Applies strict pre- and post-trade risk checks before state transitions finalize.
- Keeps accounting explicit: collateral custody, PnL transfers, and position state are separated by module.

## Architecture at a Glance
- Oracle: Accepts reporter-submitted prices and exposes the current index used for settlement.
- Vault: Custodies collateral (TestUSDC in the demo), updates balances, and applies realized PnL.
- RiskEngine: Performs health checks and enforces margin requirements around each trade action.
- PerpEngine: Implements core perpetual logic, position transitions, and PnL calculations.
- OrderBook: Stores order intents and orchestrates order placement and execution entry points.
- SettlementHook: Optional hook for post-trade settlement actions and integrations.
- Reporter (off-chain): A TypeScript service that publishes price updates to the Oracle; pairs with local E2E tooling (Anvil) for deterministic tests.

This separation keeps the surface area small and the responsibilities clear, making the system easier to audit and reason about.

## User Flow
1. Connect a wallet to the demo app.
2. Obtain test collateral (TestUSDC) and deposit to the Vault as margin.
3. Place an order via the OrderBook; the PerpEngine evaluates the intent through the RiskEngine.
4. On execution, the Oracle’s price is read, PnL is computed, and balances are updated in the Vault through a deterministic settlement path.

## Deployed Contracts (Demo, Arbitrum Sepolia)
- Oracle: `0xb14963a262730c2B5d0Aaf7E5DacEBa965ead232`
- Vault: `0x12fab0393B7aC0D0bf9061391f195D47F2362726`
- RiskEngine: `0x3416c7fee2e8e543f99513a797C7D8415A05A84b`
- PerpEngine: `0x79f9104b7f76d7521b04A6AB7e9149Da38c3f44F`
- OrderBook: `0xc7afB721De8AdFf10C769B1DD8b6FB3F4f2af156`
- SettlementHook: `0xf19FCcb7d72693eac63E287BE4881e498B8c32f7`
- TestUSDC: `0x0E33bF131BB3b15178077Ef481A5A6De192903ba`

Note: These addresses reflect the current demo deployment.

## Why This Design
- Modular and explicit: Each component has a single responsibility and a narrow interface.
- Deterministic settlement: Clear ordering from order intent to state transition improves reproducibility and safety.
- Developer-friendly: Built with Solidity 0.8.29 and Foundry; TypeScript reporter; local-first E2E testing via Anvil.
- Chain readiness: Designed for practical deployments (e.g., Arbitrum) while maintaining local test parity.

## Status and Next Steps
- Current: Demo deployment, end-to-end flow, and oracle-reporter integration.
- Next: Additional markets, expanded risk parameters, liquidation keepers, further UI polish, and third-party audits.

## Security Notice
This is a hackathon-stage project and has not been audited. Use only with test collateral.
