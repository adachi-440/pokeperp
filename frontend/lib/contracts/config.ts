import { Address } from 'viem'

export const CONTRACT_ADDRESSES = {
  // TODO: デプロイ後に実際のアドレスに更新
  OrderBookMVP: '0xc7afB721De8AdFf10C769B1DD8b6FB3F4f2af156' as Address,
  OracleAdapter: '0xb14963a262730c2B5d0Aaf7E5DacEBa965ead232' as Address,
  SettlementHook: '0xf19FCcb7d72693eac63E287BE4881e498B8c32f7' as Address,
  Vault: '0x12fab0393B7aC0D0bf9061391f195D47F2362726' as Address,
  TestUSDC: '0x0E33bF131BB3b15178077Ef481A5A6De192903ba' as Address,
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