"use client"

import { ComposedChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts"

export const mockCandlestickData = [
  { time: "09:00", open: 120, high: 135, low: 25, close: 50, volume: 3200 },
  { time: "09:05", open: 50, high: 145, low: 35, close: 100, volume: 2850 },
  { time: "09:10", open: 100, high: 140, low: 28, close: 120, volume: 3920 },
  { time: "09:15", open: 120, high: 140, low: 80, close: 125, volume: 4100 },
  { time: "09:20", open: 125, high: 160, low: 50, close: 80, volume: 5300 },
  { time: "09:25", open: 80, high: 165, low: 38, close: 58, volume: 3050 },
  { time: "09:30", open: 58, high: 115, low: 25, close: 35, volume: 4200 },
  { time: "09:35", open: 35, high: 120, low: 33, close: 50, volume: 2850 },
  { time: "09:40", open: 50, high: 110, low: 29, close: 45, volume: 3920 },
  { time: "09:45", open: 45, high: 78, low: 35, close: 52, volume: 3100 },
  { time: "09:50", open: 52, high: 111, low: 31, close: 38, volume: 4300 },
  { time: "09:55", open: 38, high: 87, low: 27, close: 43, volume: 2050 },
  { time: "10:00", open: 43, high: 98, low: 34, close: 48, volume: 5200 },
  { time: "10:05", open: 48, high: 65, low: 30, close: 42, volume: 3850 },
  { time: "10:10", open: 42, high: 85, low: 36, close: 55, volume: 2920 },
  { time: "10:15", open: 55, high: 80, low: 28, close: 40, volume: 4100 },
  { time: "10:20", open: 40, high: 90, low: 32, close: 47, volume: 3200 },
  { time: "10:25", open: 47, high: 115, low: 35, close: 50, volume: 2850 },
  { time: "10:30", open: 50, high: 105, low: 29, close: 38, volume: 3920 },
  { time: "10:35", open: 38, high: 110, low: 33, close: 45, volume: 2100 },
  { time: "10:40", open: 45, high: 70, low: 31, close: 41, volume: 4200 },
  { time: "10:45", open: 41, high: 70, low: 26, close: 35, volume: 3850 },
  { time: "10:50", open: 35, high: 110, low: 34, close: 48, volume: 2920 },
  { time: "10:55", open: 48, high: 112, low: 30, close: 42, volume: 3100 },
  { time: "11:00", open: 42, high: 120, low: 28, close: 39, volume: 4300 },
  { time: "11:05", open: 39, high: 120, low: 32, close: 115, volume: 5050 },
]

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
  const bodyHeight = Math.max((bodyBottomRatio - bodyTopRatio) * height, 2)

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
}

export function PriceChart({ symbol }: PriceChartProps) {
  // 変更: 可視データから OHLC を算出し、ヘッダー表示と一致させる
  const visibleData = mockCandlestickData
  const ohlcOpen = visibleData[0]?.open ?? 0
  const ohlcClose = visibleData[visibleData.length - 1]?.close ?? 0
  const ohlcHigh = Math.max(...visibleData.map(d => d.high))
  const ohlcLow = Math.min(...visibleData.map(d => d.low))
  const change = ohlcClose - ohlcOpen
  const changePercent = ohlcOpen !== 0 ? (change / ohlcOpen) * 100 : 0

  // 変更: ローソク用のベースとレンジを作成（low をベースにスタック）
  const chartData = visibleData.map(d => ({
    ...d,
    candleRange: d.high - d.low,
    candleBase: d.low,
  }))

  // 変更: Y軸を可視データ基準で計算
  const span = ohlcHigh - ohlcLow
  const pad = Math.max(span * 0.03, 0.05)
  const yMin = ohlcLow - pad
  const yMax = ohlcHigh + pad

  return (
    <div className="h-full w-full bg-card border border-border rounded-lg p-4 flex flex-col min-h-0">{/* 変更: 縦方向をflex化し、%/h-fullが崩れないようmin-h-0を付与 */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-4">
          <h3 className="text-lg font-semibold text-foreground">{symbol}</h3>
          <div className="flex items-center gap-2 text-sm">{/* 変更: 可視データの OHLC を表示 */}
            <span className="text-muted-foreground">O</span>
            <span style={{ color: "#FED823" }}>{Math.round(ohlcOpen)}</span>
            <span className="text-muted-foreground">H</span>
            <span style={{ color: "#FED823" }}>{Math.round(ohlcHigh)}</span>
            <span className="text-muted-foreground">L</span>
            <span style={{ color: "#FED823" }}>{Math.round(ohlcLow)}</span>
            <span className="text-muted-foreground">C</span>
            <span style={{ color: "#FED823" }}>{Math.round(ohlcClose)}</span>
            <span className="text-muted-foreground ml-2">{change >= 0 ? '+' : ''}{Math.round(change)} ({changePercent >= 0 ? '+' : ''}{Math.round(changePercent)}%)</span>
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
          <ComposedChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }} barGap={0} barCategoryGap={0}>
            <CartesianGrid strokeDasharray="1 1" stroke="hsl(var(--border))" opacity={0.3} />
            <XAxis dataKey="time" stroke="hsl(var(--muted-foreground))" fontSize={11} axisLine={false} tickLine={false} />
            <YAxis
              stroke="hsl(var(--muted-foreground))"
              fontSize={11}
              domain={[yMin, yMax]}
              axisLine={false}
              tickLine={false}
              orientation="right"
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
                return [`$${Math.round(value)}`, name.toUpperCase()]
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
