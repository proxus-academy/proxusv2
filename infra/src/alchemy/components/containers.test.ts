import { describe, expect, test } from "vitest"
import { adminBackendContainer, ContainerConfigurationError, frontendProxyContainer, publicBackendContainer } from "./containers.ts"

const project = "proxus-test"
const location = "europe-southwest1"
const digest = "a".repeat(64)
const image = `${location}-docker.pkg.dev/${project}/proxus/proxus-server@sha256:${digest}`
const webImage = `${location}-docker.pkg.dev/${project}/proxus/proxus-web@sha256:${digest}`

describe("Proxus Cloud Run containers", () => {
  test("builds a public ingress backend with normal and secret environment", () => {
    expect(publicBackendContainer({
      project, location, image, port: 8080, ingress: true,
      config: { NODE_ENV: "production", MAILGUN_DOMAIN: "mail.example.test" },
      secretRefs: [{ name: "DATABASE_URL", secretId: "database-url" }, { name: "MAILGUN_API_KEY", secretId: "mailgun-key", version: "7" }],
    })).toEqual({
      name: "public-api",
      image,
      ports: [{ containerPort: 8080 }],
      env: [
        { name: "DATABASE_URL", valueSource: { secretKeyRef: { secret: "database-url", version: "latest" } } },
        { name: "MAILGUN_API_KEY", valueSource: { secretKeyRef: { secret: "mailgun-key", version: "7" } } },
        { name: "NODE_ENV", value: "production" },
        { name: "MAILGUN_DOMAIN", value: "mail.example.test" },
        { name: "PORT", value: "8080" },
      ],
      resources: { limits: { cpu: "1", memory: "512Mi" }, cpuIdle: true, startupCpuBoost: true },
      startupProbe: { tcpSocket: { port: 8080 }, initialDelaySeconds: 0, timeoutSeconds: 1, periodSeconds: 2, failureThreshold: 30 },
    })
  })

  test("builds an admin sidecar without declaring an ingress port", () => {
    const container = adminBackendContainer({ project, location, image, port: 3001 })
    expect(container).toMatchObject({ name: "admin-api", env: [{ name: "PORT", value: "3001" }] })
    expect(container).not.toHaveProperty("ports")
    expect(JSON.stringify(container)).not.toContain("undefined")
  })

  test("builds public and admin frontend proxies with exact Cloud Run v2 arrays", () => {
    expect(frontendProxyContainer({ project, location, image: webImage, publicApiOrigin: "http://localhost:3000" })).toMatchObject({
      name: "frontend",
      dependsOn: ["public-api"],
      ports: [{ containerPort: 8080 }],
      env: [{ name: "PUBLIC_API_ORIGIN", value: "http://localhost:3000" }],
    })
    expect(frontendProxyContainer({ project, location, image: webImage, publicApiOrigin: "http://localhost:3000", adminApiOrigin: "http://localhost:3001" })).toMatchObject({
      dependsOn: ["public-api", "admin-api"],
      env: [
        { name: "PUBLIC_API_ORIGIN", value: "http://localhost:3000" },
        { name: "ADMIN_API_ORIGIN", value: "http://localhost:3001" },
      ],
    })
  })

  test.each([
    ["tagged image", { image: `${location}-docker.pkg.dev/${project}/proxus/server:latest` }],
    ["foreign registry", { image: `europe-west1-docker.pkg.dev/${project}/proxus/server@sha256:${digest}` }],
    ["secret path", { secretRefs: [{ name: "DATABASE_URL", secretId: "projects/p/secrets/database" }] }],
    ["secret collision", { config: { DATABASE_URL: "not-secret" }, secretRefs: [{ name: "DATABASE_URL", secretId: "database" }] }],
    ["invalid port", { port: 0 }],
  ])("rejects %s", (_label, patch) => {
    expect(() => publicBackendContainer({ project, location, image, port: 8080, ...patch })).toThrow(ContainerConfigurationError)
  })
})
