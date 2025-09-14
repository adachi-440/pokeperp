"use client"

import { useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useOrderBook } from '@/lib/hooks/useOrderBook'
import { formatPrice, formatQty } from '@/lib/contracts/types'
import { NULL_PRICE } from '@/lib/contracts/config'

type PriceLevel = {
  price: bigint
  totalQty: bigint
  myQty: bigint
  orderCount: number
}

export function OrderBookDisplay() {
  const { state } = useOrderBook()
  const [viewMode, setViewMode] = useState<'all' | 'bids' | 'asks'>('all')
  const [depthLevels, setDepthLevels] = useState(20)

  // Process bid levels
  const bidLevels: PriceLevel[] = []
  state.bidLevels.forEach((level, price) => {
    if (level.totalQty > 0n) {
      let myQty = 0n
      let orderCount = 0

      // Count orders and my quantity at this level
      state.orders.forEach((order) => {
        if (order.isBid && order.price === price) {
          orderCount++
          if (state.myOrders.includes(order.id)) {
            myQty += order.qty
          }
        }
      })

      bidLevels.push({
        price,
        totalQty: level.totalQty,
        myQty,
        orderCount,
      })
    }
  })

  // Process ask levels
  const askLevels: PriceLevel[] = []
  state.askLevels.forEach((level, price) => {
    if (level.totalQty > 0n) {
      let myQty = 0n
      let orderCount = 0

      // Count orders and my quantity at this level
      state.orders.forEach((order) => {
        if (!order.isBid && order.price === price) {
          orderCount++
          if (state.myOrders.includes(order.id)) {
            myQty += order.qty
          }
        }
      })

      askLevels.push({
        price,
        totalQty: level.totalQty,
        myQty,
        orderCount,
      })
    }
  })

  // Sort levels
  bidLevels.sort((a, b) => (b.price > a.price ? 1 : -1))
  askLevels.sort((a, b) => (a.price > b.price ? 1 : -1))

  // Calculate spread
  const spread = (() => {
    const bid = state.bestBidPrice
    const ask = state.bestAskPrice
    if (bid === null || ask === null) return null
    // If either side is negative, treat spread as 0
    if (bid < 0n || ask < 0n) return 0n
    const diff = ask - bid
    return diff >= 0n ? diff : 0n
  })()

  // Display-safe best prices (clamp negatives to 0)
  const displayBestBid = (() => {
    const bid = state.bestBidPrice
    if (bid === null) return null
    return bid < 0n ? 0n : bid
  })()

  const displayBestAsk = (() => {
    const ask = state.bestAskPrice
    if (ask === null) return null
    return ask < 0n ? 0n : ask
  })()

  const midPrice = (() => {
    const bid = state.bestBidPrice
    const ask = state.bestAskPrice
    if (bid === null || ask === null) return null
    // If bid is negative, use ask; if ask is negative, use bid
    const bidNeg = bid < 0n
    const askNeg = ask < 0n
    if (bidNeg && !askNeg) return ask
    if (askNeg && !bidNeg) return bid
    if (!bidNeg && !askNeg) return (bid + ask) / 2n
    // both negative: undefined mid, return null
    return null
  })()

  // Limit displayed levels
  const displayedBids = bidLevels.slice(0, depthLevels)
  const displayedAsks = askLevels.slice(0, depthLevels)

  return (
    <Card className="h-full">
      <div className="p-4 h-full flex flex-col">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold">板情報</h3>
          <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as any)}>
            <TabsList className="h-8">
              <TabsTrigger value="all" className="text-xs">全て</TabsTrigger>
              <TabsTrigger value="bids" className="text-xs">買い</TabsTrigger>
              <TabsTrigger value="asks" className="text-xs">売り</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {/* Market Info */}
        <div className="grid grid-cols-2 gap-2 mb-4 text-sm">
          <div>
            <span className="text-muted-foreground">スプレッド:</span>
            <span className="ml-2 font-mono">
              {spread !== null ? formatPrice(spread) : '-'}
            </span>
          </div>
          <div>
            <span className="text-muted-foreground">中値:</span>
            <span className="ml-2 font-mono">
              {midPrice !== null ? formatPrice(midPrice) : '-'}
            </span>
          </div>
        </div>

        {/* Order Book Header */}
        <div className="grid grid-cols-4 gap-2 text-xs text-muted-foreground mb-2 px-2">
          <span>価格</span>
          <span className="text-right">数量</span>
          <span className="text-right">合計</span>
          <span className="text-right">自分</span>
        </div>

        {/* Order Book Content */}
        <div className="flex-1 overflow-auto">
          {/* Asks (売り注文) */}
          {(viewMode === 'all' || viewMode === 'asks') && (
            <div className="space-y-1">
              {displayedAsks.reverse().map((level, idx) => {
                const cumQty = displayedAsks
                  .slice(0, displayedAsks.length - idx)
                  .reduce((sum, l) => sum + l.totalQty, 0n)

                return (
                  <div
                    key={`ask-${level.price}`}
                    className="grid grid-cols-4 gap-2 text-sm px-2 py-1 hover:bg-muted/50 relative"
                  >
                    <div
                      className="absolute inset-0 bg-red-500/10"
                      style={{
                        width: `${Math.min(100, Number(level.totalQty) / 1e18 * 10)}%`,
                      }}
                    />
                    <span className="relative text-red-500 font-mono">
                      {formatPrice(level.price)}
                    </span>
                    <span className="relative text-right font-mono">
                      {formatQty(level.totalQty)}
                    </span>
                    <span className="relative text-right font-mono text-muted-foreground">
                      {formatQty(cumQty)}
                    </span>
                    <span className="relative text-right font-mono text-yellow-500">
                      {level.myQty > 0n ? formatQty(level.myQty) : '-'}
                    </span>
                  </div>
                )
              })}
            </div>
          )}

          {/* Spread Indicator */}
          {viewMode === 'all' && (
            <div className="border-y border-border my-2 py-2 text-center">
              <div className="text-sm font-semibold">
                {displayBestBid !== null ? formatPrice(displayBestBid) : '-'}
                {' / '}
                {displayBestAsk !== null ? formatPrice(displayBestAsk) : '-'}
              </div>
              <div className="text-xs text-muted-foreground">
                スプレッド: {spread !== null ? formatPrice(spread) : '-'}
              </div>
            </div>
          )}

          {/* Bids (買い注文) */}
          {(viewMode === 'all' || viewMode === 'bids') && (
            <div className="space-y-1">
              {displayedBids.map((level, idx) => {
                const cumQty = displayedBids
                  .slice(0, idx + 1)
                  .reduce((sum, l) => sum + l.totalQty, 0n)

                return (
                  <div
                    key={`bid-${level.price}`}
                    className="grid grid-cols-4 gap-2 text-sm px-2 py-1 hover:bg-muted/50 relative"
                  >
                    <div
                      className="absolute inset-0 bg-green-500/10"
                      style={{
                        width: `${Math.min(100, Number(level.totalQty) / 1e18 * 10)}%`,
                      }}
                    />
                    <span className="relative text-green-500 font-mono">
                      {formatPrice(level.price)}
                    </span>
                    <span className="relative text-right font-mono">
                      {formatQty(level.totalQty)}
                    </span>
                    <span className="relative text-right font-mono text-muted-foreground">
                      {formatQty(cumQty)}
                    </span>
                    <span className="relative text-right font-mono text-yellow-500">
                      {level.myQty > 0n ? formatQty(level.myQty) : '-'}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Depth Controls */}
        <div className="flex items-center justify-between mt-4 pt-4 border-t">
          <span className="text-sm text-muted-foreground">深さ: {depthLevels}</span>
          <div className="flex gap-1">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setDepthLevels(10)}
              className={depthLevels === 10 ? 'bg-muted' : ''}
            >
              10
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setDepthLevels(20)}
              className={depthLevels === 20 ? 'bg-muted' : ''}
            >
              20
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setDepthLevels(50)}
              className={depthLevels === 50 ? 'bg-muted' : ''}
            >
              50
            </Button>
          </div>
        </div>
      </div>
    </Card>
  )
}
