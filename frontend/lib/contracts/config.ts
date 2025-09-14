import { Address } from 'viem'

export const CONTRACT_ADDRESSES = {
  // TODO: デプロイ後に実際のアドレスに更新
  OrderBookMVP: '0x0000000000000000000000000000000000000000' as Address,
  OracleAdapter: '0x0000000000000000000000000000000000000000' as Address,
  SettlementHook: '0x0000000000000000000000000000000000000000' as Address,
} as const

export const CHAIN_CONFIG = {
  // Base Sepolia for testing
  chainId: 84532,
  blockExplorer: 'https://sepolia.basescan.org',
  rpcUrl: process.env.NEXT_PUBLIC_RPC_URL || 'https://sepolia.base.org',
} as const

// Price constants
export const PRICE_SCALE = 10n ** 18n
export const NULL_PRICE = -8388608 // int24 min value (align with contract's OrderBookTypes.NULL_PRICE)