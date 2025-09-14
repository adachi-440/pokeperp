"use client"

import { useState } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { Slider } from "@/components/ui/slider"
import { Switch } from "@/components/ui/switch"
import {
  TrendingUp,
  TrendingDown,
  Settings,
  Bell,
  Wallet,
  BarChart3,
  BlendIcon as TrendIcon,
  Crosshair,
  PenTool,
  Type,
  Smile,
} from "lucide-react"
import Link from "next/link"
import { PriceChart } from "./price-chart"

interface TradingInterfaceProps {
  selectedSymbol?: string
}

export function TradingInterface({ selectedSymbol = "PIKA-USD" }: TradingInterfaceProps) {
  const [selectedMarket, setSelectedMarket] = useState(selectedSymbol)
  const [orderType, setOrderType] = useState("limit")
  const [leverage, setLeverage] = useState([10])
  const [price, setPrice] = useState("125.50")
  const [size, setSize] = useState("0.1")
  const [timeframe, setTimeframe] = useState("1h")

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
              <span className="text-lg font-mono">$125.50</span>
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
            <Button variant="outline" size="sm">
              <Wallet className="w-4 h-4 mr-2" />
              Connect
            </Button>
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
                  <div className="font-mono font-semibold">125.50</div>
                </div>
                <div>
                  <span className="text-muted-foreground">24h Change</span>
                  <div className="font-mono text-[#FED823]">+4.02 / +3.31%</div>
                </div>
                <div>
                  <span className="text-muted-foreground">24h Volume</span>
                  <div className="font-mono">2,154,212.45 USDC</div>
                </div>
                <div>
                  <span className="text-muted-foreground">Market Cap</span>
                  <div className="font-mono">18,252,304,450 USDC</div>
                </div>
                <div>
                  <span className="text-muted-foreground">Contract</span>
                  <div className="font-mono text-xs">0x0d01...11ec</div>
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
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 16V8a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2z" />
              <path d="M16 12H8" />
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

        {/* Main Content */}
        <div className="flex-1 flex flex-col min-h-0">{/* 変更: 子のh-fullが効くようにmin-h-0を付与 */}
          {/* Updated Chart Header with Timeframes and Indicators */}
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
                  <Button variant="ghost" size="sm">
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="m6 9 6 6 6-6" />
                    </svg>
                  </Button>
                </div>

                <div className="h-6 w-px bg-border" />

                <Button variant="ghost" size="sm">
                  <svg className="w-4 h-4 mr-2" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M3 6h18l-2-3H5l-2 3zM3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6" />
                    <path d="M10 11V6" />
                    <path d="M14 11V6" />
                  </svg>
                </Button>

                <Button variant="ghost" size="sm">
                  <BarChart3 className="w-4 h-4 mr-2" />
                  Indicators
                </Button>
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

          {/* Updated Chart Area with OHLC Display */}
          <div className="flex-1 min-h-0 p-4">{/* 変更: パーセンテージ高さの崩れ対策でmin-h-0 */}
            <div className="h-full">
              <div className="flex items-center gap-4 mb-4">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-[#FED823] rounded-full" />
                  <span className="text-sm font-medium">PIKA/USDC-125 · 1h · PokéCard Perp</span>
                </div>
                <div className="flex items-center gap-4 text-sm font-mono">
                  <span>
                    O<span className="text-[#FED823]">124.010</span>
                  </span>
                  <span>
                    H<span className="text-[#FED823]">124.260</span>
                  </span>
                  <span>
                    L<span className="text-[#FED823]">123.663</span>
                  </span>
                  <span>
                    C<span className="text-[#FED823]">124.239</span>
                  </span>
                  <span className="text-[#FED823]">0.22900 (+0.42%)</span>
                </div>
                <div className="ml-auto text-sm font-mono">125.000</div>
              </div>

              <PriceChart symbol={selectedMarket} timeframe={timeframe} />
            </div>
          </div>
        </div>

        {/* Right Sidebar - Order Form */}
        <div className="w-80 border-l border-border bg-card p-4">
          <Card>
            <div className="p-4">
              <h3 className="font-semibold mb-4">Place Perp Order</h3>

              <Tabs value={orderType} onValueChange={setOrderType} className="w-full mb-4">
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="limit">Limit</TabsTrigger>
                  <TabsTrigger value="market">Market</TabsTrigger>
                  <TabsTrigger value="stop">Stop</TabsTrigger>
                </TabsList>
              </Tabs>

              <div className="space-y-4">
                {orderType !== "market" && (
                  <div>
                    <label className="text-sm text-muted-foreground">Price (USD)</label>
                    <Input value={price} onChange={(e) => setPrice(e.target.value)} className="font-mono" />
                  </div>
                )}

                <div>
                  <label className="text-sm text-muted-foreground">Size (Cards)</label>
                  <Input value={size} onChange={(e) => setSize(e.target.value)} className="font-mono" />
                </div>

                <div>
                  <label className="text-sm text-muted-foreground mb-2 block">Leverage: {leverage[0]}x</label>
                  <Slider value={leverage} onValueChange={setLeverage} max={50} min={1} step={1} className="w-full" />
                </div>

                <div className="flex items-center justify-between">
                  <label className="text-sm">Reduce-Only</label>
                  <Switch />
                </div>

                <div className="flex items-center justify-between">
                  <label className="text-sm">Post-Only</label>
                  <Switch />
                </div>

                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Order Value:</span>
                    <span className="font-mono">$12.55</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Fee:</span>
                    <span className="font-mono">$0.06</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Margin Required:</span>
                    <span className="font-mono">$1.26</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 mt-6">
                  <Button className="bg-[#FED823] hover:bg-[#FED823]/90 text-black">
                    <TrendingUp className="w-4 h-4 mr-2" />
                    Buy/Long
                  </Button>
                  <Button className="bg-[#EA4F24] hover:bg-[#EA4F24]/90 text-white">
                    <TrendingDown className="w-4 h-4 mr-2" />
                    Sell/Short
                  </Button>
                </div>
              </div>
            </div>
          </Card>

          {/* Account Summary */}
          <Card className="mt-4">
            <div className="p-4">
              <h3 className="font-semibold mb-4">Account Summary</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Balance:</span>
                  <span className="font-mono">$12,340.00</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Equity:</span>
                  <span className="font-mono">$12,456.78</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Margin Used:</span>
                  <span className="font-mono">$2,345.60</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Utilization:</span>
                  <span className="font-mono">18.9%</span>
                </div>
              </div>

              <div className="mt-4">
                <div className="w-full bg-muted rounded-full h-2">
                  <div className="bg-primary h-2 rounded-full" style={{ width: "18.9%" }}></div>
                </div>
              </div>
            </div>
          </Card>
        </div>
      </div>

      {/* Bottom Panel - Positions and Orders */}
      <div className="h-64 border-t border-border bg-card">
        <Tabs defaultValue="positions" className="h-full">
          <div className="px-4 pt-4">
            <TabsList>
              <TabsTrigger value="positions">Positions</TabsTrigger>
              <TabsTrigger value="orders">Open Orders</TabsTrigger>
              <TabsTrigger value="history">Order History</TabsTrigger>
              <TabsTrigger value="funding">Funding</TabsTrigger>
              <TabsTrigger value="fees">Fees</TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="positions" className="px-4 pb-4 h-full">
            <div className="grid grid-cols-8 gap-4 text-xs text-muted-foreground mb-2">
              <span>Card</span>
              <span>Size</span>
              <span>Entry Price</span>
              <span>Mark Price</span>
              <span>UPNL</span>
              <span>ROE%</span>
              <span>Margin</span>
              <span>Actions</span>
            </div>

            <div className="grid grid-cols-8 gap-4 text-sm py-2">
              <span>Pikachu</span>
              <span className="text-[#FED823] font-mono">+0.5</span>
              <span className="font-mono">$124.00</span>
              <span className="font-mono">$125.50</span>
              <span className="text-[#FED823] font-mono">+$0.75</span>
              <span className="text-[#FED823]">+1.21%</span>
              <span className="font-mono">$12.40</span>
              <div className="flex gap-1">
                <Button size="sm" variant="outline">
                  TP/SL
                </Button>
                <Button size="sm" variant="outline">
                  Close
                </Button>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="orders" className="px-4 pb-4">
            <div className="text-center text-muted-foreground py-8">No open orders</div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
