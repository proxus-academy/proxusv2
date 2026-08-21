import { resolveAssetUrl, type AssetId } from "@proxus/assets"
import { resolveRuntimeBaseUrl, type WebappConfig } from "../config.js"

export const resolveWebappAssetUrl = (
  id: AssetId,
  config: WebappConfig,
  documentBaseUrl: URL,
): URL => resolveAssetUrl(id, resolveRuntimeBaseUrl(config.assetBaseUrl, documentBaseUrl))
