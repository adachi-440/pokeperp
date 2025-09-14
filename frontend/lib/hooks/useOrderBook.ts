"use client"

import { useState, useEffect, useCallback } from 'react'
import {
  usePublicClient,
  useWalletClient,
  useAccount,
  useWatchContractEvent,
} from 'wagmi'
import { Address } from 'viem'
import { OrderBookMVPAbi } from '@/lib/contracts/abis/OrderBookMVP'
import { CONTRACT_ADDRESSES, NULL_PRICE } from '@/lib/contracts/config'
import type {
  Order,
  Level,
  MarketCfg,
  TradeMatchedEvent,
} from '@/lib/contracts/types'

export type OrderBookState = {
  bestBidPrice: bigint | null
  bestAskPrice: bigint | null
  bidLevels: Map<bigint, Level>
  askLevels: Map<bigint, Level>
  orders: Map<`0x${string}`, Order>
  myOrders: `0x${string}`[]
  recentTrades: TradeMatchedEvent[]
  marketCfg: MarketCfg | null
  isLoading: boolean
  error: string | null
}

export function useOrderBook() {
  const publicClient = usePublicClient()
  const { data: walletClient } = useWalletClient()
  const { address } = useAccount()

  const [state, setState] = useState<OrderBookState>({
    bestBidPrice: null,
    bestAskPrice: null,
    bidLevels: new Map(),
    askLevels: new Map(),
    orders: new Map(),
    myOrders: [],
    recentTrades: [],
    marketCfg: null,
    isLoading: true,
    error: null,
  })

  // 追加: Top of Book周辺の価格レベルを取得して、デプス表示用の集計を更新
  const fetchLevelsAroundTop = useCallback(
    async (depth: number = 20) => {
      if (!publicClient) return

      try {
        // bestBid/bestAsk を取得（NULLはnullに変換）
        const [bidPriceRaw, askPriceRaw] = (await Promise.all([
          publicClient.readContract({
            address: CONTRACT_ADDRESSES.OrderBookMVP,
            abi: OrderBookMVPAbi,
            functionName: 'bestBidPrice',
          }),
          publicClient.readContract({
            address: CONTRACT_ADDRESSES.OrderBookMVP,
            abi: OrderBookMVPAbi,
            functionName: 'bestAskPrice',
          }),
        ])) as [number, number]

        const bestBid = bidPriceRaw === NULL_PRICE ? null : bidPriceRaw
        const bestAsk = askPriceRaw === NULL_PRICE ? null : askPriceRaw

        const contracts: any[] = []
        const bidPrices: number[] = []
        const askPrices: number[] = []

        if (bestBid !== null) {
          for (let i = 0; i < depth; i++) {
            const p = bestBid - i
            bidPrices.push(p)
            contracts.push({
              address: CONTRACT_ADDRESSES.OrderBookMVP,
              abi: OrderBookMVPAbi,
              functionName: 'levelOf',
              args: [true, p],
            })
          }
        }

        if (bestAsk !== null) {
          for (let i = 0; i < depth; i++) {
            const p = bestAsk + i
            askPrices.push(p)
            contracts.push({
              address: CONTRACT_ADDRESSES.OrderBookMVP,
              abi: OrderBookMVPAbi,
              functionName: 'levelOf',
              args: [false, p],
            })
          }
        }

        if (contracts.length === 0) {
          setState((prev) => ({ ...prev, bidLevels: new Map(), askLevels: new Map() }))
          return
        }

        const mc = (await publicClient.multicall({ contracts })) as any
        const results: any[] = mc.results ?? mc // viemのバージョン差異に対応

        const newBidLevels = new Map<bigint, Level>()
        const newAskLevels = new Map<bigint, Level>()

        let idx = 0
        // bids
        for (let i = 0; i < bidPrices.length; i++, idx++) {
          const r = results[idx]
          if (!r) continue
          const status = r.status ?? 'success'
          if (status !== 'success') continue
          const res = r.result ?? r
          const [totalQty, headId, tailId] = res as readonly [bigint, `0x${string}`, `0x${string}`]
          if (totalQty > 0n) {
            newBidLevels.set(BigInt(bidPrices[i]), { totalQty, headId, tailId })
          }
        }

        // asks
        for (let i = 0; i < askPrices.length; i++, idx++) {
          const r = results[idx]
          if (!r) continue
          const status = r.status ?? 'success'
          if (status !== 'success') continue
          const res = r.result ?? r
          const [totalQty, headId, tailId] = res as readonly [bigint, `0x${string}`, `0x${string}`]
          if (totalQty > 0n) {
            newAskLevels.set(BigInt(askPrices[i]), { totalQty, headId, tailId })
          }
        }

        setState((prev) => ({ ...prev, bidLevels: newBidLevels, askLevels: newAskLevels }))
      } catch (error) {
        console.error('Failed to fetch levels:', error)
      }
    },
    [publicClient]
  )

  // Fetch levels around a price point
  const fetchLevelsAroundPrice = useCallback(async (centerPrice: bigint) => {
    if (!publicClient) return

    try {
      const priceRange = 20 // Fetch ±20 price levels
      const bidLevels = new Map<bigint, Level>()
      const askLevels = new Map<bigint, Level>()

      // Fetch bid levels
      for (let i = 0; i <= priceRange; i++) {
        const price = centerPrice - BigInt(i)
        if (price >= -8388607) { // Check int24 bounds
          const level = await publicClient.readContract({
            address: CONTRACT_ADDRESSES.OrderBookMVP,
            abi: OrderBookMVPAbi,
            functionName: 'levelOf',
            args: [true, Number(price)],
          }) as { totalQty: bigint; headId: `0x${string}`; tailId: `0x${string}` }

          if (level.totalQty > 0n) {
            bidLevels.set(price, {
              totalQty: level.totalQty,
              headId: level.headId,
              tailId: level.tailId,
            })
          }
        }
      }

      // Fetch ask levels
      for (let i = 0; i <= priceRange; i++) {
        const price = centerPrice + BigInt(i)
        if (price <= 8388607) { // Check int24 bounds
          const level = await publicClient.readContract({
            address: CONTRACT_ADDRESSES.OrderBookMVP,
            abi: OrderBookMVPAbi,
            functionName: 'levelOf',
            args: [false, Number(price)],
          }) as { totalQty: bigint; headId: `0x${string}`; tailId: `0x${string}` }

          if (level.totalQty > 0n) {
            askLevels.set(price, {
              totalQty: level.totalQty,
              headId: level.headId,
              tailId: level.tailId,
            })
          }
        }
      }

      setState((prev) => ({
        ...prev,
        bidLevels,
        askLevels,
      }))
    } catch (error) {
      console.error('Failed to fetch levels:', error)
    }
  }, [publicClient])

  // Fetch market configuration
  const fetchMarketConfig = useCallback(async () => {
    if (!publicClient) return

    try {
      const cfg = await publicClient.readContract({
        address: CONTRACT_ADDRESSES.OrderBookMVP,
        abi: OrderBookMVPAbi,
        functionName: 'marketCfg',
      }) as readonly [bigint, bigint, bigint, Address, Address, boolean]

      setState((prev) => ({
        ...prev,
        marketCfg: {
          minQty: cfg[0],
          minNotional: cfg[1],
          deviationLimit: cfg[2],
          oracleAdapter: cfg[3],
          settlementHook: cfg[4],
          paused: cfg[5],
        },
      }))
    } catch (error) {
      console.error('Failed to fetch market config:', error)
      setState((prev) => ({
        ...prev,
        error: 'Failed to fetch market configuration',
      }))
    }
  }, [publicClient])

  // Fetch best prices and levels around them
  const fetchBestPrices = useCallback(async () => {
    if (!publicClient) return

    try {
      const [bidPrice, askPrice] = await Promise.all([
        publicClient.readContract({
          address: CONTRACT_ADDRESSES.OrderBookMVP,
          abi: OrderBookMVPAbi,
          functionName: 'bestBidPrice',
        }),
        publicClient.readContract({
          address: CONTRACT_ADDRESSES.OrderBookMVP,
          abi: OrderBookMVPAbi,
          functionName: 'bestAskPrice',
        }),
      ]) as [number, number]

      setState((prev) => ({
        ...prev,
        bestBidPrice: bidPrice === NULL_PRICE ? null : BigInt(bidPrice),
        bestAskPrice: askPrice === NULL_PRICE ? null : BigInt(askPrice),
        isLoading: false,
      }))

      // Fetch levels around best prices
      if (bidPrice !== NULL_PRICE || askPrice !== NULL_PRICE) {
        await fetchLevelsAroundPrice(
          bidPrice !== NULL_PRICE ? BigInt(bidPrice) :
          askPrice !== NULL_PRICE ? BigInt(askPrice) : 0n
        )
      }
    } catch (error) {
      console.error('Failed to fetch best prices:', error)
      setState((prev) => ({
        ...prev,
        error: 'Failed to fetch best prices',
        isLoading: false,
      }))
    }
  }, [publicClient, fetchLevelsAroundPrice])

  // Fetch user's open orders
  const fetchMyOrders = useCallback(async () => {
    if (!publicClient || !address) return

    try {
      const orderIds = await publicClient.readContract({
        address: CONTRACT_ADDRESSES.OrderBookMVP,
        abi: OrderBookMVPAbi,
        functionName: 'getOpenOrders',
        args: [address],
      }) as readonly `0x${string}`[]

      setState((prev) => ({
        ...prev,
        myOrders: [...orderIds],
      }))

      // Fetch order details
      for (const orderId of orderIds) {
        const order = await publicClient.readContract({
          address: CONTRACT_ADDRESSES.OrderBookMVP,
          abi: OrderBookMVPAbi,
          functionName: 'orderOf',
          args: [orderId],
        })

        // orderはtupleとして返される
        const orderData = order as {
          id: `0x${string}`
          trader: Address
          isBid: boolean
          price: number
          qty: bigint
          timestamp: bigint
          nextId: `0x${string}`
          prevId: `0x${string}`
        }

        setState((prev) => {
          const newOrders = new Map(prev.orders)
          newOrders.set(orderId, {
            id: orderData.id,
            trader: orderData.trader,
            isBid: orderData.isBid,
            price: BigInt(orderData.price),
            qty: orderData.qty,
            timestamp: orderData.timestamp,
            nextId: orderData.nextId,
            prevId: orderData.prevId,
          })
          return { ...prev, orders: newOrders }
        })
      }
    } catch (error) {
      console.error('Failed to fetch user orders:', error)
    }
  }, [publicClient, address])

  // Place order
  const placeOrder = useCallback(
    async (isBid: boolean, price: bigint, qty: bigint) => {
      if (!walletClient || !address || !publicClient) {
        throw new Error('Wallet not connected')
      }

      // Check if contract address is set
      if (CONTRACT_ADDRESSES.OrderBookMVP === '0x0000000000000000000000000000000000000000') {
        throw new Error('コントラクトがデプロイされていません。管理者にお問い合わせください。')
      }

      try {
        // Simulate first
        // priceはint24なのでNumberに変換（範囲: -8388608 to 8388607）
        const priceInt24 = BigInt(price)
        // if (priceInt24 < -8388608 || priceInt24 > 8388607) {
        //   throw new Error('Price out of int24 range')
        // }

        const { request } = await publicClient.simulateContract({
          address: CONTRACT_ADDRESSES.OrderBookMVP,
          abi: OrderBookMVPAbi,
          functionName: 'place',
          args: [isBid, priceInt24, qty],
          account: address,
        })

        console.log('simulation success')

        // Execute transaction
        const hash = await walletClient.writeContract(request)

        // Wait for confirmation
        const receipt = await publicClient.waitForTransactionReceipt({ hash })

        // 変更: 約定気配・レベル・自注文の再取得でUI同期
        await Promise.all([fetchBestPrices(), fetchLevelsAroundTop(20), fetchMyOrders()])

        return receipt
      } catch (error) {
        console.error('Failed to place order:', error)
        throw error
      }
    },
    [walletClient, address, publicClient, fetchBestPrices, fetchLevelsAroundTop, fetchMyOrders]
  )

  // Long position (買い注文)
  const placeLongOrder = useCallback(
    async (price: bigint, amount: bigint) => {
      if (!walletClient || !address || !publicClient) {
        throw new Error('Wallet not connected')
      }

      if (CONTRACT_ADDRESSES.OrderBookMVP === '0x0000000000000000000000000000000000000000') {
        throw new Error('コントラクトがデプロイされていません。管理者にお問い合わせください。')
      }

      try {
        // priceはint24なのでNumberに変換（範囲: -8388608 to 8388607）
        const priceInt24 = BigInt(price)

        console.log(`Placing LONG order: ${Number(amount) / 1e18} ETH at price ${priceInt24}`)

        console.log('simulating place')
        console.log(publicClient)
        const { request } = await publicClient.simulateContract({
          address: CONTRACT_ADDRESSES.OrderBookMVP,
          abi: OrderBookMVPAbi,
          functionName: 'place',
          args: [true, priceInt24, amount], // true = bid (買い注文)
          account: address,
        })
        console.log('simulation success')
    
        const hash = await walletClient.writeContract(request)
        const receipt = await publicClient.waitForTransactionReceipt({ hash })

        console.log(`LONG order placed successfully. TX: ${hash}`)

        // UIを更新
        await Promise.all([fetchBestPrices(), fetchLevelsAroundTop(20), fetchMyOrders()])

        return receipt
      } catch (error) {
        console.error('Error placing long order:', (error as Error).message)
        throw error
      }
    },
    [walletClient, address, publicClient, fetchBestPrices, fetchLevelsAroundTop, fetchMyOrders]
  )

  // Short position (売り注文)
  const placeShortOrder = useCallback(
    async (price: bigint, amount: bigint) => {
      if (!walletClient || !address || !publicClient) {
        throw new Error('Wallet not connected')
      }

      if (CONTRACT_ADDRESSES.OrderBookMVP === '0x0000000000000000000000000000000000000000') {
        throw new Error('コントラクトがデプロイされていません。管理者にお問い合わせください。')
      }

      try {
        // priceはint24なのでNumberに変換（範囲: -8388608 to 8388607）
        const priceInt24 = BigInt(price)

        console.log(`Placing SHORT order: ${Number(amount) / 1e18} ETH at price ${priceInt24}`)

        const { request } = await publicClient.simulateContract({
          address: CONTRACT_ADDRESSES.OrderBookMVP,
          abi: OrderBookMVPAbi,
          functionName: 'place',
          args: [false, priceInt24, amount], // false = ask (売り注文)
          account: address,
        })

        const hash = await walletClient.writeContract(request)
        const receipt = await publicClient.waitForTransactionReceipt({ hash })

        console.log(`SHORT order placed successfully. TX: ${hash}`)

        // UIを更新
        await Promise.all([fetchBestPrices(), fetchLevelsAroundTop(20), fetchMyOrders()])

        return receipt
      } catch (error) {
        console.error('Error placing short order:', (error as Error).message)
        throw error
      }
    },
    [walletClient, address, publicClient, fetchBestPrices, fetchLevelsAroundTop, fetchMyOrders]
  )

  // Match orders at best price
  const matchAtBest = useCallback(
    async (stepsMax: bigint = 16n) => {
      if (!walletClient || !address || !publicClient) {
        throw new Error('Wallet not connected')
      }

      // Check if contract address is set
      if (CONTRACT_ADDRESSES.OrderBookMVP === '0x0000000000000000000000000000000000000000') {
        throw new Error('コントラクトがデプロイされていません。管理者にお問い合わせください。')
      }

      try {
        // Simulate first
        const { request } = await publicClient.simulateContract({
          address: CONTRACT_ADDRESSES.OrderBookMVP,
          abi: OrderBookMVPAbi,
          functionName: 'matchAtBest',
          args: [stepsMax],
          account: address,
        })

        // Execute transaction
        const hash = await walletClient.writeContract(request)

        // Wait for confirmation
        const receipt = await publicClient.waitForTransactionReceipt({ hash })

        // 変更: マッチ後にbest/levelsを更新
        await Promise.all([fetchBestPrices(), fetchLevelsAroundTop(20)])

        return receipt
      } catch (error) {
        console.error('Failed to match orders:', error)
        throw error
      }
    },
    [walletClient, address, publicClient, fetchBestPrices, fetchLevelsAroundTop]
  )

  // Watch for OrderPlaced events
  useWatchContractEvent({
    address: CONTRACT_ADDRESSES.OrderBookMVP,
    abi: OrderBookMVPAbi,
    eventName: 'OrderPlaced',
    onLogs: (logs) => {
      for (const log of logs) {
        const { orderId, trader, isBid, price, qty, timestamp } = log.args as any

        // Update state with new order
        setState((prev) => {
          const newOrders = new Map(prev.orders)
          newOrders.set(orderId, {
            id: orderId,
            trader,
            isBid,
            price: BigInt(price),
            qty,
            timestamp,
            nextId: '0x0000000000000000000000000000000000000000000000000000000000000000',
            prevId: '0x0000000000000000000000000000000000000000000000000000000000000000',
          })

          // Update my orders if it's from current user
          const newMyOrders =
            trader === address
              ? [...prev.myOrders, orderId]
              : prev.myOrders

          return {
            ...prev,
            orders: newOrders,
            myOrders: newMyOrders,
          }
        })
      }

      // 変更: bestとレベルを更新
      fetchBestPrices()
      fetchLevelsAroundTop(20)
    },
  })

  // Watch for TradeMatched events
  useWatchContractEvent({
    address: CONTRACT_ADDRESSES.OrderBookMVP,
    abi: OrderBookMVPAbi,
    eventName: 'TradeMatched',
    onLogs: (logs) => {
      for (const log of logs) {
        const {
          buyOrderId,
          sellOrderId,
          buyer,
          seller,
          price,
          qty,
          timestamp,
        } = log.args as any

        // Add to recent trades
        setState((prev) => ({
          ...prev,
          recentTrades: [
            {
              buyOrderId,
              sellOrderId,
              buyer,
              seller,
              price: BigInt(price),
              qty,
              timestamp,
            },
            ...prev.recentTrades.slice(0, 49), // Keep last 50 trades
          ],
        }))
      }

      // 変更: best/levels と自注文の再取得
      fetchBestPrices()
      fetchLevelsAroundTop(20)
      if (address) fetchMyOrders()
    },
  })

  // Initial load
  useEffect(() => {
    // 変更: 初期ロード時にmarket/best/levelsを取得
    fetchMarketConfig()
    fetchBestPrices()
    fetchLevelsAroundTop(20)
    if (address) fetchMyOrders()
  }, [fetchMarketConfig, fetchBestPrices, fetchLevelsAroundTop, fetchMyOrders, address])

  return {
    state,
    placeOrder,
    placeLongOrder,
    placeShortOrder,
    matchAtBest,
    refreshData: async () => {
      // 変更: refreshにレベル取得も追加
      await Promise.all([
        fetchMarketConfig(),
        fetchBestPrices(),
        fetchLevelsAroundTop(20),
        address ? fetchMyOrders() : Promise.resolve(),
      ])
    },
  }
}