"use client"

import { useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { TrendingUp, TrendingDown } from 'lucide-react'
import { useOrderBook } from '@/lib/hooks/useOrderBook'
import { formatQty } from '@/lib/contracts/types'
import { toast } from 'sonner'
import { useWallets } from '@privy-io/react-auth'
import { arbitrumSepolia } from 'viem/chains'

export function OrderPlacement() {
  const { state, placeOrder, placeLongOrder, placeShortOrder } = useOrderBook()

  const [orderType, setOrderType] = useState('limit')
  const [price, setPrice] = useState('')
  const [size, setSize] = useState('')
  const [leverage, setLeverage] = useState([10])
  const [reduceOnly, setReduceOnly] = useState(false)
  const [postOnly, setPostOnly] = useState(false)
  const [isPlacing, setIsPlacing] = useState(false)
  const {wallets} = useWallets();

  const wallet = wallets[0];
  // wallet.switchChain(arbitrumSepolia.id);


  const handlePlaceOrder = async (isBid: boolean) => {
    if (!price || !size) {
      toast.error('価格と数量を入力してください')
      return
    }

    // 価格はint24として扱う（実装の仕様：価格そのものを整数として使用）
    const priceValue = BigInt(Math.floor(parseFloat(price)))
    const sizeValue = BigInt(Math.floor(parseFloat(size) * 1e18))

    // Validate against market config
    if (state.marketCfg) {
      if (sizeValue < state.marketCfg.minQty) {
        toast.error(`最小数量は ${formatQty(state.marketCfg.minQty)} です`)
        return
      }

      // ノーショナル計算: priceWei * qty / 1e18
      const priceWei = priceValue * 10n ** 18n
      const notional = (priceWei * sizeValue) / 10n ** 18n
      if (notional < state.marketCfg.minNotional) {
        toast.error(`最小ノーショナルは ${formatQty(state.marketCfg.minNotional)} です`)
        return
      }
    }

    setIsPlacing(true)
    try {
      await placeOrder(isBid, priceValue, sizeValue)
      toast.success(`${isBid ? '買い' : '売り'}注文を送信しました`)
      // Clear form
      setPrice('')
      setSize('')
    } catch (error) {
      console.error('Order placement failed:', error)
      toast.error('注文の送信に失敗しました')
    } finally {
      setIsPlacing(false)
    }
  }

  const handleLongOrder = async () => {
    if (!price || !size) {
      toast.error('価格と数量を入力してください')
      return
    }

    const priceValue = BigInt(Math.floor(parseFloat(price)))
    const sizeValue = BigInt(Math.floor(parseFloat(size) * 1e18))

    // Validate against market config
    if (state.marketCfg) {
      if (sizeValue < state.marketCfg.minQty) {
        toast.error(`最小数量は ${formatQty(state.marketCfg.minQty)} です`)
        return
      }

      const priceWei = priceValue * 10n ** 18n
      const notional = (priceWei * sizeValue) / 10n ** 18n
      if (notional < state.marketCfg.minNotional) {
        toast.error(`最小ノーショナルは ${formatQty(state.marketCfg.minNotional)} です`)
        return
      }
    }

    setIsPlacing(true)
    try {
      await placeLongOrder(priceValue, sizeValue)
      toast.success('ロング注文を送信しました')
      setPrice('')
      setSize('')
    } catch (error) {
      console.error('Long order placement failed:', error)
      toast.error('ロング注文の送信に失敗しました')
    } finally {
      setIsPlacing(false)
    }
  }

  const handleShortOrder = async () => {
    if (!price || !size) {
      toast.error('価格と数量を入力してください')
      return
    }

    const priceValue = BigInt(Math.floor(parseFloat(price)))
    const sizeValue = BigInt(Math.floor(parseFloat(size) * 1e18))

    // Validate against market config
    if (state.marketCfg) {
      if (sizeValue < state.marketCfg.minQty) {
        toast.error(`最小数量は ${formatQty(state.marketCfg.minQty)} です`)
        return
      }

      const priceWei = priceValue * 10n ** 18n
      const notional = (priceWei * sizeValue) / 10n ** 18n
      if (notional < state.marketCfg.minNotional) {
        toast.error(`最小ノーショナルは ${formatQty(state.marketCfg.minNotional)} です`)
        return
      }
    }

    setIsPlacing(true)
    try {
      await placeShortOrder(priceValue, sizeValue)
      toast.success('ショート注文を送信しました')
      setPrice('')
      setSize('')
    } catch (error) {
      console.error('Short order placement failed:', error)
      toast.error('ショート注文の送信に失敗しました')
    } finally {
      setIsPlacing(false)
    }
  }

  // 価格はティック、数量はカード数で計算
  const priceInTicks = price ? Number(price) : 0
  const sizeInCards = size ? parseFloat(size) : 0
  const orderValueInTicks = priceInTicks * sizeInCards

  // USD相当額（仮定: 1ティック = $0.1）
  const orderValueUSD = orderValueInTicks * 0.1
  const fee = orderValueUSD * 0.0005 // 0.05% fee
  const marginRequired = leverage[0] > 0 ? orderValueUSD / leverage[0] : 0

  return (
    <Card>
      <div className="p-4">
        <h3 className="font-semibold mb-4">Perp注文</h3>

        <Tabs value={orderType} onValueChange={setOrderType} className="w-full mb-4">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="limit">指値</TabsTrigger>
            <TabsTrigger value="market">成行</TabsTrigger>
            <TabsTrigger value="stop">ストップ</TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="space-y-4">
          {orderType !== 'market' && (
            <div>
              <label className="text-sm text-muted-foreground">
                価格 (ティック)
                <span className="ml-2 text-xs">※整数値で入力</span>
              </label>
              <Input
                type="number"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                className="font-mono"
                placeholder="3000"
                step="1"
                disabled={isPlacing}
              />
              {price && (
                <div className="text-xs text-muted-foreground mt-1">
                  ≈ ${(Number(price) * 0.1).toFixed(2)} USD相当
                </div>
              )}
            </div>
          )}

          <div>
            <label className="text-sm text-muted-foreground">数量 (カード)</label>
            <Input
              type="number"
              value={size}
              onChange={(e) => setSize(e.target.value)}
              className="font-mono"
              placeholder="1"
              step="0.01"
              disabled={isPlacing}
            />
          </div>

          <div>
            <label className="text-sm text-muted-foreground mb-2 block">
              レバレッジ: {leverage[0]}x
            </label>
            <Slider
              value={leverage}
              onValueChange={setLeverage}
              max={50}
              min={1}
              step={1}
              className="w-full"
              disabled={isPlacing}
            />
          </div>

          <div className="flex items-center justify-between">
            <label className="text-sm">リデュース・オンリー</label>
            <Switch
              checked={reduceOnly}
              onCheckedChange={setReduceOnly}
              disabled={isPlacing}
            />
          </div>

          <div className="flex items-center justify-between">
            <label className="text-sm">ポスト・オンリー</label>
            <Switch
              checked={postOnly}
              onCheckedChange={setPostOnly}
              disabled={isPlacing}
            />
          </div>

          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">注文価値:</span>
              <div className="text-right">
                <div className="font-mono">{orderValueInTicks.toFixed(0)} ティック</div>
                <div className="text-xs text-muted-foreground">≈ ${orderValueUSD.toFixed(2)}</div>
              </div>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">手数料 (推定):</span>
              <span className="font-mono text-xs">${fee.toFixed(4)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">必要証拠金 (推定):</span>
              <span className="font-mono text-xs">${marginRequired.toFixed(2)}</span>
            </div>
          </div>

          {state.marketCfg && (
            <div className="text-xs text-muted-foreground">
              <div>最小数量: {formatQty(state.marketCfg.minQty)}</div>
              <div>最小ノーショナル: ${formatQty(state.marketCfg.minNotional)}</div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2 mt-6">
            <Button
              className="bg-[#FED823] hover:bg-[#FED823]/90 text-black"
              onClick={handleLongOrder}
              disabled={isPlacing || !price || !size}
            >
              <TrendingUp className="w-4 h-4 mr-2" />
              ロング
            </Button>
            <Button
              className="bg-[#EA4F24] hover:bg-[#EA4F24]/90 text-white"
              onClick={handleShortOrder}
              disabled={isPlacing || !price || !size}
            >
              <TrendingDown className="w-4 h-4 mr-2" />
              ショート
            </Button>
          </div>

          <div className="grid grid-cols-2 gap-2 mt-2">
            <Button
              variant="outline"
              onClick={() => handlePlaceOrder(true)}
              disabled={isPlacing || !price || !size}
              className="text-xs"
            >
              <TrendingUp className="w-3 h-3 mr-1" />
              買い注文
            </Button>
            <Button
              variant="outline"
              onClick={() => handlePlaceOrder(false)}
              disabled={isPlacing || !price || !size}
              className="text-xs"
            >
              <TrendingDown className="w-3 h-3 mr-1" />
              売り注文
            </Button>
          </div>
        </div>
      </div>
    </Card>
  )
}