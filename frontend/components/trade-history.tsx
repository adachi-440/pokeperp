"use client"

import { Card } from '@/components/ui/card'
import { useOrderBook } from '@/lib/hooks/useOrderBook'
import { formatPrice, formatQty } from '@/lib/contracts/types'
import { TrendingUp, TrendingDown } from 'lucide-react'

export function TradeHistory() {
  const { state } = useOrderBook()

  // Calculate 24h volume
  const volume24h = state.recentTrades.reduce(
    (sum, trade) => sum + trade.qty,
    0n
  )

  const lastPrice = state.recentTrades[0]?.price

  return (
    <Card>
      <div className="p-4">
        <h3 className="font-semibold mb-4">約定履歴</h3>

        {/* Market Stats */}
        <div className="grid grid-cols-2 gap-4 mb-4 p-3 bg-muted rounded-lg">
          <div>
            <span className="text-xs text-muted-foreground">最終価格</span>
            <div className="font-mono font-semibold">
              {lastPrice ? formatPrice(lastPrice) : '-'}
            </div>
          </div>
          <div>
            <span className="text-xs text-muted-foreground">24時間出来高</span>
            <div className="font-mono font-semibold">
              {formatQty(volume24h)}
            </div>
          </div>
        </div>

        {/* Trade List Header */}
        <div className="grid grid-cols-4 gap-2 text-xs text-muted-foreground mb-2">
          <span>時刻</span>
          <span>サイド</span>
          <span className="text-right">価格</span>
          <span className="text-right">数量</span>
        </div>

        {/* Trade List */}
        <div className="space-y-1 max-h-96 overflow-auto">
          {state.recentTrades.length === 0 ? (
            <div className="text-center text-muted-foreground py-8 text-sm">
              まだ約定がありません
            </div>
          ) : (
            state.recentTrades.map((trade, idx) => {
              const time = new Date(Number(trade.timestamp) * 1000)
              const isBuy = true // In CLOB, we show from taker perspective

              return (
                <div
                  key={`${trade.buyOrderId}-${trade.sellOrderId}-${idx}`}
                  className="grid grid-cols-4 gap-2 text-sm py-1 hover:bg-muted/50"
                >
                  <span className="text-muted-foreground">
                    {time.toLocaleTimeString('ja-JP', {
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                    })}
                  </span>
                  <span className={isBuy ? 'text-green-500' : 'text-red-500'}>
                    {isBuy ? (
                      <TrendingUp className="w-3 h-3 inline mr-1" />
                    ) : (
                      <TrendingDown className="w-3 h-3 inline mr-1" />
                    )}
                    {isBuy ? '買い' : '売り'}
                  </span>
                  <span className="text-right font-mono">
                    {formatPrice(trade.price)}
                  </span>
                  <span className="text-right font-mono">
                    {formatQty(trade.qty)}
                  </span>
                </div>
              )
            })
          )}
        </div>
      </div>
    </Card>
  )
}