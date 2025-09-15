"use client"

import { useState } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import {
  Search,
  Star,
  TrendingUp,
  TrendingDown,
  ArrowUpDown,
  Grid3X3,
  List,
  Settings,
  Bell,
  Wallet,
} from "lucide-react"
import Link from "next/link"

const mockMarkets = [
  {
    symbol: "PIKA-USD",
    name: "Pikachu",
    rarity: "Rare Holo",
    price: "125.50",
    change24h: "+3.2%",
    volume24h: "2.1M",
    funding: "0.01%",
    openInterest: "8.5M",
    positive: true,
    favorite: false,
  },
  {
    symbol: "CHAR-USD",
    name: "Charizard",
    rarity: "Ultra Rare",
    price: "450.00",
    change24h: "+1.8%",
    volume24h: "5.2M",
    funding: "0.02%",
    openInterest: "15.8M",
    positive: true,
    favorite: true,
  },
  {
    symbol: "BLAST-USD",
    name: "Blastoise",
    rarity: "Rare Holo",
    price: "280.75",
    change24h: "-0.5%",
    volume24h: "1.8M",
    funding: "-0.01%",
    openInterest: "6.4M",
    positive: false,
    favorite: false,
  },
  {
    symbol: "VENU-USD",
    name: "Venusaur",
    rarity: "Rare Holo",
    price: "195.30",
    change24h: "+2.1%",
    volume24h: "1.2M",
    funding: "0.03%",
    openInterest: "4.9M",
    positive: true,
    favorite: false,
  },
  {
    symbol: "MEW-USD",
    name: "Mewtwo",
    rarity: "Secret Rare",
    price: "850.00",
    change24h: "+5.4%",
    volume24h: "8.5M",
    funding: "0.05%",
    openInterest: "25.2M",
    positive: true,
    favorite: true,
  },
  {
    symbol: "GYAR-USD",
    name: "Gyarados",
    rarity: "Rare",
    price: "89.42",
    change24h: "+0.8%",
    volume24h: "650K",
    funding: "0.02%",
    openInterest: "3.1M",
    positive: true,
    favorite: false,
  },
  {
    symbol: "DRAGO-USD",
    name: "Dragonite",
    rarity: "Rare Holo",
    price: "156.85",
    change24h: "-2.4%",
    volume24h: "980K",
    funding: "-0.03%",
    openInterest: "4.8M",
    positive: false,
    favorite: false,
  },
  {
    symbol: "LUGIA-USD",
    name: "Lugia",
    rarity: "Ultra Rare",
    price: "324.25",
    change24h: "+1.9%",
    volume24h: "2.8M",
    funding: "0.01%",
    openInterest: "9.5M",
    positive: true,
    favorite: false,
  },
]

export function MarketsPage() {
  const [searchQuery, setSearchQuery] = useState("")
  const [activeTab, setActiveTab] = useState("all")
  const [viewMode, setViewMode] = useState<"grid" | "list">("list")
  const [sortBy, setSortBy] = useState("volume")
  const [favorites, setFavorites] = useState<string[]>(["CHAR-USD", "MEW-USD"])

  const toggleFavorite = (symbol: string) => {
    setFavorites((prev) => (prev.includes(symbol) ? prev.filter((s) => s !== symbol) : [...prev, symbol]))
  }

  const filteredMarkets = mockMarkets.filter((market) => {
    const matchesSearch =
      market.symbol.toLowerCase().includes(searchQuery.toLowerCase()) ||
      market.name.toLowerCase().includes(searchQuery.toLowerCase())

    if (activeTab === "favorites") {
      return matchesSearch && favorites.includes(market.symbol)
    }

    return matchesSearch
  })

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
              <Link href="/markets" className="text-foreground font-medium">
                Markets
              </Link>
              <Link href="/portfolio" className="text-muted-foreground hover:text-foreground">
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
      </header>

      <div className="p-6">
        {/* Page Header */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold mb-2">Pokemon Card Markets</h1>
          <p className="text-muted-foreground">Trade perpetual futures on tokenized Pokemon cards</p>
        </div>

        {/* Filters and Search */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search Pokemon cards..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 w-80"
              />
            </div>

            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList>
                <TabsTrigger value="all">All Cards</TabsTrigger>
                <TabsTrigger value="favorites">Favorites</TabsTrigger>
                <TabsTrigger value="rare">Rare Cards</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          <div className="flex items-center gap-2">
            <Button variant={viewMode === "list" ? "default" : "outline"} size="sm" onClick={() => setViewMode("list")}>
              <List className="w-4 h-4" />
            </Button>
            <Button variant={viewMode === "grid" ? "default" : "outline"} size="sm" onClick={() => setViewMode("grid")}>
              <Grid3X3 className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Market Stats */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          <Card className="p-4">
            <div className="text-sm text-muted-foreground">Total Volume (24h)</div>
            <div className="text-2xl font-bold">$23.2M</div>
            <div className="text-sm text-[#FED823]">+18.5%</div>
          </Card>
          <Card className="p-4">
            <div className="text-sm text-muted-foreground">Open Interest</div>
            <div className="text-2xl font-bold">$78M</div>
            <div className="text-sm text-[#FED823]">+5.2%</div>
          </Card>
          <Card className="p-4">
            <div className="text-sm text-muted-foreground">Active Cards</div>
            <div className="text-2xl font-bold">8</div>
            <div className="text-sm text-muted-foreground">Available</div>
          </Card>
          <Card className="p-4">
            <div className="text-sm text-muted-foreground">Avg Funding Rate</div>
            <div className="text-2xl font-bold">0.02%</div>
            <div className="text-sm text-[#FED823]">8h</div>
          </Card>
        </div>

        {/* Markets Table/Grid */}
        {viewMode === "list" ? (
          <Card>
            <div className="p-6">
              <div className="grid grid-cols-8 gap-4 text-sm text-muted-foreground mb-4 pb-2 border-b border-border">
                <div className="flex items-center gap-2 cursor-pointer hover:text-foreground">
                  <span>Pokemon Card</span>
                  <ArrowUpDown className="w-3 h-3" />
                </div>
                <div className="flex items-center gap-2 cursor-pointer hover:text-foreground">
                  <span>Price</span>
                  <ArrowUpDown className="w-3 h-3" />
                </div>
                <div className="flex items-center gap-2 cursor-pointer hover:text-foreground">
                  <span>24h Change</span>
                  <ArrowUpDown className="w-3 h-3" />
                </div>
                <div className="flex items-center gap-2 cursor-pointer hover:text-foreground">
                  <span>24h Volume</span>
                  <ArrowUpDown className="w-3 h-3" />
                </div>
                <div className="flex items-center gap-2 cursor-pointer hover:text-foreground">
                  <span>Funding Rate</span>
                  <ArrowUpDown className="w-3 h-3" />
                </div>
                <div className="flex items-center gap-2 cursor-pointer hover:text-foreground">
                  <span>Open Interest</span>
                  <ArrowUpDown className="w-3 h-3" />
                </div>
                <div>Chart</div>
                <div>Action</div>
              </div>

              <div className="space-y-2">
                {filteredMarkets.map((market) => (
                  <div
                    key={market.symbol}
                    className="grid grid-cols-8 gap-4 items-center py-3 hover:bg-muted/50 rounded-lg px-2 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => toggleFavorite(market.symbol)}
                        className="text-muted-foreground hover:text-primary transition-colors"
                      >
                        <Star
                          className={`w-4 h-4 ${favorites.includes(market.symbol) ? "fill-primary text-primary" : ""}`}
                        />
                      </button>
                      <div>
                        <div className="font-medium">{market.name}</div>
                        <div className="text-sm text-muted-foreground">{market.rarity}</div>
                      </div>
                    </div>

                    <div className="font-mono text-lg">${market.price}</div>

                    <div className={`flex items-center gap-1 ${market.positive ? "text-[#FED823]" : "text-[#EA4F24]"}`}>
                      {market.positive ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                      <span>{market.change24h}</span>
                    </div>

                    <div className="font-mono">${market.volume24h}</div>

                    <div
                      className={`font-mono ${market.funding.startsWith("-") ? "text-[#EA4F24]" : "text-[#FED823]"}`}
                    >
                      {market.funding}
                    </div>

                    <div className="font-mono">${market.openInterest}</div>

                    <div className="w-16 h-8 bg-muted/20 rounded flex items-center justify-center">
                      <div className={`w-12 h-1 rounded ${market.positive ? "bg-[#FED823]" : "bg-[#EA4F24]"}`}></div>
                    </div>

                    <Link href={`/trade/${market.symbol}`}>
                      <Button size="sm" className="w-full">
                        Trade
                      </Button>
                    </Link>
                  </div>
                ))}
              </div>
            </div>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredMarkets.map((market) => (
              <Card key={market.symbol} className="p-4 hover:shadow-lg transition-shadow">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => toggleFavorite(market.symbol)}
                      className="text-muted-foreground hover:text-primary transition-colors"
                    >
                      <Star
                        className={`w-4 h-4 ${favorites.includes(market.symbol) ? "fill-primary text-primary" : ""}`}
                      />
                    </button>
                    <div>
                      <div className="font-bold">{market.name}</div>
                      <div className="text-sm text-muted-foreground">{market.rarity}</div>
                    </div>
                  </div>
                  <Badge variant={market.positive ? "default" : "destructive"}>{market.change24h}</Badge>
                </div>

                <div className="mb-4">
                  <div className="text-2xl font-bold font-mono">${market.price}</div>
                </div>

                <div className="space-y-2 text-sm mb-4">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">24h Volume:</span>
                    <span className="font-mono">${market.volume24h}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Funding:</span>
                    <span
                      className={`font-mono ${market.funding.startsWith("-") ? "text-[#EA4F24]" : "text-[#FED823]"}`}
                    >
                      {market.funding}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Open Interest:</span>
                    <span className="font-mono">${market.openInterest}</span>
                  </div>
                </div>

                <Link href={`/trade/${market.symbol}`}>
                  <Button className="w-full">Trade {market.name}</Button>
                </Link>
              </Card>
            ))}
          </div>
        )}

        {filteredMarkets.length === 0 && (
          <Card className="p-12">
            <div className="text-center">
              <Search className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
              <h3 className="text-lg font-semibold mb-2">No Pokemon cards found</h3>
              <p className="text-muted-foreground">Try adjusting your search or filter criteria</p>
            </div>
          </Card>
        )}
      </div>
    </div>
  )
}
