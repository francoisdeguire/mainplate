import type { ReactNode } from "react"
import "./globals.css"

export const metadata = { title: "mainplate — lab" }

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-surface text-ink antialiased">{children}</body>
    </html>
  )
}
