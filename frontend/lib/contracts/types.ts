import { Address } from 'viem'

export type MarketCfg = {
  minQty: bigint
  minNotional: bigint
  deviationLimit: bigint // bps, 10000 = 100%
  oracleAdapter: Address
  settlementHook: Address
  paused: boolean
}

export type Order = {
  id: `0x${string}` // bytes32
  trader: Address
  isBid: boolean
  price: bigint // int24 相当
  qty: bigint
  timestamp: bigint
  nextId: `0x${string}`
  prevId: `0x${string}`
}

export type Level = {
  totalQty: bigint
  headId: `0x${string}`
  tailId: `0x${string}`
}

export type OrderPlacedEvent = {
  orderId: `0x${string}`
  trader: Address
  isBid: boolean
  price: bigint
  qty: bigint
  timestamp: bigint
}

export type TradeMatchedEvent = {
  buyOrderId: `0x${string}`
  sellOrderId: `0x${string}`
  buyer: Address
  seller: Address
  price: bigint
  qty: bigint
  timestamp: bigint
}

// Helper functions
export function priceToWei(price: bigint): bigint {
  // _priceToUint の正立部分に合わせる（price>=0 を想定）
  return price * 10n ** 18n
}

export function weiToPrice(priceWei: bigint): bigint {
  return priceWei / 10n ** 18n
}

export function withinBand(
  execWei: bigint,
  indexWei: bigint,
  deviationLimitBps: bigint
): boolean {
  // |exec - index| / index <= deviationLimit(bps)/10000
  const diff = execWei > indexWei ? execWei - indexWei : indexWei - execWei
  return (diff * 10000n) / indexWei <= deviationLimitBps
}

export function formatPrice(price: bigint): string {
  const priceWei = priceToWei(price)
  const priceNumber = Number(priceWei) / 1e18
  return priceNumber.toFixed(2)
}

export function formatQty(qty: bigint): string {
  const qtyNumber = Number(qty) / 1e18
  return qtyNumber.toFixed(4)
}