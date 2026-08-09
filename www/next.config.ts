import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import type { NextConfig } from "next"

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..")

const config: NextConfig = {
  // The library is consumed as source from `../src/mainplate`, outside www/.
  // Turbopack resolves nothing above its root, so the root has to be the repo,
  // not www/. Next infers this correctly today, but the inference keys off
  // lockfile and workspace layout — stating it outright means a future change
  // to either cannot silently break the cross-boundary import.
  turbopack: { root: repoRoot },
}

export default config
