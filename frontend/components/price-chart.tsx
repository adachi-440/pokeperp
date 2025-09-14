"use client"

import { ComposedChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, LineChart, Line } from "recharts"
import { usePriceHistory } from "@/hooks/usePriceHistory"

const CustomCandlestick = (props: any) => {
  const { x, y, width, height, payload } = props
  if (!payload) return null

  const { open, high, low, close } = payload
  const isGreen = close >= open
  const color = isGreen ? "#FED823" : "#EA4F24"

  // 変更: y は high の位置、height は (high-low) が入る前提で実体位置を計算
  const range = Math.max(high - low, 0.000001)
  const bodyTop = Math.max(open, close)
  const bodyBottom = Math.min(open, close)
  const bodyTopRatio = (high - bodyTop) / range
  const bodyBottomRatio = (high - bodyBottom) / range
  const bodyY = y + bodyTopRatio * height
  const bodyHeight = Math.max((bodyBottomRatio - bodyTopRatio) * height, 2) * 3

  // 変更: ローソク幅をやや太めに中央寄せ
  const bodyWidth = Math.max(Math.floor(width * 0.8), 5)
  const bodyX = x + (width - bodyWidth) / 2

  return (
    <g>
      {/* High-Low wick - バー全体の高さ */}
      <line x1={x + width / 2} y1={y} x2={x + width / 2} y2={y + height} stroke={color} strokeWidth={2} />
      {/* Open-Close body */}
      <rect
        x={bodyX}
        y={bodyY}
        width={bodyWidth}
        height={bodyHeight}
        fill={color}
        stroke={color}
        strokeWidth={1}
      />
    </g>
  )
}

interface PriceChartProps {
  symbol: string
  bestBidPrice: bigint | null
  bestAskPrice: bigint | null
}

export function PriceChart({ symbol, bestBidPrice, bestAskPrice }: PriceChartProps) {
  const { priceData, candlestickDataLive, currentMidPrice } = usePriceHistory({
    bestBidPrice,
    bestAskPrice,
    updateInterval: 5000, // 5秒間隔で更新
  })

  // データがない場合のフォールバック
  const visibleData = candlestickDataLive.length > 0 ? candlestickDataLive : [
    { time: new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' }), open: currentMidPrice || 100, high: currentMidPrice || 100, low: currentMidPrice || 100, close: currentMidPrice || 100, volume: 0 }
  ]

  // 最新（右端）ローソクのOHLCをヘッダー表示・ローソクへ反映
  const lastCandle = visibleData[visibleData.length - 1]
  const ohlcOpen = lastCandle?.open ?? 0
  const ohlcClose = lastCandle?.close ?? 0
  const ohlcHigh = lastCandle?.high ?? 0
  const ohlcLow = lastCandle?.low ?? 0
  const change = ohlcClose - ohlcOpen
  const changePercent = ohlcOpen !== 0 ? (change / ohlcOpen) * 100 : 0

  // 変更: ローソク用のベースとレンジを作成（low をベースにスタック）
  const chartData = visibleData.map(d => ({
    ...d,
    candleRange: d.high - d.low,
    candleBase: d.low,
  }))

  // 変更: Y軸を可視データ基準で自動調整
  // 値動きが小さい場合でも見やすいように最小レンジと余白を確保
  // スケールは可視データ全体で決定
  const dataHigh = visibleData.length > 0 ? Math.max(...visibleData.map(d => d.high)) : 0
  const dataLow = visibleData.length > 0 ? Math.min(...visibleData.map(d => d.low)) : 0
  const rawSpan = dataHigh - dataLow
  const minSpan = 2.0 // 最小表示レンジ（価格がほぼ動かない時に拡大）
  const effSpan = Math.max(rawSpan, minSpan)
  const pad = Math.max(effSpan * 0.1, 0.1) // 上下に10%（最低0.1）余白
  const center = (dataHigh + dataLow) / 2
  // 5倍拡大（縦方向ズームイン）: 表示レンジと余白を1/5に縮小
  const zoom = 5
  const yMin = center - (effSpan / 2) / zoom - pad / zoom
  const yMax = center + (effSpan / 2) / zoom + pad / zoom

  return (
    <div className="h-full min-h-[520px] w-full bg-card border border-border rounded-lg p-4 flex flex-col">{/* 変更: 最低縦幅を拡大 */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-4">
          <h3 className="text-lg font-semibold text-foreground">{symbol}</h3>
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Mid</span>
            <span style={{ color: "#FED823" }}>{currentMidPrice ? currentMidPrice.toFixed(2) : 'N/A'}</span>
            {visibleData.length > 0 && (
              <>
                <span className="text-muted-foreground ml-2">O</span>
                <span style={{ color: "#FED823" }}>{ohlcOpen.toFixed(2)}</span>
                <span className="text-muted-foreground">H</span>
                <span style={{ color: "#FED823" }}>{ohlcHigh.toFixed(2)}</span>
                <span className="text-muted-foreground">L</span>
                <span style={{ color: "#FED823" }}>{ohlcLow.toFixed(2)}</span>
                <span className="text-muted-foreground">C</span>
                <span style={{ color: "#FED823" }}>{ohlcClose.toFixed(2)}</span>
                <span className="text-muted-foreground ml-2">{change >= 0 ? '+' : ''}{change.toFixed(2)} ({changePercent >= 0 ? '+' : ''}{changePercent.toFixed(2)}%)</span>
              </>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          <button className="px-2 py-1 text-xs bg-muted text-muted-foreground rounded">5m</button>
          <button className="px-2 py-1 text-xs bg-primary text-primary-foreground rounded">1h</button>
          <button className="px-2 py-1 text-xs bg-muted text-muted-foreground rounded">D</button>
        </div>
      </div>

      <div className="flex-1 min-h-0">{/* 変更: 価格チャート領域を伸縮させる */}
        <ResponsiveContainer width="100%" height="100%">{/* 変更: 伸縮領域に対して100%で安定 */}
          <ComposedChart data={chartData} margin={{ top: 5, right: 72, left: 20, bottom: 5 }} barGap={0} barCategoryGap={0}>
            <CartesianGrid strokeDasharray="1 1" stroke="hsl(var(--border))" opacity={0.3} />
            <XAxis
              dataKey="time"
              stroke="hsl(var(--muted-foreground))"
              fontSize={11}
              axisLine={false}
              tickLine={false}
              tick={{ fill: '#ffffff' }}
            />
            <YAxis
              stroke="hsl(var(--muted-foreground))"
              fontSize={12}
              domain={[yMin, yMax]}
              allowDataOverflow
              axisLine={false}
              tickLine={false}
              orientation="right"
              width={64}
              tick={{ fill: '#e5e7eb', opacity: 1 }}
              tickMargin={8}
              tickFormatter={(v: number) => v.toFixed(2)}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "hsl(var(--popover))",
                border: "1px solid hsl(var(--border))",
                borderRadius: "6px",
                color: "hsl(var(--popover-foreground))",
                fontSize: "12px",
              }}
              formatter={(value: number, name: string) => {
                if (name === "volume") return [`${value.toLocaleString()}`, "Volume"]
                return [`${value.toFixed(2)}`, name.toUpperCase()]
              }}
              labelFormatter={(label) => `Time: ${label}`}
            />
            {/* 変更: low を不可視ベース、(high-low) をカスタムシェイプで描画 */}
            <Bar dataKey="candleBase" stackId="candle" fill="transparent" stroke="transparent" isAnimationActive={false} />
            <Bar dataKey="candleRange" stackId="candle" fill="transparent" shape={<CustomCandlestick />} isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div className="h-20 w-full mt-2 shrink-0">{/* 変更: 出来高は固定高で下部に固定 */}
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={visibleData} margin={{ top: 0, right: 30, left: 20, bottom: 5 }} barGap={0} barCategoryGap={0}>
            <XAxis
              dataKey="time"
              stroke="hsl(var(--muted-foreground))"
              fontSize={10}
              axisLine={false}
              tickLine={false}
              tick={false}
            />
            <YAxis
              stroke="hsl(var(--muted-foreground))"
              fontSize={10}
              axisLine={false}
              tickLine={false}
              orientation="right"
            />
            <Bar dataKey="volume" radius={[1, 1, 0, 0]}>
              {visibleData.map((_entry, index) => (
                <Cell key={`cell-${index}`} fill="#FED823" opacity={0.6} />
              ))}
            </Bar>
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
