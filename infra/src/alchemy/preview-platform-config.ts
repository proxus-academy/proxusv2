import * as Data from "effect/Data"
import type { Lease } from "./state/lease-lock.ts"

export interface PreviewPlatformStackConfig {
  readonly project: string
  readonly region: string
  readonly stateBucket: string
  readonly kmsKeyName: string
  readonly instanceName?: string
  readonly lease: Lease
}

class PreviewPlatformStackConfigError extends Data.TaggedError("PreviewPlatformStackConfigError")<{
  readonly message: string
}> {}

const required = (env: NodeJS.ProcessEnv, name: string): string => {
  const value = env[name]?.trim()
  if (value === undefined || value.length === 0) throw new PreviewPlatformStackConfigError({ message: `${name} is required` })
  return value
}

/** Minimal non-secret stack configuration. Lease values come from the external
 * acquire step and must describe the exact stack/stage being executed. */
export const readPreviewPlatformStackConfig = (env: NodeJS.ProcessEnv): PreviewPlatformStackConfig => {
  const expiresAt = Number(required(env, "ALCHEMY_LEASE_EXPIRES_AT"))
  if (!Number.isSafeInteger(expiresAt) || expiresAt <= 0) {
    throw new PreviewPlatformStackConfigError({ message: "ALCHEMY_LEASE_EXPIRES_AT must be a positive integer" })
  }
  const stack = required(env, "ALCHEMY_STACK_NAME")
  if (stack !== "preview-platform") throw new PreviewPlatformStackConfigError({ message: "ALCHEMY_STACK_NAME must be preview-platform" })
  return {
    project: required(env, "GCP_PROJECT_ID"),
    region: required(env, "GCP_REGION"),
    stateBucket: required(env, "ALCHEMY_STATE_BUCKET"),
    kmsKeyName: required(env, "ALCHEMY_STATE_KMS_KEY"),
    ...(env.PREVIEW_PLATFORM_INSTANCE_NAME !== undefined && env.PREVIEW_PLATFORM_INSTANCE_NAME.trim().length > 0
      ? { instanceName: env.PREVIEW_PLATFORM_INSTANCE_NAME.trim() }
      : {}),
    lease: {
      stack,
      stage: required(env, "ALCHEMY_STAGE"),
      owner: required(env, "ALCHEMY_LEASE_OWNER"),
      leaseId: required(env, "ALCHEMY_LEASE_ID"),
      generation: required(env, "ALCHEMY_LEASE_GENERATION"),
      expiresAt,
    },
  }
}
