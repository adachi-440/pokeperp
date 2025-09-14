"use client"

import { ComposedChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts"

const mockCandlestickData = [
  { time: "09:00", open: 120.0, high: 122.5, low: 119.5, close: 121.8, volume: 1200 },
  { time: "09:30", open: 121.8, high: 124.0, low: 121.0, close: 123.2, volume: 1500 },
  { time: "10:00", open: 123.2, high: 123.8, low: 120.5, close: 121.0, volume: 980 },
  { time: "10:30", open: 121.0, high: 125.0, low: 120.8, close: 124.5, volume: 2100 },
  { time: "11:00", open: 124.5, high: 126.0, low: 123.5, close: 125.2, volume: 1800 },
  { time: "11:30", open: 125.2, high: 125.8, low: 122.0, close: 122.5, volume: 1400 },
  { time: "12:00", open: 122.5, high: 127.0, low: 122.0, close: 126.8, volume: 2500 },
  { time: "12:30", open: 126.8, high: 128.5, low: 126.0, close: 127.5, volume: 1900 },
  { time: "13:00", open: 127.5, high: 128.0, low: 124.0, close: 124.8, volume: 1600 },
  { time: "13:30", open: 124.8, high: 129.0, low: 124.5, close: 128.2, volume: 2200 },
  { time: "14:00", open: 128.2, high: 129.5, low: 126.0, close: 127.0, volume: 1750 },
]

const CustomCandlestick = (props: any) => {
  const { payload, x, y, width, height } = props
  if (!payload) return null

  const { open, high, low, close } = payload
  const isGreen = close >= open
  const color = isGreen ? "#FED823" : "#EA4F24"

  // Calculate positions
  const bodyHeight = Math.abs(close - open) * (height / (payload.high - payload.low))
  const bodyY = y + Math.max(high - Math.max(open, close)) * (height / (high - low))
  const wickTop = y + (high - Math.max(open, close)) * (height / (high - low))
  const wickBottom = y + height - (Math.min(open, close) - low) * (height / (high - low))

  return (
    <g>
      {/* High-Low wick */}
      <line x1={x + width / 2} y1={y} x2={x + width / 2} y2={y + height} stroke={color} strokeWidth={1} />
      {/* Open-Close body */}
      <rect
        x={x + width * 0.2}
        y={bodyY}
        width={width * 0.6}
        height={Math.max(bodyHeight, 1)}
        fill={color}
        stroke={color}
        strokeWidth={1}
      />
    </g>
  )
}

interface PriceChartProps {
  symbol: string
  timeframe: string
}

export function PriceChart({ symbol, timeframe }: PriceChartProps) {
  return (
    <div className="h-96 w-full bg-card border border-border rounded-lg p-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-4">
          <h3 className="text-lg font-semibold text-foreground">{symbol}</h3>
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">O</span>
            <span style={{ color: "#FED823" }}>127.0</span>
            <span className="text-muted-foreground">H</span>
            <span style={{ color: "#FED823" }}>129.5</span>
            <span className="text-muted-foreground">L</span>
            <span style={{ color: "#FED823" }}>126.0</span>
            <span className="text-muted-foreground">C</span>
            <span style={{ color: "#FED823" }}>127.0</span>
            <span className="text-muted-foreground ml-2">+1.2 (+0.95%)</span>
          </div>
        </div>
        <div className="flex gap-2">
          <button className="px-2 py-1 text-xs bg-muted text-muted-foreground rounded">5m</button>
          <button className="px-2 py-1 text-xs bg-primary text-primary-foreground rounded">1h</button>
          <button className="px-2 py-1 text-xs bg-muted text-muted-foreground rounded">D</button>
        </div>
      </div>

      <ResponsiveContainer width="100%" height="70%">
        <ComposedChart data={mockCandlestickData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }} maxBarSize={8}>
          <CartesianGrid strokeDasharray="1 1" stroke="hsl(var(--border))" opacity={0.3} />
          <XAxis dataKey="time" stroke="hsl(var(--muted-foreground))" fontSize={11} axisLine={false} tickLine={false} />
          <YAxis
            stroke="hsl(var(--muted-foreground))"
            fontSize={11}
            domain={["dataMin - 2", "dataMax + 2"]}
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
              return [`$${value.toFixed(2)}`, name.toUpperCase()]
            }}
            labelFormatter={(label) => `Time: ${label}`}
          />
          {/* Custom candlestick bars */}
          <Bar dataKey="high" fill="transparent" shape={<CustomCandlestick />} />
        </ComposedChart>
      </ResponsiveContainer>

      <div className="h-20 w-full mt-2">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={mockCandlestickData} margin={{ top: 0, right: 30, left: 20, bottom: 5 }} maxBarSize={8}>
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
              {mockCandlestickData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill="#FED823" opacity={0.6} />
              ))}
            </Bar>
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
