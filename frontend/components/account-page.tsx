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
import { useVault, Transaction } from "@/lib/hooks/useVault"
import { useAccount } from "wagmi"
import { formatUnits, parseUnits } from "viem"
import { toast } from "sonner"
import { CONTRACT_ADDRESSES } from "@/lib/contracts/config"


export function AccountPage() {
  const [depositAmount, setDepositAmount] = useState("")
  const [withdrawAmount, setWithdrawAmount] = useState("")
  const [withdrawAddress, setWithdrawAddress] = useState("")
  const [selectedNetwork, setSelectedNetwork] = useState("arbitrum")
  const [isDepositOpen, setIsDepositOpen] = useState(false)
  const [isWithdrawOpen, setIsWithdrawOpen] = useState(false)

  const { address, isConnected } = useAccount()
  const { state: vaultState, deposit, withdraw, faucet } = useVault()

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    toast.success("コピーしました")
  }

  const handleDeposit = async () => {
    if (!depositAmount || parseFloat(depositAmount) <= 0) {
      toast.error("有効な金額を入力してください")
      return
    }

    try {
      const amount = parseUnits(depositAmount, 6) // USDC has 6 decimals
      await deposit(amount)
      setDepositAmount("")
      setIsDepositOpen(false)
    } catch (error) {
      console.error("Deposit failed:", error)
    }
  }

  const handleWithdraw = async () => {
    if (!withdrawAmount || parseFloat(withdrawAmount) <= 0) {
      toast.error("有効な金額を入力してください")
      return
    }

    try {
      const amount = parseUnits(withdrawAmount, 6) // USDC has 6 decimals
      await withdraw(amount)
      setWithdrawAmount("")
      setIsWithdrawOpen(false)
    } catch (error) {
      console.error("Withdrawal failed:", error)
    }
  }

  const vaultBalanceFormatted = vaultState.balance ? formatUnits(vaultState.balance, 6) : "0"
  const usdcBalanceFormatted = vaultState.usdcBalance ? formatUnits(vaultState.usdcBalance, 6) : "0"
  const totalDepositedFormatted = vaultState.totalDeposited ? formatUnits(vaultState.totalDeposited, 6) : "0"
  const totalWithdrawnFormatted = vaultState.totalWithdrawn ? formatUnits(vaultState.totalWithdrawn, 6) : "0"

  const formatTimestamp = (timestamp: bigint) => {
    const date = new Date(Number(timestamp) * 1000)
    return date.toLocaleString()
  }

  const formatTxHash = (hash: string) => {
    return `${hash.slice(0, 6)}...${hash.slice(-4)}`
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
              <span className="text-muted-foreground">Vault Balance: </span>
              <span className="font-mono">{vaultBalanceFormatted} USDC</span>
            </div>
            {!isConnected ? (
              <Button variant="outline" size="sm">
                <Wallet className="w-4 h-4 mr-2" />
                Connect
              </Button>
            ) : (
              <Badge variant="secondary">
                {address?.slice(0, 6)}...{address?.slice(-4)}
              </Badge>
            )}
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
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <Card className="p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-primary/10 rounded-lg">
                <Wallet className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Vault Balance</p>
                <p className="text-2xl font-bold font-mono">{vaultBalanceFormatted} USDC</p>
              </div>
            </div>
            <div className="text-sm text-muted-foreground">Available for trading on Arbitrum</div>
          </Card>

          <Card className="p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-chart-1/10 rounded-lg">
                <ArrowDownToLine className="w-5 h-5 text-chart-1" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Deposited</p>
                <p className="text-2xl font-bold font-mono">{totalDepositedFormatted} USDC</p>
              </div>
            </div>
            <div className="text-sm text-green-400">All time deposits to vault</div>
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

            <div className="space-y-2 mb-4">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Wallet USDC:</span>
                <span className="font-mono">{usdcBalanceFormatted} USDC</span>
              </div>
              <Button
                variant="outline"
                className="w-full"
                onClick={faucet}
                disabled={!isConnected || vaultState.isLoading}
              >
                Get Test USDC (1000 USDC)
              </Button>
            </div>

            <Dialog open={isDepositOpen} onOpenChange={setIsDepositOpen}>
              <DialogTrigger asChild>
                <Button className="w-full mb-4" disabled={!isConnected}>
                  <ArrowDownToLine className="w-4 h-4 mr-2" />
                  Deposit to Vault
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>Deposit to Vault</DialogTitle>
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
                    <label className="text-sm text-muted-foreground">Amount (USDC)</label>
                    <Input
                      type="number"
                      placeholder="0.00"
                      value={depositAmount}
                      onChange={(e) => setDepositAmount(e.target.value)}
                      className="font-mono"
                      step="1"
                    />
                    <div className="text-xs text-muted-foreground mt-1">
                      <div>Wallet Balance: {usdcBalanceFormatted} USDC</div>
                      <div>Current Vault Balance: {vaultBalanceFormatted} USDC</div>
                    </div>
                  </div>

                  <Alert>
                    <Info className="h-4 w-4" />
                    <AlertDescription>
                      TestUSDCをVaultコントラクトに預け入れます。
                      初回はUSDCの承認が必要です。
                    </AlertDescription>
                  </Alert>

                  <Button
                    className="w-full"
                    onClick={handleDeposit}
                    disabled={vaultState.isLoading || !depositAmount || parseFloat(depositAmount) <= 0}
                  >
                    {vaultState.isLoading ? "処理中..." : "Deposit to Vault"}
                  </Button>

                  <div className="text-xs text-muted-foreground">
                    • 預け入れた資産は取引の証拠金として使用されます
                    • ガス代が別途必要です
                    • 取引中の資産は引き出しが制限される場合があります
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

            <Dialog open={isWithdrawOpen} onOpenChange={setIsWithdrawOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" className="w-full mb-4 bg-transparent" disabled={!isConnected || vaultState.balance === 0n}>
                  <ArrowUpFromLine className="w-4 h-4 mr-2" />
                  Withdraw from Vault
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>Withdraw from Vault</DialogTitle>
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
                    <label className="text-sm text-muted-foreground">Amount (USDC)</label>
                    <div className="flex gap-2">
                      <Input
                        type="number"
                        placeholder="0.00"
                        value={withdrawAmount}
                        onChange={(e) => setWithdrawAmount(e.target.value)}
                        className="font-mono"
                        step="1"
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setWithdrawAmount(vaultBalanceFormatted)}
                      >
                        Max
                      </Button>
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      Available: {vaultBalanceFormatted} USDC
                    </div>
                  </div>

                  <Alert>
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription>
                      引き出しには証拠金要件のチェックがあります。ポジションがある場合、必要証拠金を下回る引き出しはできません。
                    </AlertDescription>
                  </Alert>

                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">引き出し金額:</span>
                      <span className="font-mono">{withdrawAmount || "0"} USDC</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Vault残高:</span>
                      <span className="font-mono">{vaultBalanceFormatted} USDC</span>
                    </div>
                    <div className="flex justify-between border-t border-border pt-2">
                      <span className="font-medium">引き出し後の残高:</span>
                      <span className="font-mono font-medium">
                        {withdrawAmount ? (parseFloat(vaultBalanceFormatted) - parseFloat(withdrawAmount)).toFixed(2) : vaultBalanceFormatted} USDC
                      </span>
                    </div>
                  </div>

                  <Button
                    className="w-full"
                    onClick={handleWithdraw}
                    disabled={vaultState.isLoading || !withdrawAmount || parseFloat(withdrawAmount) <= 0 || parseFloat(withdrawAmount) > parseFloat(vaultBalanceFormatted)}
                  >
                    {vaultState.isLoading ? "処理中..." : "Withdraw from Vault"}
                  </Button>

                  <div className="text-xs text-muted-foreground">
                    • 証拠金要件を下回る引き出しはできません
                    • ガス代が別途必要です
                    • ポジションがある場合は制限があります
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
                  <div className="grid grid-cols-6 gap-4 text-sm text-muted-foreground mb-4 pb-2 border-b border-border">
                    <span>Type</span>
                    <span>Amount</span>
                    <span>Currency</span>
                    <span>Status</span>
                    <span>Time</span>
                    <span>Transaction</span>
                  </div>

                  {vaultState.transactions.length === 0 ? (
                    <div className="text-center py-12">
                      <div className="text-muted-foreground">No transactions yet</div>
                    </div>
                  ) : (
                    vaultState.transactions.map((tx, index) => (
                      <div
                        key={`${tx.txHash}-${index}`}
                        className="grid grid-cols-6 gap-4 items-center py-3 hover:bg-muted/50 rounded-lg px-2"
                      >
                        <div className="flex items-center gap-2">
                          {tx.type === "Deposit" ? (
                            <ArrowDownToLine className="w-4 h-4 text-green-400" />
                          ) : (
                            <ArrowUpFromLine className="w-4 h-4 text-red-400" />
                          )}
                          <span>{tx.type}</span>
                        </div>
                        <span className="font-mono">{formatUnits(tx.amount, 6)}</span>
                        <span>USDC</span>
                        <Badge variant="default" className="w-fit">
                          <CheckCircle className="w-3 h-3 mr-1" />
                          Completed
                        </Badge>
                        <span className="text-sm text-muted-foreground font-mono">
                          {formatTimestamp(tx.timestamp)}
                        </span>
                        <div className="flex items-center gap-2">
                          <code className="text-xs">{formatTxHash(tx.txHash)}</code>
                          <Button size="sm" variant="ghost" onClick={() => copyToClipboard(tx.txHash)}>
                            <Copy className="w-3 h-3" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => window.open(`https://arbiscan.io/tx/${tx.txHash}`, '_blank')}
                          >
                            <ExternalLink className="w-3 h-3" />
                          </Button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </TabsContent>

              <TabsContent value="deposits">
                <div className="overflow-x-auto">
                  {vaultState.transactions.filter(tx => tx.type === 'Deposit').length === 0 ? (
                    <div className="text-center py-12">
                      <ArrowDownToLine className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                      <h3 className="text-lg font-semibold mb-2">No Deposits Yet</h3>
                      <p className="text-muted-foreground">Your deposit transactions will appear here</p>
                    </div>
                  ) : (
                    <>
                      <div className="grid grid-cols-5 gap-4 text-sm text-muted-foreground mb-4 pb-2 border-b border-border">
                        <span>Amount</span>
                        <span>Currency</span>
                        <span>Status</span>
                        <span>Time</span>
                        <span>Transaction</span>
                      </div>
                      {vaultState.transactions
                        .filter(tx => tx.type === 'Deposit')
                        .map((tx, index) => (
                          <div
                            key={`${tx.txHash}-${index}`}
                            className="grid grid-cols-5 gap-4 items-center py-3 hover:bg-muted/50 rounded-lg px-2"
                          >
                            <span className="font-mono text-green-400">+{formatUnits(tx.amount, 6)}</span>
                            <span>USDC</span>
                            <Badge variant="default" className="w-fit">
                              <CheckCircle className="w-3 h-3 mr-1" />
                              Completed
                            </Badge>
                            <span className="text-sm text-muted-foreground font-mono">
                              {formatTimestamp(tx.timestamp)}
                            </span>
                            <div className="flex items-center gap-2">
                              <code className="text-xs">{formatTxHash(tx.txHash)}</code>
                              <Button size="sm" variant="ghost" onClick={() => copyToClipboard(tx.txHash)}>
                                <Copy className="w-3 h-3" />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => window.open(`https://arbiscan.io/tx/${tx.txHash}`, '_blank')}
                              >
                                <ExternalLink className="w-3 h-3" />
                              </Button>
                            </div>
                          </div>
                        ))}
                    </>
                  )}
                </div>
              </TabsContent>

              <TabsContent value="withdrawals">
                <div className="overflow-x-auto">
                  {vaultState.transactions.filter(tx => tx.type === 'Withdrawal').length === 0 ? (
                    <div className="text-center py-12">
                      <ArrowUpFromLine className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                      <h3 className="text-lg font-semibold mb-2">No Withdrawals Yet</h3>
                      <p className="text-muted-foreground">Your withdrawal transactions will appear here</p>
                    </div>
                  ) : (
                    <>
                      <div className="grid grid-cols-5 gap-4 text-sm text-muted-foreground mb-4 pb-2 border-b border-border">
                        <span>Amount</span>
                        <span>Currency</span>
                        <span>Status</span>
                        <span>Time</span>
                        <span>Transaction</span>
                      </div>
                      {vaultState.transactions
                        .filter(tx => tx.type === 'Withdrawal')
                        .map((tx, index) => (
                          <div
                            key={`${tx.txHash}-${index}`}
                            className="grid grid-cols-5 gap-4 items-center py-3 hover:bg-muted/50 rounded-lg px-2"
                          >
                            <span className="font-mono text-red-400">-{formatUnits(tx.amount, 6)}</span>
                            <span>USDC</span>
                            <Badge variant="default" className="w-fit">
                              <CheckCircle className="w-3 h-3 mr-1" />
                              Completed
                            </Badge>
                            <span className="text-sm text-muted-foreground font-mono">
                              {formatTimestamp(tx.timestamp)}
                            </span>
                            <div className="flex items-center gap-2">
                              <code className="text-xs">{formatTxHash(tx.txHash)}</code>
                              <Button size="sm" variant="ghost" onClick={() => copyToClipboard(tx.txHash)}>
                                <Copy className="w-3 h-3" />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => window.open(`https://arbiscan.io/tx/${tx.txHash}`, '_blank')}
                              >
                                <ExternalLink className="w-3 h-3" />
                              </Button>
                            </div>
                          </div>
                        ))}
                    </>
                  )}
                </div>
              </TabsContent>
            </Tabs>
          </div>
        </Card>
      </div>
    </div>
  )
}
