"use client"

import { PrivyProvider } from "@privy-io/react-auth"
import { WagmiProvider, createConfig } from "@privy-io/wagmi"
import { arbitrumSepolia, foundry } from "viem/chains"
import { http } from "wagmi"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"

const wagmiConfig = createConfig({
  chains: [arbitrumSepolia, foundry],
  transports: {
    [arbitrumSepolia.id]: http(),
    [foundry.id]: http(),
  },
})

const queryClient = new QueryClient()

export function PrivyProviderWrapper({ children }: { children: React.ReactNode }) {
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID

  if (!appId) {
    console.error("NEXT_PUBLIC_PRIVY_APP_ID is not configured. Please add it to your .env.local file.")
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="text-center">
          <h2 className="text-xl font-semibold text-foreground mb-2">Configuration Error</h2>
          <p className="text-muted-foreground">Privy App ID is not configured.</p>
          <p className="text-sm text-muted-foreground mt-2">Please add NEXT_PUBLIC_PRIVY_APP_ID to your .env.local file.</p>
        </div>
      </div>
    )
  }

  return (
    <PrivyProvider
      appId={appId}
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