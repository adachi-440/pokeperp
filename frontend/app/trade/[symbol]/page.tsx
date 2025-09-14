import { TradingInterface } from "@/components/trading-interface"

interface TradePageProps {
  params: {
    symbol: string
  }
}

export default function TradePage({ params }: TradePageProps) {
  return <TradingInterface selectedSymbol={params.symbol} />
}
