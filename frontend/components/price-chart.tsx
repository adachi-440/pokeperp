"use client"

import { ComposedChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts"

const mockCandlestickData = [
  { time: "09:00", open: 120.0, high: 122.5, low: 119.5, close: 121.8, volume: 1200 },
  { time: "09:05", open: 121.8, high: 122.3, low: 121.2, close: 122.0, volume: 850 },
  { time: "09:10", open: 122.0, high: 122.8, low: 121.5, close: 122.3, volume: 920 },
  { time: "09:15", open: 122.3, high: 123.0, low: 122.0, close: 122.7, volume: 1100 },
  { time: "09:20", open: 122.7, high: 123.5, low: 122.5, close: 123.2, volume: 1300 },
  { time: "09:25", open: 123.2, high: 123.8, low: 122.8, close: 123.0, volume: 1050 },
  { time: "09:30", open: 123.0, high: 124.0, low: 122.5, close: 123.5, volume: 1500 },
  { time: "09:35", open: 123.5, high: 123.8, low: 122.9, close: 123.2, volume: 780 },
  { time: "09:40", open: 123.2, high: 123.6, low: 122.8, close: 123.0, volume: 890 },
  { time: "09:45", open: 123.0, high: 123.4, low: 122.6, close: 122.8, volume: 950 },
  { time: "09:50", open: 122.8, high: 123.2, low: 122.4, close: 122.6, volume: 870 },
  { time: "09:55", open: 122.6, high: 122.9, low: 122.2, close: 122.5, volume: 810 },
  { time: "10:00", open: 122.5, high: 123.0, low: 121.8, close: 122.0, volume: 980 },
  { time: "10:05", open: 122.0, high: 122.4, low: 121.5, close: 121.8, volume: 1020 },
  { time: "10:10", open: 121.8, high: 122.5, low: 121.6, close: 122.2, volume: 1150 },
  { time: "10:15", open: 122.2, high: 123.0, low: 122.0, close: 122.8, volume: 1280 },
  { time: "10:20", open: 122.8, high: 123.5, low: 122.5, close: 123.2, volume: 1420 },
  { time: "10:25", open: 123.2, high: 124.0, low: 123.0, close: 123.8, volume: 1680 },
  { time: "10:30", open: 123.8, high: 125.0, low: 123.5, close: 124.5, volume: 2100 },
  { time: "10:35", open: 124.5, high: 124.8, low: 124.0, close: 124.3, volume: 1560 },
  { time: "10:40", open: 124.3, high: 124.7, low: 124.1, close: 124.6, volume: 1490 },
  { time: "10:45", open: 124.6, high: 125.2, low: 124.4, close: 125.0, volume: 1620 },
  { time: "10:50", open: 125.0, high: 125.5, low: 124.8, close: 125.3, volume: 1710 },
  { time: "10:55", open: 125.3, high: 125.8, low: 125.0, close: 125.2, volume: 1650 },
  { time: "11:00", open: 125.2, high: 126.0, low: 124.8, close: 125.5, volume: 1800 },
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

export function PriceChart({ symbol }: PriceChartProps) {
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
        <ComposedChart data={mockCandlestickData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }} barGap={0} barCategoryGap={0}>
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
          <ComposedChart data={mockCandlestickData} margin={{ top: 0, right: 30, left: 20, bottom: 5 }} barGap={0} barCategoryGap={0}>
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
              {mockCandlestickData.map((_entry, index) => (
                <Cell key={`cell-${index}`} fill="#FED823" opacity={0.6} />
              ))}
            </Bar>
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
