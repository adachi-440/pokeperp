# PokePerp Project Overview

## Purpose
PokePerp is a decentralized perpetual trading system with oracle functionality. It consists of:
- Smart contracts (Solidity/Foundry)
- Oracle reporter service (Node.js/TypeScript) 
- Frontend application
- Local E2E testing setup with Anvil

## Tech Stack
- **Smart Contracts**: Solidity 0.8.29, Foundry, OpenZeppelin Contracts
- **Reporter**: Node.js, TypeScript, Vitest for testing
- **Frontend**: Not yet explored in detail
- **Development**: Foundry, Anvil for local testing, Bun for package management
- **Formatting**: Prettier, Solhint for Solidity linting
- **Deployment**: Arbitrum One and Arbitrum Sepolia support

## Main Components
1. `/contract` - Smart contracts and Foundry setup
2. `/reporter` - Oracle reporter Node.js service  
3. `/frontend` - Frontend application
4. `/scripts` - Utility scripts including local E2E setup
5. `/book` - Documentation