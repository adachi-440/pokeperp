"use client"

import { useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { useOrderBook } from '@/lib/hooks/useOrderBook'
import { formatPrice } from '@/lib/contracts/types'
import { NULL_PRICE } from '@/lib/contracts/config'
import { toast } from 'sonner'
import { Activity, AlertCircle } from 'lucide-react'

export function MatchExecutor() {
  const { state, matchAtBest } = useOrderBook()
  const [steps, setSteps] = useState([16])
  const [isMatching, setIsMatching] = useState(false)

  const isCrossed =
    state.bestBidPrice &&
    state.bestAskPrice &&
    state.bestBidPrice !== BigInt(NULL_PRICE) &&
    state.bestAskPrice !== BigInt(NULL_PRICE) &&
    state.bestBidPrice >= state.bestAskPrice

  const handleMatch = async () => {
    if (!isCrossed) {
      toast.error('板がクロスしていません')
      return
    }

    setIsMatching(true)
    try {
      await matchAtBest(BigInt(steps[0]))
      toast.success(`${steps[0]}ステップのマッチングを実行しました`)
    } catch (error) {
      console.error('Matching failed:', error)
      toast.error('マッチングの実行に失敗しました')
    } finally {
      setIsMatching(false)
    }
  }

  return (
    <Card>
      <div className="p-4">
        <h3 className="font-semibold mb-4 flex items-center gap-2">
          <Activity className="w-4 h-4" />
          マッチエンジン
        </h3>

        <div className="space-y-4">
          {/* Cross Status */}
          <div className="p-3 rounded-lg bg-muted">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">板の状態</span>
              {isCrossed ? (
                <span className="text-xs px-2 py-1 rounded bg-green-500/20 text-green-500">
                  クロス中
                </span>
              ) : (
                <span className="text-xs px-2 py-1 rounded bg-gray-500/20 text-gray-500">
                  正常
                </span>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">最良買値:</span>
                <span className="ml-2 font-mono">
                  {state.bestBidPrice && state.bestBidPrice !== BigInt(NULL_PRICE)
                    ? formatPrice(state.bestBidPrice)
                    : '-'}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground">最良売値:</span>
                <span className="ml-2 font-mono">
                  {state.bestAskPrice && state.bestAskPrice !== BigInt(NULL_PRICE)
                    ? formatPrice(state.bestAskPrice)
                    : '-'}
                </span>
              </div>
            </div>

            {isCrossed && (
              <div className="mt-2 flex items-center gap-2 text-xs text-yellow-500">
                <AlertCircle className="w-3 h-3" />
                <span>板がクロスしています。マッチングが可能です。</span>
              </div>
            )}
          </div>

          {/* Steps Control */}
          <div>
            <label className="text-sm text-muted-foreground mb-2 block">
              マッチングステップ数: {steps[0]}
            </label>
            <Slider
              value={steps}
              onValueChange={setSteps}
              max={64}
              min={1}
              step={1}
              className="w-full"
              disabled={isMatching}
            />
            <div className="flex justify-between text-xs text-muted-foreground mt-1">
              <span>1</span>
              <span>8</span>
              <span>16</span>
              <span>32</span>
              <span>64</span>
            </div>
          </div>

          {/* Preset Buttons */}
          <div className="grid grid-cols-4 gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setSteps([8])}
              disabled={isMatching}
            >
              8
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setSteps([16])}
              disabled={isMatching}
            >
              16
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setSteps([32])}
              disabled={isMatching}
            >
              32
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setSteps([64])}
              disabled={isMatching}
            >
              64
            </Button>
          </div>

          {/* Execute Button */}
          <Button
            className="w-full"
            onClick={handleMatch}
            disabled={!isCrossed || isMatching}
            variant={isCrossed ? 'default' : 'secondary'}
          >
            {isMatching ? (
              <>
                <Activity className="w-4 h-4 mr-2 animate-spin" />
                マッチング中...
              </>
            ) : (
              <>
                <Activity className="w-4 h-4 mr-2" />
                マッチを実行
              </>
            )}
          </Button>

          {/* Info */}
          <div className="text-xs text-muted-foreground">
            <p>• ステップ数が多いほど、より多くの注文をマッチングできます</p>
            <p>• ガス代はステップ数に比例して増加します</p>
            <p>• 誰でもマッチングを実行できます（Keeper機能）</p>
          </div>
        </div>
      </div>
    </Card>
  )
}