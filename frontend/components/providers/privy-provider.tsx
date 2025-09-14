"use client"

import { PrivyProvider } from "@privy-io/react-auth"
import { WagmiProvider, createConfig } from "@privy-io/wagmi"
import { mainnet, sepolia, baseSepolia } from "viem/chains"
import { http } from "wagmi"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"

const wagmiConfig = createConfig({
  chains: [mainnet, sepolia, baseSepolia],
  transports: {
    [mainnet.id]: http(),
    [sepolia.id]: http(),
    [baseSepolia.id]: http(),
  },
})

const queryClient = new QueryClient()

export function PrivyProviderWrapper({ children }: { children: React.ReactNode }) {
  return (
    <PrivyProvider
      appId={process.env.NEXT_PUBLIC_PRIVY_APP_ID || ""}
      config={{
        appearance: {
          theme: "dark",
          accentColor: "#FED823",
        },
        loginMethods: ["email", "wallet"],
        embeddedWallets: {
          createOnLogin: "users-without-wallets",
        },
      }}
    >
      <QueryClientProvider client={queryClient}>
        <WagmiProvider config={wagmiConfig}>{children}</WagmiProvider>
      </QueryClientProvider>
    </PrivyProvider>
  )
}