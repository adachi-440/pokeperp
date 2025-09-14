# Suggested Commands for PokePerp Development

## Smart Contract Development (in `/contract` directory)
- `forge build` - Build/compile smart contracts
- `forge test` - Run all tests
- `forge test --gas-report` - Run tests with gas usage report
- `forge coverage` - Generate test coverage report
- `forge fmt` - Format Solidity code
- `forge clean` - Clean build artifacts and cache
- `bun run lint` - Run linting (Solidity + Prettier)
- `bun run prettier:write` - Format non-Solidity files

## Reporter Development (in `/reporter` directory)
- `npm run dev` - Start reporter service
- `npm test` - Run reporter tests

## Local E2E Testing
1. Start local blockchain: `anvil -p 8545`
2. Run E2E script with environment variables:
```bash
REPORTER_PK=0x<reporter-private-key> \
OWNER_PK=0x<owner-private-key> \
RPC_URL=http://127.0.0.1:8545 \
SCALE=100 HEARTBEAT=10 \
./scripts/local_oracle_e2e.sh
```

## Deployment Commands
- `bun run deploy:arb` - Deploy to Arbitrum One (dry-run)
- `bun run deploy:arb-sepolia` - Deploy to Arbitrum Sepolia

## System Commands (Darwin/macOS)
- Standard Unix commands: `ls`, `cd`, `grep`, `find`, `git`
- Package management: `bun install`, `npm install`