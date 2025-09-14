"use client"

import { usePrivy } from "@privy-io/react-auth"
import { useAccount } from "wagmi"
import { Button } from "@/components/ui/button"
import { Wallet, LogOut } from "lucide-react"

export function AuthButton() {
  const { ready, authenticated, login, logout } = usePrivy()
  const { address } = useAccount()

  if (!ready) {
    return (
      <Button variant="outline" disabled>
        <Wallet className="mr-2 h-4 w-4" />
        Loading...
      </Button>
    )
  }

  if (authenticated && address) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">
          {address.slice(0, 6)}...{address.slice(-4)}
        </span>
        <Button variant="outline" size="sm" onClick={logout}>
          <LogOut className="h-4 w-4" />
        </Button>
      </div>
    )
  }

  const handleLogin = () => {
    // Privy's login function returns void and handles errors internally
    login()
  }

  return (
    <Button onClick={handleLogin} className="bg-[#FED823] text-black hover:bg-[#FED823]/90">
      <Wallet className="mr-2 h-4 w-4" />
      Connect Wallet
    </Button>
  )
}