// Pulumi's mock runtime exposes Promise-only initialization APIs.
// @effect-diagnostics asyncFunction:off
import * as pulumi from "@pulumi/pulumi"
import type { MockResourceArgs } from "@pulumi/pulumi/runtime"
import { beforeAll, describe, expect, test } from "vitest"

interface RecordedResource {
  readonly name: string
  readonly type: string
  readonly inputs: Record<string, unknown>
}

const resources: RecordedResource[] = []
const digest = "a".repeat(64)
const image = (project: string, name: string) =>
  `europe-southwest1-docker.pkg.dev/${project}/proxus/${name}@sha256:${digest}`

beforeAll(async () => {
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
              previewDeployerEmail: "preview-deployer@fixture-project.iam.gserviceaccount.com",
            },
            secretOutputNames: [],
          },
        }
      }
      const state = {
        ...inputs,
        name: inputs.name ?? args.name,
        uri: `https://${args.name}.run.app`,
        address: "203.0.113.10",
      }
      return { id: `${args.name}-id`, state }
    },
  }, "proxus-preview", "pr-123", true, "organization")

  pulumi.runtime.setAllConfig({
    "gcp:project": "fixture-project",
    "gcp:region": "europe-southwest1",
    "proxus-preview:applicationRuntimeReady": "true",
    "proxus-preview:deployServices": "true",
    "proxus-preview:prNumber": "123",
    "proxus-preview:iapPrincipal": "group:reviewers@example.test",
    "proxus-preview:databaseSecretId": "preview-database-pr-123",
    "proxus-preview:authSigningSecretId": "auth-signing",
    "proxus-preview:objectStorageSigningSecretId": "object-storage-signing",
    "proxus-preview:productAnalyticsDataset": "product_analytics",
    "proxus-preview:productAnalyticsTable": "events",
    "proxus-preview:publicImage": image("fixture-project", "server"),
    "proxus-preview:adminImage": image("fixture-project", "admin-server"),
    "proxus-preview:webImage": image("fixture-project", "web"),
    "proxus-preview:adminWebImage": image("fixture-project", "admin-web"),
  })
  await import("./preview/index.ts")
  await pulumi.runtime.disconnect()
})

const ofType = (type: string) => resources.filter((resource) => resource.type === type)
const record = (value: unknown): Record<string, unknown> =>
  typeof value === "object" && value !== null ? Object.fromEntries(Object.entries(value)) : {}
const list = (value: unknown): unknown[] => Array.isArray(value) ? value : []

describe("preview Pulumi graph", () => {
  test("uses the exact DIY foundation reference", () => {
    const reference = ofType("pulumi:pulumi:StackReference")
    expect(reference).toHaveLength(1)
    expect(reference[0]?.inputs.name).toBe("organization/proxus-foundation/foundation")
  })

  test("creates a migration job and two IAP services without public IAM", () => {
    expect(ofType("gcp:cloudrunv2/job:Job")).toHaveLength(1)
    expect(ofType("gcp:bigquery/datasetIamMember:DatasetIamMember")).toHaveLength(1)
    const services = ofType("gcp:cloudrunv2/service:Service")
    expect(services).toHaveLength(2)
    expect(services.every(({ inputs }) => inputs.iapEnabled === true)).toBe(true)
    expect(services.every(({ inputs }) => record(inputs.scaling).maxInstanceCount === 1)).toBe(true)

    const serialized = JSON.stringify(resources)
    expect(serialized).not.toContain("allUsers")
    expect(serialized).not.toContain("allAuthenticatedUsers")
  })

  test("models frontend, public API and admin API as named containers", () => {
    const services = ofType("gcp:cloudrunv2/service:Service")
    const containers = services.map(({ inputs }) => list(record(inputs.template).containers).map(record))
    expect(containers.map((value) => value.map(({ name }) => name))).toEqual([
      ["frontend", "public-api"],
      ["frontend", "public-api", "admin-api"],
    ])
    expect(containers[0]?.[0]?.dependsOns).toEqual(["public-api"])
    expect(containers[1]?.[0]?.dependsOns).toEqual(["public-api", "admin-api"])
  })
})
