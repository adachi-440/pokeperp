"use client"

import { useState, useEffect, useRef } from 'react'

export interface PriceDataPoint {
  timestamp: number
  time: string
  price: number
  volume: number
}

export interface CandlestickData {
  time: string
  open: number
  high: number
  low: number
  close: number
  volume: number
}

interface UsePriceHistoryProps {
  bestBidPrice: bigint | null
  bestAskPrice: bigint | null
  updateInterval?: number
  maxDataPoints?: number
}

export function usePriceHistory({
  bestBidPrice,
  bestAskPrice,
  updateInterval = 5000, // 5秒間隔
  maxDataPoints = 100,
}: UsePriceHistoryProps) {
  const [priceData, setPriceData] = useState<PriceDataPoint[]>([])
  const [candlestickData, setCandlestickData] = useState<CandlestickData[]>([])
  const [liveCandle, setLiveCandle] = useState<CandlestickData | null>(null)
  const intervalRef = useRef<NodeJS.Timeout>()
  const candleIntervalRef = useRef<NodeJS.Timeout>()
  const priceDataRef = useRef<PriceDataPoint[]>([])
  const lastCandlePeriodRef = useRef<number | null>(null)

  // 中値を計算
  const getMidPrice = (): number | null => {
    // 両方の値が存在しない場合はnull
    if (!bestBidPrice && !bestAskPrice) {
      return null
    }

    // 両方の値が0の場合はnull
    if (bestBidPrice === BigInt(0) && bestAskPrice === BigInt(0)) {
      return null
    }

    // bestBidPriceがマイナスまたは0の場合、bestAskPriceを使用
    if (!bestBidPrice || bestBidPrice <= BigInt(0)) {
      if (bestAskPrice && bestAskPrice > BigInt(0)) {
        return Number(bestAskPrice) / 1e6
      }
      return null
    }

    // bestAskPriceがマイナスまたは0の場合、bestBidPriceを使用
    if (!bestAskPrice || bestAskPrice <= BigInt(0)) {
      if (bestBidPrice && bestBidPrice > BigInt(0)) {
        return Number(bestBidPrice) / 1e6
      }
      return null
    }

    // 両方が正の値の場合は中値を計算
    return Number((bestBidPrice + bestAskPrice) / BigInt(2)) / 1e6
  }

  // 価格データを追加
  const addPriceData = () => {
    const midPrice = getMidPrice()
    if (midPrice === null) return

    const now = Date.now()
    const timeString = new Date(now).toLocaleTimeString('ja-JP', {
      hour: '2-digit',
      minute: '2-digit',
    })

    const newDataPoint: PriceDataPoint = {
      timestamp: now,
      time: timeString,
      price: midPrice,
      volume: 0, // 現在はボリュームデータなし
    }

    // 価格データをコンソールに出力
    const bidValue = bestBidPrice ? Number(bestBidPrice) / 1e6 : null
    const askValue = bestAskPrice ? Number(bestAskPrice) / 1e6 : null

    let priceSource = ''
    if (bidValue && askValue && bidValue > 0 && askValue > 0) {
      priceSource = '中値(Bid+Ask)/2'
    } else if (bidValue && bidValue > 0) {
      priceSource = 'Bid価格のみ'
    } else if (askValue && askValue > 0) {
      priceSource = 'Ask価格のみ'
    } else {
      priceSource = '価格データなし'
    }

    console.log('新しい価格データ:', {
      時刻: timeString,
      価格: midPrice.toFixed(4),
      ソース: priceSource,
      Bid価格: bidValue ? bidValue.toFixed(4) : 'null',
      Ask価格: askValue ? askValue.toFixed(4) : 'null',
      タイムスタンプ: now
    })

    setPriceData(prev => {
      const newData = [...prev, newDataPoint]
      const sliced = newData.slice(-maxDataPoints)
      priceDataRef.current = sliced
      return sliced // 最大データポイント数を維持
    })

    // Update live candle (current 15s bucket) on every tick
    const bucketStart = Math.floor(now / 15000) * 15000
    const recent = priceDataRef.current.filter(d => d.timestamp >= bucketStart)
    if (recent.length > 0) {
      const prices = recent.map(d => d.price)
      const open = recent[0].price
      const close = recent[recent.length - 1].price
      const high = Math.max(...prices)
      const low = Math.min(...prices)
      const volume = recent.reduce((sum, d) => sum + d.volume, 0)
      setLiveCandle({
        time: new Date(bucketStart).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        open,
        high,
        low,
        close,
        volume,
      })
    }
  }

  // ローソク足データを15秒バケットで確定生成
  const generateCandlestickData = () => {
    const data = priceDataRef.current
    if (data.length === 0) return

    const now = Date.now()
    const periodStart = Math.floor((now - 15000) / 15000) * 15000 // 直近に確定した15秒バケット
    if (lastCandlePeriodRef.current === periodStart) return

    const windowStart = periodStart
    const windowEnd = periodStart + 15000
    const windowData = data.filter(d => d.timestamp >= windowStart && d.timestamp < windowEnd)
    if (windowData.length === 0) {
      lastCandlePeriodRef.current = periodStart
      return
    }

    const prices = windowData.map(d => d.price)
    const open = windowData[0].price
    const close = windowData[windowData.length - 1].price
    const high = Math.max(...prices)
    const low = Math.min(...prices)
    const volume = windowData.reduce((sum, d) => sum + d.volume, 0)

    const timeString = new Date(periodStart).toLocaleTimeString('ja-JP', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })

    const newCandle: CandlestickData = {
      time: timeString,
      open,
      high,
      low,
      close,
      volume,
    }

    console.log('新しいローソク足データ(確定):', {
      期間開始: new Date(periodStart).toISOString(),
      始値: open.toFixed(4),
      高値: high.toFixed(4),
      安値: low.toFixed(4),
      終値: close.toFixed(4),
      出来高: volume,
      サンプル数: windowData.length
    })

    setCandlestickData(prev => {
      const newData = [...prev, newCandle]
      const sliced = newData.slice(-40)
      return sliced
    })
    lastCandlePeriodRef.current = periodStart
  }

  useEffect(() => {
    // 初回データ追加
    addPriceData()

    // 定期的な価格データ更新
    intervalRef.current = setInterval(addPriceData, updateInterval)

    // 15秒間隔でローソク足データ生成
    candleIntervalRef.current = setInterval(generateCandlestickData, 15 * 1000)

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
      if (candleIntervalRef.current) clearInterval(candleIntervalRef.current)
    }
  }, [bestBidPrice, bestAskPrice, updateInterval])

  // keep ref in sync when external updates happen (e.g., best prices change rapidly)
  useEffect(() => {
    priceDataRef.current = priceData
  }, [priceData])

  return {
    priceData,
    candlestickData,
    candlestickDataLive: liveCandle
      ? [...candlestickData, liveCandle]
      : candlestickData,
    currentMidPrice: getMidPrice(),
  }
}
