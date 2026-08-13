// Pulumi's mock runtime exposes Promise-only initialization APIs.
// @effect-diagnostics asyncFunction:off nodeBuiltinImport:off
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import * as pulumi from "@pulumi/pulumi"
import type { MockResourceArgs } from "@pulumi/pulumi/runtime"
import { afterAll, beforeAll, describe, expect, test } from "vitest"

interface RecordedResource {
  readonly name: string
  readonly type: string
  readonly inputs: Record<string, unknown>
}

const resources: RecordedResource[] = []
const webDist = mkdtempSync(join(tmpdir(), "proxus-production-web-"))
const digest = "b".repeat(64)
const image = (name: string) =>
  `europe-southwest1-docker.pkg.dev/fixture-project/proxus/${name}@sha256:${digest}`

beforeAll(async () => {
  writeFileSync(join(webDist, "index.html"), "<!doctype html><title>fixture</title>")
  await pulumi.runtime.setMocks({
    call: (args) => args.inputs,
    newResource: (args: MockResourceArgs) => {
      const inputs: Record<string, unknown> = args.inputs
      resources.push({ name: args.name, type: args.type, inputs })
      if (args.type === "pulumi:pulumi:StackReference") {
        return {
          id: inputs.name as string,
          state: {
            ...inputs,
            outputs: {
              projectNumber: "123456789",
              productionDeployerEmail: "production-deployer@fixture-project.iam.gserviceaccount.com",
            },
            secretOutputNames: [],
          },
        }
      }
      return {
        id: `${args.name}-id`,
        state: {
          ...inputs,
          name: inputs.name ?? args.name,
          uri: `https://${args.name}.run.app`,
          address: "203.0.113.11",
          ...(args.type === "gcp:projects/serviceIdentity:ServiceIdentity"
            ? { member: "serviceAccount:service-123456789@cloud-cdn-fill.iam.gserviceaccount.com" }
            : {}),
        },
      }
    },
  }, "proxus-production", "production", true, "organization")

  pulumi.runtime.setAllConfig({
    "gcp:project": "fixture-project",
    "gcp:region": "europe-southwest1",
    "proxus-production:applicationRuntimeReady": "true",
    "proxus-production:deployServices": "true",
    "proxus-production:domain": "app.example.test",
    "proxus-production:iapPrincipal": "group:admins@example.test",
    "proxus-production:databaseSecretId": "production-database",
    "proxus-production:authSigningSecretId": "auth-signing",
    "proxus-production:objectStorageSigningSecretId": "object-storage-signing",
    "proxus-production:productAnalyticsDataset": "product_analytics",
    "proxus-production:productAnalyticsTable": "events",
    "proxus-production:publicImage": image("server"),
    "proxus-production:adminImage": image("admin-server"),
    "proxus-production:adminWebImage": image("admin-web"),
    "proxus-production:webDistPath": webDist,
    "proxus-production:websiteBucketName": "proxus-production-web-fixture",
  })
  await import("./index.ts")
  await pulumi.runtime.disconnect()
})

afterAll(() => rmSync(webDist, { recursive: true, force: true }))

const ofType = (type: string) => resources.filter((resource) => resource.type === type)
const record = (value: unknown): Record<string, unknown> =>
  typeof value === "object" && value !== null ? Object.fromEntries(Object.entries(value)) : {}
const list = (value: unknown): unknown[] => Array.isArray(value) ? value : []

describe("production Pulumi graph", () => {
  test("uses the exact DIY foundation reference and migration-before-services graph", () => {
    expect(ofType("pulumi:pulumi:StackReference")[0]?.inputs.name)
      .toBe("organization/proxus-foundation/foundation")
    expect(ofType("gcp:cloudrunv2/job:Job")).toHaveLength(1)
    expect(ofType("gcp:cloudrunv2/service:Service")).toHaveLength(2)
  })

  test("keeps the website private and routes /api through the serverless backend", () => {
    const bucket = ofType("gcp:storage/bucket:Bucket")[0]
    expect(bucket?.inputs.publicAccessPrevention).toBe("enforced")
    expect(bucket?.inputs.uniformBucketLevelAccess).toBe(true)
    expect(record(bucket?.inputs.versioning).enabled).toBe(true)

    const reader = ofType("gcp:storage/bucketIAMMember:BucketIAMMember")
      .find(({ name }) => name === "website-load-balancer-reader")
    expect(reader?.inputs.member).toBe("serviceAccount:service-123456789@cloud-cdn-fill.iam.gserviceaccount.com")

    const urlMap = ofType("gcp:compute/uRLMap:URLMap")[0]
    const matcher = record(list(urlMap?.inputs.pathMatchers)[0])
    const route = record(list(matcher.routeRules)[0])
    expect(record(list(route.matchRules)[0]).prefixMatch).toBe("/api")
    expect(record(record(route.routeAction).urlRewrite).pathPrefixRewrite).toBe("/")
  })

  test("protects admin with direct IAP and never grants public IAM", () => {
    const admin = ofType("gcp:cloudrunv2/service:Service").find(({ name }) => name === "admin")
    expect(admin?.inputs.iapEnabled).toBe(true)
    const containers = list(record(admin?.inputs.template).containers).map(record)
    expect(containers.map(({ name }) => name)).toEqual(["frontend", "public-api", "admin-api"])
    expect(containers[0]?.dependsOns).toEqual(["public-api", "admin-api"])

    expect(ofType("gcp:bigquery/datasetIamMember:DatasetIamMember")).toHaveLength(2)

    const serialized = JSON.stringify(resources)
    expect(serialized).not.toContain("allUsers")
    expect(serialized).not.toContain("allAuthenticatedUsers")
  })
})
