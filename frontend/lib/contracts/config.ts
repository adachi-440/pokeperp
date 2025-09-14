import { Address } from 'viem'

export const CONTRACT_ADDRESSES = {
  // TODO: デプロイ後に実際のアドレスに更新
  OrderBookMVP: '0x4bd9f5fC9366171e0935F3869dcE6EB1966e7bff' as Address,
  OracleAdapter: '0xF2b89D1772664adEEBF4faA19b7C6e1cC44d82Ac' as Address,
  SettlementHook: '0xa6bbBc547E8fE5e1349d119Bf4A124f686c48aE8' as Address,
  Vault: '0x36C3B89E609028a458e658b8Ed3286e8E4A2BF7B' as Address,
  TestUSDC: '0xABCa2eA9FF89772DaA182A24C66058730587ed7F' as Address,
} as const

// export const CHAIN_CONFIG = {
//   // Base Sepolia for testing
//   chainId: 84532,
//   blockExplorer: 'https://sepolia.basescan.org',
//   rpcUrl: process.env.NEXT_PUBLIC_RPC_URL || 'https://sepolia.base.org',
// } as const

export const CHAIN_CONFIG = {
  // Local Anvil for development
  chainId: 31337,
  blockExplorer: 'http://localhost:8545',
  rpcUrl: process.env.NEXT_PUBLIC_RPC_URL || 'http://localhost:8545',
} as const

// Price constants
export const PRICE_SCALE = 10n ** 18n
export const NULL_PRICE = -8388608 // int24 min value (align with contract's OrderBookTypes.NULL_PRICE)