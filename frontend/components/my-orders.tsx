"use client"

import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useOrderBook } from '@/lib/hooks/useOrderBook'
import { formatPrice, formatQty } from '@/lib/contracts/types'
import { TrendingUp, TrendingDown, X } from 'lucide-react'

export function MyOrders() {
  const { state } = useOrderBook()

  // Get my open orders with details
  const myOpenOrders = state.myOrders
    .map((orderId) => state.orders.get(orderId))
    .filter((order) => order && order.qty > 0n)

  return (
    <Card className="h-full">
      <div className="p-4 h-full flex flex-col">
        <Tabs defaultValue="open" className="h-full flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <TabsList>
              <TabsTrigger value="open">未約定注文</TabsTrigger>
              <TabsTrigger value="history">注文履歴</TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="open" className="flex-1 overflow-auto">
            {myOpenOrders.length === 0 ? (
              <div className="text-center text-muted-foreground py-8">
                未約定の注文はありません
              </div>
            ) : (
              <div className="space-y-2">
                <div className="grid grid-cols-6 gap-2 text-xs text-muted-foreground mb-2">
                  <span>サイド</span>
                  <span>価格</span>
                  <span>数量</span>
                  <span>時刻</span>
                  <span>状態</span>
                  <span></span>
                </div>

                {myOpenOrders.map((order) => {
                  if (!order) return null
                  const time = new Date(Number(order.timestamp) * 1000)

                  return (
                    <div
                      key={order.id}
                      className="grid grid-cols-6 gap-2 text-sm py-2 px-2 hover:bg-muted/50 rounded"
                    >
                      <span className={order.isBid ? 'text-green-500' : 'text-red-500'}>
                        {order.isBid ? (
                          <TrendingUp className="w-3 h-3 inline mr-1" />
                        ) : (
                          <TrendingDown className="w-3 h-3 inline mr-1" />
                        )}
                        {order.isBid ? '買い' : '売り'}
                      </span>
                      <span className="font-mono">{formatPrice(order.price)}</span>
                      <span className="font-mono">{formatQty(order.qty)}</span>
                      <span className="text-muted-foreground">
                        {time.toLocaleTimeString('ja-JP', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                      <span className="text-xs">
                        <span className="px-2 py-1 rounded bg-blue-500/20 text-blue-500">
                          有効
                        </span>
                      </span>
                      <div className="flex justify-end">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 w-6 p-0"
                          disabled
                          title="キャンセル機能は未実装です"
                        >
                          <X className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {myOpenOrders.length > 0 && (
              <div className="mt-4 pt-4 border-t text-xs text-muted-foreground">
                ※ ミニMVPではキャンセル機能は未実装です
              </div>
            )}
          </TabsContent>

          <TabsContent value="history" className="flex-1 overflow-auto">
            <div className="text-center text-muted-foreground py-8">
              注文履歴の表示は今後実装予定です
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </Card>
  )
}