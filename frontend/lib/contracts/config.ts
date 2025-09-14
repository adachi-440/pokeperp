import { Address } from 'viem'

export const CONTRACT_ADDRESSES = {
  // TODO: デプロイ後に実際のアドレスに更新
  OrderBookMVP: '0xB8406224cbBC7F8fbA3e0cDB254c925BC865c75D' as Address,
  OracleAdapter: '0x55ecF4D0Cb7Adaf7494AA6da82279B51F8d21E9e' as Address,
  SettlementHook: '0xc88277E7655e52Df55B823EDeD60B70368F09847' as Address,
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