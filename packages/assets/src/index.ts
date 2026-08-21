import manifest from "../manifest.json"

export type AssetId = keyof typeof manifest
export type Asset = Readonly<(typeof manifest)[AssetId]>

export const assetManifest: Readonly<Record<AssetId, Asset>> = manifest

export const asset = (id: AssetId): Asset => assetManifest[id]

export const resolveAssetUrl = (id: AssetId, baseUrl: URL): URL =>
  new URL(assetManifest[id].path, baseUrl)
