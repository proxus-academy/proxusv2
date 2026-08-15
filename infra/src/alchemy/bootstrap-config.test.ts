import { describe, expect, test } from "vitest"
import { readBootstrapConfig } from "./bootstrap-config.ts"
const env = { GCP_PROJECT_ID: "proxus-v2", GCP_REGION: "europe-southwest1", ALCHEMY_STATE_BUCKET: "proxus-v2-alchemy-state", ALCHEMY_STATE_KEY_RING_ID: "alchemy-state", ALCHEMY_STATE_CRYPTO_KEY_ID: "alchemy-secrets", GCP_OPERATOR_PRINCIPAL: "user:operator@example.com" }
describe("bootstrap config", () => {
  test("reads physical IDs and operator", () => expect(readBootstrapConfig(env)).toMatchObject({ bucket: "proxus-v2-alchemy-state", keyRingId: "alchemy-state", cryptoKeyId: "alchemy-secrets" }))
  test("rejects another region", () => expect(() => readBootstrapConfig({ ...env, GCP_REGION: "us-central1" })).toThrow("GCP_REGION must be europe-southwest1"))
  test("rejects public and malformed principals", () => expect(() => readBootstrapConfig({ ...env, GCP_OPERATOR_PRINCIPAL: "allUsers" })).toThrow("GCP_OPERATOR_PRINCIPAL"))
})
