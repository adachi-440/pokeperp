"use client"

import { useState } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Slider } from "@/components/ui/slider"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  Settings,
  Bell,
  Wallet,
  Palette,
  Globe,
  Volume2,
  VolumeX,
  Calculator,
  Shield,
  Key,
  Smartphone,
  Mail,
  Info,
  Save,
  RotateCcw,
} from "lucide-react"
import Link from "next/link"

export function SettingsPage() {
  const [theme, setTheme] = useState("dark")
  const [language, setLanguage] = useState("en")
  const [currency, setCurrency] = useState("USD")
  const [soundEnabled, setSoundEnabled] = useState(true)
  const [soundVolume, setSoundVolume] = useState([75])
  const [notifications, setNotifications] = useState({
    orderFills: true,
    priceAlerts: true,
    fundingPayments: true,
    systemUpdates: false,
    marketing: false,
  })
  const [trading, setTrading] = useState({
    confirmOrders: true,
    autoReduceOnly: false,
    defaultLeverage: [10],
    slippageTolerance: [0.5],
  })
  const [display, setDisplay] = useState({
    decimalPlaces: "2",
    thousandsSeparator: true,
    showBalance: true,
    compactMode: false,
  })

  const handleSaveSettings = () => {
    // Mock save functionality
    console.log("Settings saved")
  }

  const handleResetSettings = () => {
    // Mock reset functionality
    setTheme("dark")
    setLanguage("en")
    setCurrency("USD")
    setSoundEnabled(true)
    setSoundVolume([75])
    console.log("Settings reset to defaults")
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
              <Link href="/account" className="text-muted-foreground hover:text-foreground">
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
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold mb-2">Settings</h1>
            <p className="text-muted-foreground">Customize your trading experience and preferences</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={handleResetSettings}>
              <RotateCcw className="w-4 h-4 mr-2" />
              Reset to Defaults
            </Button>
            <Button onClick={handleSaveSettings}>
              <Save className="w-4 h-4 mr-2" />
              Save Changes
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column */}
          <div className="space-y-6">
            {/* Appearance Settings */}
            <Card className="p-6">
              <div className="flex items-center gap-3 mb-4">
                <Palette className="w-5 h-5 text-primary" />
                <h2 className="text-xl font-semibold">Appearance</h2>
              </div>

              <div className="space-y-4">
                <div>
                  <Label htmlFor="theme">Theme</Label>
                  <Select value={theme} onValueChange={setTheme}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="light">Light</SelectItem>
                      <SelectItem value="dark">Dark</SelectItem>
                      <SelectItem value="system">System</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="language">Language</Label>
                  <Select value={language} onValueChange={setLanguage}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="en">English</SelectItem>
                      <SelectItem value="ja">日本語</SelectItem>
                      <SelectItem value="zh">中文</SelectItem>
                      <SelectItem value="ko">한국어</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="currency">Display Currency</Label>
                  <Select value={currency} onValueChange={setCurrency}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="USD">USD ($)</SelectItem>
                      <SelectItem value="EUR">EUR (€)</SelectItem>
                      <SelectItem value="JPY">JPY (¥)</SelectItem>
                      <SelectItem value="GBP">GBP (£)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </Card>

            {/* Sound Settings */}
            <Card className="p-6">
              <div className="flex items-center gap-3 mb-4">
                {soundEnabled ? (
                  <Volume2 className="w-5 h-5 text-primary" />
                ) : (
                  <VolumeX className="w-5 h-5 text-muted-foreground" />
                )}
                <h2 className="text-xl font-semibold">Sound</h2>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label htmlFor="sound-enabled">Enable Sound</Label>
                  <Switch checked={soundEnabled} onCheckedChange={setSoundEnabled} />
                </div>

                {soundEnabled && (
                  <div>
                    <Label>Volume: {soundVolume[0]}%</Label>
                    <Slider
                      value={soundVolume}
                      onValueChange={setSoundVolume}
                      max={100}
                      min={0}
                      step={5}
                      className="mt-2"
                    />
                  </div>
                )}
              </div>
            </Card>
          </div>

          {/* Middle Column */}
          <div className="space-y-6">
            {/* Trading Settings */}
            <Card className="p-6">
              <div className="flex items-center gap-3 mb-4">
                <Calculator className="w-5 h-5 text-primary" />
                <h2 className="text-xl font-semibold">Trading</h2>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Order Confirmation</Label>
                    <p className="text-sm text-muted-foreground">Confirm orders before submission</p>
                  </div>
                  <Switch
                    checked={trading.confirmOrders}
                    onCheckedChange={(checked) => setTrading({ ...trading, confirmOrders: checked })}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label>Auto Reduce-Only</Label>
                    <p className="text-sm text-muted-foreground">
                      Automatically enable reduce-only for large positions
                    </p>
                  </div>
                  <Switch
                    checked={trading.autoReduceOnly}
                    onCheckedChange={(checked) => setTrading({ ...trading, autoReduceOnly: checked })}
                  />
                </div>

                <div>
                  <Label>Default Leverage: {trading.defaultLeverage[0]}x</Label>
                  <Slider
                    value={trading.defaultLeverage}
                    onValueChange={(value) => setTrading({ ...trading, defaultLeverage: value })}
                    max={100}
                    min={1}
                    step={1}
                    className="mt-2"
                  />
                </div>

                <div>
                  <Label>Slippage Tolerance: {trading.slippageTolerance[0]}%</Label>
                  <Slider
                    value={trading.slippageTolerance}
                    onValueChange={(value) => setTrading({ ...trading, slippageTolerance: value })}
                    max={5}
                    min={0.1}
                    step={0.1}
                    className="mt-2"
                  />
                </div>
              </div>
            </Card>

            {/* Display Settings */}
            <Card className="p-6">
              <div className="flex items-center gap-3 mb-4">
                <Globe className="w-5 h-5 text-primary" />
                <h2 className="text-xl font-semibold">Display</h2>
              </div>

              <div className="space-y-4">
                <div>
                  <Label>Decimal Places</Label>
                  <Select
                    value={display.decimalPlaces}
                    onValueChange={(value) => setDisplay({ ...display, decimalPlaces: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="2">2 decimal places</SelectItem>
                      <SelectItem value="4">4 decimal places</SelectItem>
                      <SelectItem value="6">6 decimal places</SelectItem>
                      <SelectItem value="8">8 decimal places</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center justify-between">
                  <Label>Thousands Separator</Label>
                  <Switch
                    checked={display.thousandsSeparator}
                    onCheckedChange={(checked) => setDisplay({ ...display, thousandsSeparator: checked })}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <Label>Show Balance in Header</Label>
                  <Switch
                    checked={display.showBalance}
                    onCheckedChange={(checked) => setDisplay({ ...display, showBalance: checked })}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <Label>Compact Mode</Label>
                  <Switch
                    checked={display.compactMode}
                    onCheckedChange={(checked) => setDisplay({ ...display, compactMode: checked })}
                  />
                </div>
              </div>
            </Card>
          </div>

          {/* Right Column */}
          <div className="space-y-6">
            {/* Notification Settings */}
            <Card className="p-6">
              <div className="flex items-center gap-3 mb-4">
                <Bell className="w-5 h-5 text-primary" />
                <h2 className="text-xl font-semibold">Notifications</h2>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Order Fills</Label>
                    <p className="text-sm text-muted-foreground">Notify when orders are executed</p>
                  </div>
                  <Switch
                    checked={notifications.orderFills}
                    onCheckedChange={(checked) => setNotifications({ ...notifications, orderFills: checked })}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label>Price Alerts</Label>
                    <p className="text-sm text-muted-foreground">Notify when price targets are reached</p>
                  </div>
                  <Switch
                    checked={notifications.priceAlerts}
                    onCheckedChange={(checked) => setNotifications({ ...notifications, priceAlerts: checked })}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label>Funding Payments</Label>
                    <p className="text-sm text-muted-foreground">Notify about funding rate payments</p>
                  </div>
                  <Switch
                    checked={notifications.fundingPayments}
                    onCheckedChange={(checked) => setNotifications({ ...notifications, fundingPayments: checked })}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label>System Updates</Label>
                    <p className="text-sm text-muted-foreground">Notify about platform updates</p>
                  </div>
                  <Switch
                    checked={notifications.systemUpdates}
                    onCheckedChange={(checked) => setNotifications({ ...notifications, systemUpdates: checked })}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label>Marketing</Label>
                    <p className="text-sm text-muted-foreground">Receive promotional emails</p>
                  </div>
                  <Switch
                    checked={notifications.marketing}
                    onCheckedChange={(checked) => setNotifications({ ...notifications, marketing: checked })}
                  />
                </div>
              </div>
            </Card>

            {/* Security Settings */}
            <Card className="p-6">
              <div className="flex items-center gap-3 mb-4">
                <Shield className="w-5 h-5 text-primary" />
                <h2 className="text-xl font-semibold">Security</h2>
              </div>

              <div className="space-y-4">
                <Button variant="outline" className="w-full justify-start bg-transparent">
                  <Key className="w-4 h-4 mr-2" />
                  Change Password
                </Button>

                <Button variant="outline" className="w-full justify-start bg-transparent">
                  <Smartphone className="w-4 h-4 mr-2" />
                  Two-Factor Authentication
                </Button>

                <Button variant="outline" className="w-full justify-start bg-transparent">
                  <Mail className="w-4 h-4 mr-2" />
                  Email Verification
                </Button>

                <Separator />

                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Last Login:</span>
                    <span>2024-01-15 14:32:15</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">IP Address:</span>
                    <span>192.168.1.100</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Device:</span>
                    <span>Chrome on macOS</span>
                  </div>
                </div>
              </div>
            </Card>

            {/* API Settings */}
            <Card className="p-6">
              <div className="flex items-center gap-3 mb-4">
                <Key className="w-5 h-5 text-primary" />
                <h2 className="text-xl font-semibold">API Access</h2>
              </div>

              <Alert className="mb-4">
                <Info className="h-4 w-4" />
                <AlertDescription>
                  API keys allow third-party applications to access your account. Only create keys for trusted
                  applications.
                </AlertDescription>
              </Alert>

              <div className="space-y-4">
                <Button variant="outline" className="w-full bg-transparent">
                  Create New API Key
                </Button>

                <div className="text-center text-sm text-muted-foreground">No API keys created yet</div>
              </div>
            </Card>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="mt-8 flex items-center justify-between p-4 bg-muted/20 rounded-lg">
          <div className="text-sm text-muted-foreground">
            Settings are automatically saved to your browser. Connect your wallet to sync across devices.
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleResetSettings}>
              Reset All
            </Button>
            <Button onClick={handleSaveSettings}>Save Changes</Button>
          </div>
        </div>
      </div>
    </div>
  )
}
