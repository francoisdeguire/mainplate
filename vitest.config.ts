import { defineConfig } from "vitest/config"
import react from "@vitejs/plugin-react"
import { fileURLToPath } from "node:url"

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@/mainplate": fileURLToPath(new URL("./src/mainplate", import.meta.url)) },
  },
  test: { environment: "node", include: ["src/**/*.test.{ts,tsx}"] },
})
