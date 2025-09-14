import type React from "react"
import type { Metadata } from "next"
import { GeistSans } from "geist/font/sans"
import { GeistMono } from "geist/font/mono"
import { Analytics } from "@vercel/analytics/next"
import { Suspense } from "react"
import { PrivyProviderWrapper } from "@/components/providers/privy-provider"
import "./globals.css"

export const metadata: Metadata = {
  title: "Perp DEX - Professional Trading",
  description: "Professional perpetual derivatives exchange",
  generator: "v0.app",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className="dark">
      <body className={`font-sans ${GeistSans.variable} ${GeistMono.variable}`}>
        <PrivyProviderWrapper>
          <Suspense fallback={null}>{children}</Suspense>
          <Analytics />
        </PrivyProviderWrapper>
      </body>
    </html>
  )
}
