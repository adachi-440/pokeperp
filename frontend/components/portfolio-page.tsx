"use client"

import { useState } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import {
  TrendingUp,
  Settings,
  Bell,
  Wallet,
  DollarSign,
  PieChart,
  Activity,
  Calendar,
  Download,
  Eye,
  EyeOff,
} from "lucide-react"
import Link from "next/link"

const mockPositions = [
  {
    symbol: "PIKA-USD",
    name: "Pikachu",
    side: "Long",
    size: "0.5",
    entryPrice: "124.00",
    markPrice: "125.50",
    upnl: "+0.75",
    roe: "+1.21%",
    margin: "12.40",
    positive: true,
  },
  {
    symbol: "CHAR-USD",
    name: "Charizard",
    side: "Short",
    size: "-0.2",
    entryPrice: "460.00",
    markPrice: "450.00",
    upnl: "+2.00",
    roe: "+0.43%",
    margin: "92.00",
    positive: true,
  },
]

const mockOrderHistory = [
  {
    time: "2024-01-15 14:32:15",
    symbol: "PIKA-USD",
    name: "Pikachu",
    side: "Buy",
    type: "Limit",
    size: "0.5",
    price: "124.00",
    status: "Filled",
    fee: "0.06",
  },
  {
    time: "2024-01-15 13:45:22",
    symbol: "CHAR-USD",
    name: "Charizard",
    side: "Sell",
    type: "Market",
    size: "0.2",
    price: "460.00",
    status: "Filled",
    fee: "0.18",
  },
  {
    time: "2024-01-15 12:18:45",
    symbol: "MEW-USD",
    name: "Mewtwo",
    side: "Buy",
    type: "Limit",
    size: "0.1",
    price: "850.00",
    status: "Cancelled",
    fee: "0.00",
  },
]

const mockFundingHistory = [
  {
    time: "2024-01-15 16:00:00",
    symbol: "PIKA-USD",
    name: "Pikachu",
    side: "Long",
    size: "0.5",
    rate: "0.01%",
    payment: "-0.01",
  },
  {
    time: "2024-01-15 08:00:00",
    symbol: "CHAR-USD",
    name: "Charizard",
    side: "Short",
    size: "0.2",
    rate: "-0.02%",
    payment: "+0.02",
  },
]

export function PortfolioPage() {
  const [hideBalances, setHideBalances] = useState(false)

  const formatBalance = (amount: string) => {
    return hideBalances ? "****" : amount
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="border-b border-border bg-card">
        <div className="flex items-center justify-between px-6 py-4">
          <div className="flex items-center gap-6">
            <Link href="/" className="text-xl font-bold text-primary">
              pizzaperp
            </Link>
            <nav className="flex items-center gap-6">
              <Link href="/" className="text-muted-foreground hover:text-foreground">
                Trade
              </Link>
              <Link href="/markets" className="text-muted-foreground hover:text-foreground">
                Markets
              </Link>
              <Link href="/portfolio" className="text-foreground font-medium">
                Portfolio
              </Link>
              <Link href="/account" className="text-muted-foreground hover:text-foreground">
                Account
              </Link>
            </nav>
          </div>
          <div className="flex items-center gap-4">
            <Badge variant="outline">Ethereum</Badge>
            <div className="text-sm">
              <span className="text-muted-foreground">Balance: </span>
              <span className="font-mono">{formatBalance("$12,340.00")}</span>
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
      </header>

      <div className="p-6">
        {/* Page Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold mb-2">Pokemon Card Portfolio</h1>
            <p className="text-muted-foreground">Monitor your card positions and trading performance</p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setHideBalances(!hideBalances)}
              className="flex items-center gap-2"
            >
              {hideBalances ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              {hideBalances ? "Show" : "Hide"} Balances
            </Button>
            <Button variant="outline" size="sm">
              <Download className="w-4 h-4 mr-2" />
              Export
            </Button>
          </div>
        </div>

        {/* Portfolio Overview */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <Card className="p-6">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-primary/10 rounded-lg">
                <DollarSign className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Balance</p>
                <p className="text-2xl font-bold font-mono">{formatBalance("$12,340.00")}</p>
              </div>
            </div>
            <div className="flex items-center gap-1 text-sm">
              <TrendingUp className="w-4 h-4 text-[#FED823]" />
              <span className="text-[#FED823]">+2.5% (24h)</span>
            </div>
          </Card>

          <Card className="p-6">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-chart-1/10 rounded-lg">
                <PieChart className="w-5 h-5 text-chart-1" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Equity</p>
                <p className="text-2xl font-bold font-mono">{formatBalance("$12,456.78")}</p>
              </div>
            </div>
            <div className="flex items-center gap-1 text-sm">
              <TrendingUp className="w-4 h-4 text-[#FED823]" />
              <span className="text-[#FED823]">+$116.78</span>
            </div>
          </Card>

          <Card className="p-6">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-chart-2/10 rounded-lg">
                <Activity className="w-5 h-5 text-chart-2" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Unrealized PnL</p>
                <p className="text-2xl font-bold font-mono text-[#FED823]">{formatBalance("+$2.75")}</p>
              </div>
            </div>
            <div className="flex items-center gap-1 text-sm">
              <span className="text-[#FED823]">+0.22% ROE</span>
            </div>
          </Card>

          <Card className="p-6">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-chart-3/10 rounded-lg">
                <Calendar className="w-5 h-5 text-chart-3" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Today's PnL</p>
                <p className="text-2xl font-bold font-mono text-[#FED823]">{formatBalance("+$8.20")}</p>
              </div>
            </div>
            <div className="flex items-center gap-1 text-sm">
              <TrendingUp className="w-4 h-4 text-[#FED823]" />
              <span className="text-[#FED823]">+0.07%</span>
            </div>
          </Card>
        </div>

        {/* Portfolio Chart */}
        <Card className="mb-8">
          <div className="p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold">Portfolio Performance</h2>
              <div className="flex gap-2">
                {["1D", "7D", "30D", "90D", "1Y", "ALL"].map((period) => (
                  <Button key={period} variant="ghost" size="sm">
                    {period}
                  </Button>
                ))}
              </div>
            </div>
            <div className="h-80 bg-muted/20 rounded-lg flex items-center justify-center">
              <div className="text-center">
                <Activity className="w-12 h-12 mx-auto mb-2 text-primary" />
                <p className="text-muted-foreground">Pokemon Card Portfolio Chart</p>
                <p className="text-sm text-muted-foreground mt-1">Historical balance and PnL visualization</p>
              </div>
            </div>
          </div>
        </Card>

        {/* Detailed Tables */}
        <Tabs defaultValue="positions" className="space-y-6">
          <TabsList>
            <TabsTrigger value="positions">Open Positions</TabsTrigger>
            <TabsTrigger value="orders">Order History</TabsTrigger>
            <TabsTrigger value="funding">Funding History</TabsTrigger>
            <TabsTrigger value="fees">Fee Summary</TabsTrigger>
          </TabsList>

          <TabsContent value="positions">
            <Card>
              <div className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold">Open Card Positions</h3>
                  <Badge variant="outline">{mockPositions.length} Active</Badge>
                </div>

                <div className="overflow-x-auto">
                  <div className="grid grid-cols-9 gap-4 text-sm text-muted-foreground mb-4 pb-2 border-b border-border">
                    <span>Pokemon Card</span>
                    <span>Side</span>
                    <span>Size</span>
                    <span>Entry Price</span>
                    <span>Mark Price</span>
                    <span>UPNL</span>
                    <span>ROE%</span>
                    <span>Margin</span>
                    <span>Actions</span>
                  </div>

                  {mockPositions.map((position, i) => (
                    <div key={i} className="grid grid-cols-9 gap-4 items-center py-3 hover:bg-muted/50 rounded-lg px-2">
                      <div>
                        <div className="font-medium">{position.name}</div>
                        <div className="text-sm text-muted-foreground">{position.symbol}</div>
                      </div>
                      <Badge variant={position.side === "Long" ? "default" : "destructive"}>{position.side}</Badge>
                      <span className={`font-mono ${position.positive ? "text-[#FED823]" : "text-[#EA4F24]"}`}>
                        {position.size}
                      </span>
                      <span className="font-mono">${position.entryPrice}</span>
                      <span className="font-mono">${position.markPrice}</span>
                      <span className={`font-mono ${position.positive ? "text-[#FED823]" : "text-[#EA4F24]"}`}>
                        {hideBalances ? "****" : `$${position.upnl}`}
                      </span>
                      <span className={`font-mono ${position.positive ? "text-[#FED823]" : "text-[#EA4F24]"}`}>
                        {position.roe}
                      </span>
                      <span className="font-mono">{hideBalances ? "****" : `$${position.margin}`}</span>
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline">
                          TP/SL
                        </Button>
                        <Button size="sm" variant="outline">
                          Close
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>

                {mockPositions.length === 0 && (
                  <div className="text-center py-12">
                    <PieChart className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                    <h3 className="text-lg font-semibold mb-2">No Open Positions</h3>
                    <p className="text-muted-foreground mb-4">Start trading Pokemon cards to see your positions here</p>
                    <Link href="/markets">
                      <Button>Explore Card Markets</Button>
                    </Link>
                  </div>
                )}
              </div>
            </Card>
          </TabsContent>

          <TabsContent value="orders">
            <Card>
              <div className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold">Order History</h3>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm">
                      Filter
                    </Button>
                    <Button variant="outline" size="sm">
                      <Download className="w-4 h-4 mr-2" />
                      Export
                    </Button>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <div className="grid grid-cols-8 gap-4 text-sm text-muted-foreground mb-4 pb-2 border-b border-border">
                    <span>Time</span>
                    <span>Pokemon Card</span>
                    <span>Side</span>
                    <span>Type</span>
                    <span>Size</span>
                    <span>Price</span>
                    <span>Status</span>
                    <span>Fee</span>
                  </div>

                  {mockOrderHistory.map((order, i) => (
                    <div key={i} className="grid grid-cols-8 gap-4 items-center py-3 hover:bg-muted/50 rounded-lg px-2">
                      <span className="text-sm text-muted-foreground font-mono">{order.time}</span>
                      <div>
                        <div className="font-medium">{order.name}</div>
                        <div className="text-sm text-muted-foreground">{order.symbol}</div>
                      </div>
                      <Badge variant={order.side === "Buy" ? "default" : "destructive"}>{order.side}</Badge>
                      <span className="text-sm">{order.type}</span>
                      <span className="font-mono">{order.size}</span>
                      <span className="font-mono">${order.price}</span>
                      <Badge
                        variant={
                          order.status === "Filled"
                            ? "default"
                            : order.status === "Cancelled"
                              ? "destructive"
                              : "outline"
                        }
                      >
                        {order.status}
                      </Badge>
                      <span className="font-mono">{hideBalances ? "****" : `$${order.fee}`}</span>
                    </div>
                  ))}
                </div>
              </div>
            </Card>
          </TabsContent>

          <TabsContent value="funding">
            <Card>
              <div className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold">Funding History</h3>
                  <div className="text-sm text-muted-foreground">Next funding in 2h 15m</div>
                </div>

                <div className="overflow-x-auto">
                  <div className="grid grid-cols-6 gap-4 text-sm text-muted-foreground mb-4 pb-2 border-b border-border">
                    <span>Time</span>
                    <span>Pokemon Card</span>
                    <span>Side</span>
                    <span>Size</span>
                    <span>Rate</span>
                    <span>Payment</span>
                  </div>

                  {mockFundingHistory.map((funding, i) => (
                    <div key={i} className="grid grid-cols-6 gap-4 items-center py-3 hover:bg-muted/50 rounded-lg px-2">
                      <span className="text-sm text-muted-foreground font-mono">{funding.time}</span>
                      <div>
                        <div className="font-medium">{funding.name}</div>
                        <div className="text-sm text-muted-foreground">{funding.symbol}</div>
                      </div>
                      <Badge variant={funding.side === "Long" ? "default" : "destructive"}>{funding.side}</Badge>
                      <span className="font-mono">{funding.size}</span>
                      <span
                        className={`font-mono ${funding.rate.startsWith("-") ? "text-[#EA4F24]" : "text-[#FED823]"}`}
                      >
                        {funding.rate}
                      </span>
                      <span
                        className={`font-mono ${funding.payment.startsWith("-") ? "text-[#EA4F24]" : "text-[#FED823]"}`}
                      >
                        {hideBalances ? "****" : `$${funding.payment}`}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </Card>
          </TabsContent>

          <TabsContent value="fees">
            <Card>
              <div className="p-6">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-lg font-semibold">Fee Summary</h3>
                  <div className="flex gap-2">
                    {["7D", "30D", "90D", "1Y"].map((period) => (
                      <Button key={period} variant="ghost" size="sm">
                        {period}
                      </Button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
                  <div className="text-center p-4 bg-muted/20 rounded-lg">
                    <div className="text-2xl font-bold font-mono">{hideBalances ? "****" : "$2.45"}</div>
                    <div className="text-sm text-muted-foreground">Trading Fees (30D)</div>
                  </div>
                  <div className="text-center p-4 bg-muted/20 rounded-lg">
                    <div className="text-2xl font-bold font-mono">{hideBalances ? "****" : "$0.34"}</div>
                    <div className="text-sm text-muted-foreground">Funding Fees (30D)</div>
                  </div>
                  <div className="text-center p-4 bg-muted/20 rounded-lg">
                    <div className="text-2xl font-bold font-mono">{hideBalances ? "****" : "$2.79"}</div>
                    <div className="text-sm text-muted-foreground">Total Fees (30D)</div>
                  </div>
                </div>

                <div className="h-64 bg-muted/20 rounded-lg flex items-center justify-center">
                  <div className="text-center">
                    <Activity className="w-12 h-12 mx-auto mb-2 text-muted-foreground" />
                    <p className="text-muted-foreground">Fee Breakdown Chart</p>
                    <p className="text-sm text-muted-foreground mt-1">Trading vs Funding fees over time</p>
                  </div>
                </div>
              </div>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
