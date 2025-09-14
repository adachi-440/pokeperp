"use client"

import { useState } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Settings,
  Bell,
  Wallet,
  Copy,
  ExternalLink,
  AlertTriangle,
  CheckCircle,
  Clock,
  Info,
} from "lucide-react"
import Link from "next/link"

const mockTransactions = [
  {
    id: "tx_001",
    type: "Deposit",
    amount: "1000.00",
    currency: "USDC",
    status: "Completed",
    time: "2024-01-15 14:32:15",
    txHash: "0x1234...5678",
    network: "Arbitrum",
  },
  {
    id: "tx_002",
    type: "Withdrawal",
    amount: "500.00",
    currency: "USDC",
    status: "Processing",
    time: "2024-01-15 12:18:45",
    txHash: "0x9876...5432",
    network: "Arbitrum",
  },
  {
    id: "tx_003",
    type: "Deposit",
    amount: "2000.00",
    currency: "USDC",
    status: "Completed",
    time: "2024-01-14 09:45:22",
    txHash: "0xabcd...efgh",
    network: "Arbitrum",
  },
]

export function AccountPage() {
  const [depositAmount, setDepositAmount] = useState("")
  const [withdrawAmount, setWithdrawAmount] = useState("")
  const [withdrawAddress, setWithdrawAddress] = useState("")
  const [selectedNetwork, setSelectedNetwork] = useState("arbitrum")

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="border-b border-border bg-card">
        <div className="flex items-center justify-between px-6 py-4">
          <div className="flex items-center gap-6">
            <Link href="/" className="text-xl font-bold">
              PerpDEX
            </Link>
            <nav className="flex items-center gap-6">
              <Link href="/" className="text-muted-foreground hover:text-foreground">
                Trade
              </Link>
              <Link href="/markets" className="text-muted-foreground hover:text-foreground">
                Markets
              </Link>
              <Link href="/portfolio" className="text-muted-foreground hover:text-foreground">
                Portfolio
              </Link>
              <Link href="/account" className="text-foreground font-medium">
                Account
              </Link>
            </nav>
          </div>
          <div className="flex items-center gap-4">
            <Badge variant="outline">Arbitrum</Badge>
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
            <Button variant="ghost" size="sm">
              <Settings className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </header>

      <div className="p-6">
        {/* Page Header */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold mb-2">Account</h1>
          <p className="text-muted-foreground">Manage your deposits, withdrawals, and account settings</p>
        </div>

        {/* Account Overview */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <Card className="p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-primary/10 rounded-lg">
                <Wallet className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Available Balance</p>
                <p className="text-2xl font-bold font-mono">$12,340.00</p>
              </div>
            </div>
            <div className="text-sm text-muted-foreground">USDC on Arbitrum</div>
          </Card>

          <Card className="p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-chart-1/10 rounded-lg">
                <ArrowDownToLine className="w-5 h-5 text-chart-1" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Deposited</p>
                <p className="text-2xl font-bold font-mono">$15,000.00</p>
              </div>
            </div>
            <div className="text-sm text-green-400">+$3,000 this month</div>
          </Card>

          <Card className="p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-chart-2/10 rounded-lg">
                <ArrowUpFromLine className="w-5 h-5 text-chart-2" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Withdrawn</p>
                <p className="text-2xl font-bold font-mono">$2,660.00</p>
              </div>
            </div>
            <div className="text-sm text-muted-foreground">Last 30 days</div>
          </Card>
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          {/* Deposit Card */}
          <Card className="p-6">
            <div className="flex items-center gap-3 mb-4">
              <ArrowDownToLine className="w-6 h-6 text-green-400" />
              <h2 className="text-xl font-semibold">Deposit Funds</h2>
            </div>

            <Dialog>
              <DialogTrigger asChild>
                <Button className="w-full mb-4">
                  <ArrowDownToLine className="w-4 h-4 mr-2" />
                  Deposit USDC
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>Deposit USDC</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <label className="text-sm text-muted-foreground">Network</label>
                    <Select value={selectedNetwork} onValueChange={setSelectedNetwork}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="arbitrum">Arbitrum One</SelectItem>
                        <SelectItem value="ethereum">Ethereum</SelectItem>
                        <SelectItem value="polygon">Polygon</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <label className="text-sm text-muted-foreground">Amount</label>
                    <Input
                      type="number"
                      placeholder="0.00"
                      value={depositAmount}
                      onChange={(e) => setDepositAmount(e.target.value)}
                      className="font-mono"
                    />
                  </div>

                  <Alert>
                    <Info className="h-4 w-4" />
                    <AlertDescription>
                      Send USDC to the address below. Only send USDC on Arbitrum network to avoid loss of funds.
                    </AlertDescription>
                  </Alert>

                  <div className="p-4 bg-muted rounded-lg">
                    <div className="text-sm text-muted-foreground mb-2">Deposit Address</div>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 text-sm font-mono bg-background p-2 rounded">
                        0x742d35Cc6634C0532925a3b8D4C9db...
                      </code>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => copyToClipboard("0x742d35Cc6634C0532925a3b8D4C9db")}
                      >
                        <Copy className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>

                  <div className="text-xs text-muted-foreground">
                    • Minimum deposit: $10 USDC • Deposits typically confirm within 2-5 minutes • Network fees apply
                  </div>
                </div>
              </DialogContent>
            </Dialog>

            <div className="text-sm text-muted-foreground">
              <div className="flex justify-between mb-1">
                <span>Minimum:</span>
                <span>$10 USDC</span>
              </div>
              <div className="flex justify-between">
                <span>Network:</span>
                <span>Arbitrum One</span>
              </div>
            </div>
          </Card>

          {/* Withdraw Card */}
          <Card className="p-6">
            <div className="flex items-center gap-3 mb-4">
              <ArrowUpFromLine className="w-6 h-6 text-red-400" />
              <h2 className="text-xl font-semibold">Withdraw Funds</h2>
            </div>

            <Dialog>
              <DialogTrigger asChild>
                <Button variant="outline" className="w-full mb-4 bg-transparent">
                  <ArrowUpFromLine className="w-4 h-4 mr-2" />
                  Withdraw USDC
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>Withdraw USDC</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <label className="text-sm text-muted-foreground">Network</label>
                    <Select value={selectedNetwork} onValueChange={setSelectedNetwork}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="arbitrum">Arbitrum One</SelectItem>
                        <SelectItem value="ethereum">Ethereum</SelectItem>
                        <SelectItem value="polygon">Polygon</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <label className="text-sm text-muted-foreground">Withdrawal Address</label>
                    <Input
                      placeholder="0x..."
                      value={withdrawAddress}
                      onChange={(e) => setWithdrawAddress(e.target.value)}
                      className="font-mono"
                    />
                  </div>

                  <div>
                    <label className="text-sm text-muted-foreground">Amount</label>
                    <div className="flex gap-2">
                      <Input
                        type="number"
                        placeholder="0.00"
                        value={withdrawAmount}
                        onChange={(e) => setWithdrawAmount(e.target.value)}
                        className="font-mono"
                      />
                      <Button variant="outline" size="sm" onClick={() => setWithdrawAmount("12340.00")}>
                        Max
                      </Button>
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">Available: $12,340.00</div>
                  </div>

                  <Alert>
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription>
                      Double-check the withdrawal address and network. Transactions cannot be reversed.
                    </AlertDescription>
                  </Alert>

                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Amount:</span>
                      <span className="font-mono">${withdrawAmount || "0.00"}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Network Fee:</span>
                      <span className="font-mono">~$2.50</span>
                    </div>
                    <div className="flex justify-between border-t border-border pt-2">
                      <span className="font-medium">You'll receive:</span>
                      <span className="font-mono font-medium">
                        ${withdrawAmount ? (Number.parseFloat(withdrawAmount) - 2.5).toFixed(2) : "0.00"}
                      </span>
                    </div>
                  </div>

                  <Button className="w-full" disabled={!withdrawAmount || !withdrawAddress}>
                    Confirm Withdrawal
                  </Button>

                  <div className="text-xs text-muted-foreground">
                    • Minimum withdrawal: $50 USDC • Processing time: 5-30 minutes • Network fees apply
                  </div>
                </div>
              </DialogContent>
            </Dialog>

            <div className="text-sm text-muted-foreground">
              <div className="flex justify-between mb-1">
                <span>Minimum:</span>
                <span>$50 USDC</span>
              </div>
              <div className="flex justify-between">
                <span>Processing:</span>
                <span>5-30 minutes</span>
              </div>
            </div>
          </Card>
        </div>

        {/* Transaction History */}
        <Card>
          <div className="p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold">Transaction History</h2>
              <div className="flex gap-2">
                <Button variant="outline" size="sm">
                  Filter
                </Button>
                <Button variant="outline" size="sm">
                  Export
                </Button>
              </div>
            </div>

            <Tabs defaultValue="all">
              <TabsList className="mb-4">
                <TabsTrigger value="all">All Transactions</TabsTrigger>
                <TabsTrigger value="deposits">Deposits</TabsTrigger>
                <TabsTrigger value="withdrawals">Withdrawals</TabsTrigger>
              </TabsList>

              <TabsContent value="all">
                <div className="overflow-x-auto">
                  <div className="grid grid-cols-7 gap-4 text-sm text-muted-foreground mb-4 pb-2 border-b border-border">
                    <span>Type</span>
                    <span>Amount</span>
                    <span>Currency</span>
                    <span>Status</span>
                    <span>Time</span>
                    <span>Network</span>
                    <span>Transaction</span>
                  </div>

                  {mockTransactions.map((tx) => (
                    <div
                      key={tx.id}
                      className="grid grid-cols-7 gap-4 items-center py-3 hover:bg-muted/50 rounded-lg px-2"
                    >
                      <div className="flex items-center gap-2">
                        {tx.type === "Deposit" ? (
                          <ArrowDownToLine className="w-4 h-4 text-green-400" />
                        ) : (
                          <ArrowUpFromLine className="w-4 h-4 text-red-400" />
                        )}
                        <span>{tx.type}</span>
                      </div>
                      <span className="font-mono">${tx.amount}</span>
                      <span>{tx.currency}</span>
                      <Badge
                        variant={
                          tx.status === "Completed" ? "default" : tx.status === "Processing" ? "outline" : "destructive"
                        }
                        className="w-fit"
                      >
                        {tx.status === "Completed" && <CheckCircle className="w-3 h-3 mr-1" />}
                        {tx.status === "Processing" && <Clock className="w-3 h-3 mr-1" />}
                        {tx.status}
                      </Badge>
                      <span className="text-sm text-muted-foreground font-mono">{tx.time}</span>
                      <Badge variant="outline">{tx.network}</Badge>
                      <div className="flex items-center gap-2">
                        <code className="text-xs">{tx.txHash}</code>
                        <Button size="sm" variant="ghost" onClick={() => copyToClipboard(tx.txHash)}>
                          <Copy className="w-3 h-3" />
                        </Button>
                        <Button size="sm" variant="ghost">
                          <ExternalLink className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </TabsContent>

              <TabsContent value="deposits">
                <div className="text-center py-12">
                  <ArrowDownToLine className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                  <h3 className="text-lg font-semibold mb-2">Deposit History</h3>
                  <p className="text-muted-foreground">Your deposit transactions will appear here</p>
                </div>
              </TabsContent>

              <TabsContent value="withdrawals">
                <div className="text-center py-12">
                  <ArrowUpFromLine className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                  <h3 className="text-lg font-semibold mb-2">Withdrawal History</h3>
                  <p className="text-muted-foreground">Your withdrawal transactions will appear here</p>
                </div>
              </TabsContent>
            </Tabs>
          </div>
        </Card>
      </div>
    </div>
  )
}
