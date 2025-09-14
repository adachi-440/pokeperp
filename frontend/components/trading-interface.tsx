
"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Bell,
  Settings,
  BarChart3,
  BlendIcon as TrendIcon,
  Crosshair,
  PenTool,
  Type,
  Smile,
} from "lucide-react"
import Link from "next/link"
import { PriceChart } from "./price-chart"
import { AuthButton } from "./auth-button"
import { OrderPlacement } from "./order-placement"
import { OrderBookDisplay } from "./order-book-display"
import { TradeHistory } from "./trade-history"
import { MatchExecutor } from "./match-executor"
import { MyOrders } from "./my-orders"
import { useOrderBook } from "@/lib/hooks/useOrderBook"
import { formatPrice } from "@/lib/contracts/types"
import { NULL_PRICE } from "@/lib/contracts/config"

interface TradingInterfaceProps {
  selectedSymbol?: string
}

export function TradingInterface({ selectedSymbol = "PIKA-USD" }: TradingInterfaceProps) {
  const [selectedMarket] = useState(selectedSymbol)
  const [timeframe, setTimeframe] = useState("1h")
  const { state } = useOrderBook()

  // Calculate market price
  const marketPrice =
    state.bestBidPrice && state.bestAskPrice &&
    state.bestBidPrice !== BigInt(NULL_PRICE) &&
    state.bestAskPrice !== BigInt(NULL_PRICE)
      ? (state.bestBidPrice + state.bestAskPrice) / 2n
      : null

  const lastPrice = state.recentTrades[0]?.price || marketPrice

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="border-b border-border bg-card">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-6">
            <Link href="/" className="text-xl font-bold text-primary">
              ⚡ PokéCard Perp
            </Link>
            <nav className="flex items-center gap-6">
              <Link href="/" className="text-foreground font-medium">
                Trade
              </Link>
              <Link href="/markets" className="text-muted-foreground hover:text-foreground">
                Markets
              </Link>
              <Link href="/portfolio" className="text-muted-foreground hover:text-foreground">
                Portfolio
              </Link>
              <Link href="/account" className="text-muted-foreground hover:text-foreground">
                Account
              </Link>
            </nav>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">{selectedMarket}</span>
              <span className="text-lg font-mono">
                {lastPrice ? `$${formatPrice(lastPrice)}` : '-'}
              </span>
              <Badge variant="secondary" className="text-[#FED823]">
                +3.2%
              </Badge>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <Badge variant="outline">Ethereum</Badge>
            <div className="text-sm">
              <span className="text-muted-foreground">Balance: </span>
              <span className="font-mono">$12,340.00</span>
            </div>
            <AuthButton />
            <Button variant="ghost" size="sm">
              <Bell className="w-4 h-4" />
            </Button>
            <Link href="/settings">
              <Button variant="ghost" size="sm">
                <Settings className="w-4 h-4" />
              </Button>
            </Link>
          </div>
        </div>

        {/* Market Info Header Bar */}
        <div className="border-t border-border px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 bg-[#FED823] rounded-full flex items-center justify-center">
                  <span className="text-xs font-bold text-black">⚡</span>
                </div>
                <span className="font-semibold">PIKA/USDC</span>
                <Button variant="ghost" size="sm" className="p-0 h-auto">
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="m6 9 6 6 6-6" />
                  </svg>
                </Button>
                <Badge variant="secondary" className="bg-[#FED823] text-black">
                  Perp
                </Badge>
              </div>

              <div className="flex items-center gap-6 text-sm">
                <div>
                  <span className="text-muted-foreground">Price</span>
                  <div className="font-mono font-semibold">
                    {lastPrice ? formatPrice(lastPrice) : '-'}
                  </div>
                </div>
                <div>
                  <span className="text-muted-foreground">24h Change</span>
                  <div className="font-mono text-[#FED823]">+4.02 / +3.31%</div>
                </div>
                <div>
                  <span className="text-muted-foreground">24h Volume</span>
                  <div className="font-mono">
                    {state.recentTrades.reduce((sum, t) => sum + t.qty, 0n).toString()} USDC
                  </div>
                </div>
                <div>
                  <span className="text-muted-foreground">Spread</span>
                  <div className="font-mono">
                    {state.bestBidPrice && state.bestAskPrice &&
                    state.bestBidPrice !== BigInt(NULL_PRICE) &&
                    state.bestAskPrice !== BigInt(NULL_PRICE)
                      ? formatPrice(state.bestAskPrice - state.bestBidPrice)
                      : '-'}
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm">
                <Settings className="w-4 h-4" />
              </Button>
              <Button variant="ghost" size="sm">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2 2v-3M3 16v3a2 2 0 0 0 2 2h3" />
                </svg>
              </Button>
            </div>
          </div>
        </div>
      </header>

      <div className="flex h-[calc(100vh-145px)]">
        {/* Professional Chart Toolbar */}
        <div className="w-12 border-r border-border bg-card flex flex-col items-center py-4 gap-4">
          <Button variant="ghost" size="sm" className="w-8 h-8 p-0">
            <Crosshair className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="sm" className="w-8 h-8 p-0">
            <TrendIcon className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="sm" className="w-8 h-8 p-0">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 12h18m-9-9v18" />
            </svg>
          </Button>
          <Button variant="ghost" size="sm" className="w-8 h-8 p-0">
            <BarChart3 className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="sm" className="w-8 h-8 p-0">
            <PenTool className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="sm" className="w-8 h-8 p-0">
            <Type className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="sm" className="w-8 h-8 p-0">
            <Smile className="w-4 h-4" />
          </Button>
        </div>

        {/* Main Content Area */}
        <div className="flex-1 flex">
          {/* Left Side - Chart and Orders */}
          <div className="flex-1 flex flex-col">
            {/* Chart Header */}
            <div className="border-b border-border p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="flex gap-2">
                    {["5m", "1h", "D"].map((tf) => (
                      <Button
                        key={tf}
                        variant={timeframe === tf ? "default" : "ghost"}
                        size="sm"
                        onClick={() => setTimeframe(tf)}
                        className={timeframe === tf ? "bg-[#FED823] text-black hover:bg-[#FED823]/90" : ""}
                      >
                        {tf}
                      </Button>
                    ))}
                  </div>
                  <div className="h-6 w-px bg-border" />
                  <Button variant="ghost" size="sm">
                    <BarChart3 className="w-4 h-4 mr-2" />
                    Indicators
                  </Button>
                </div>
              </div>
            </div>

            {/* Chart Area */}
            <div className="flex-1 p-4">
              <PriceChart symbol={selectedMarket} />
            </div>

            {/* Bottom Panel - My Orders */}
            <div className="h-64 border-t border-border">
              <MyOrders />
            </div>
          </div>

          {/* Middle - Order Book */}
          <div className="w-80 border-x border-border">
            <OrderBookDisplay />
          </div>

          {/* Right Side - Trading Panel */}
          <div className="w-80 p-4 space-y-4 overflow-y-auto">
            <OrderPlacement />
            <MatchExecutor />
            <TradeHistory />
          </div>
        </div>
      </div>
    </div>
  )
}