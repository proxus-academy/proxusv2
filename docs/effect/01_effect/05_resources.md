> Portado de [`Effect-TS/effect/ai-docs/src/01_effect/05_resources`](https://github.com/Effect-TS/effect/tree/b49284193f86737e411dc3dd19cfb1a8b9fa5d95/ai-docs/src/01_effect/05_resources) en el commit `b49284193f86737e411dc3dd19cfb1a8b9fa5d95` (licencia MIT).
> Upstream usa Effect `4.0.0-beta.101`; Proxus usa `4.0.0-beta.100`. Verifica los tipos instalados antes de adoptar un ejemplo.


## Managing resources and `Scope`s

Learn how to safely manage resources in Effect using `Scope`s and finalizers.

## Acquiring resources with Effect.acquireRelease

Source: `01_effect/05_resources/10_acquire-release.ts`.

```ts
/**
 * @title Acquiring resources with Effect.acquireRelease
 *
 * Define a service that uses `Effect.acquireRelease` to manage the lifecycle of
 * a resource, ensuring that it is properly cleaned up when the service is no
 * longer needed.
 */
import { Config, Context, Effect, Layer, Redacted, Schema } from "effect"
import * as NodeMailer from "nodemailer"

export class SmtpError extends Schema.ErrorClass<SmtpError>("SmtpError")({
  cause: Schema.Defect()
}) {}

export class Smtp extends Context.Service<Smtp, {
  send(message: {
    readonly to: string
    readonly subject: string
    readonly body: string
  }): Effect.Effect<void, SmtpError>
}>()("app/Smtp") {
  static readonly layer = Layer.effect(
    Smtp,
    Effect.gen(function*() {
      const user = yield* Config.string("SMTP_USER")
      const pass = yield* Config.redacted("SMTP_PASS")

      // Use `Effect.acquireRelease` to manage the lifecycle of the SMTP
      // transporter.
      //
      // When the Layer is built, the transporter will be created. When the
      // Layer is torn down, the transporter will be closed, ensuring that
      // resources are always cleaned up properly.
      const transporter = yield* Effect.acquireRelease(
        Effect.sync(() =>
          NodeMailer.createTransport({
            host: "smtp.example.com",
            port: 587,
            secure: false,
            auth: { user, pass: Redacted.value(pass) }
          })
        ),
        (transporter) => Effect.sync(() => transporter.close())
      )

      const send = Effect.fn("Smtp.send")((message: {
        readonly to: string
        readonly subject: string
        readonly body: string
      }) =>
        Effect.tryPromise({
          try: () =>
            transporter.sendMail({
              from: "Acme Cloud <cloud@acme.com>",
              to: message.to,
              subject: message.subject,
              text: message.body
            }),
          catch: (cause) => new SmtpError({ cause })
        }).pipe(
          Effect.asVoid
        )
      )

      return Smtp.of({ send })
    })
  )
}

// We can then use the `Smtp` service in another service, and the transporter
// will be properly managed by the Layer system.

export class MailerError extends Schema.TaggedErrorClass<MailerError>()("MailerError", {
  reason: SmtpError
}) {}

export class Mailer extends Context.Service<Mailer, {
  sendWelcomeEmail(to: string): Effect.Effect<void, MailerError>
}>()("app/Mailer") {
  static readonly layerNoDeps = Layer.effect(
    Mailer,
    Effect.gen(function*() {
      const smtp = yield* Smtp

      const sendWelcomeEmail = Effect.fn("Mailer.sendWelcomeEmail")(function*(to: string) {
        yield* smtp.send({
          to,
          subject: "Welcome to Acme Cloud!",
          body: "Thanks for signing up for Acme Cloud. We're glad to have you!"
        }).pipe(
          Effect.mapError((reason) => new MailerError({ reason }))
        )
        yield* Effect.logInfo(`Sent welcome email to ${to}`)
      })

      return Mailer.of({ sendWelcomeEmail })
    })
  )

  // Locally provide the Smtp layer to the Mailer layer, to eliminate all the
  // requirements
  static readonly layer = this.layerNoDeps.pipe(
    Layer.provide(Smtp.layer)
  )
}
```

## Creating Layers that run background tasks

Source: `01_effect/05_resources/20_layer-side-effects.ts`.

```ts
/**
 * @title Creating Layers that run background tasks
 *
 * Use Layer.effectDiscard to encapsulate background tasks without a service interface.
 */
import { NodeRuntime } from "@effect/platform-node"
import { Effect, Layer } from "effect"

// Use Layer.effectDiscard when you want to create a layer that runs an effect
// but does not provide any services.
const BackgroundTask = Layer.effectDiscard(Effect.gen(function*() {
  yield* Effect.logInfo("Starting background task...")

  yield* Effect.gen(function*() {
    while (true) {
      yield* Effect.sleep("5 seconds")
      yield* Effect.logInfo("Background task running...")
    }
  }).pipe(
    Effect.onInterrupt(() => Effect.logInfo("Background task interrupted: layer scope closed")),
    Effect.forkScoped
  )
}))

// Run the background task layer. It will start when the layer is launched and
// will be automatically interrupted when the layer scope is closed (e.g. when
// the program exits).
BackgroundTask.pipe(
  Layer.launch,
  NodeRuntime.runMain
)
```

## Dynamic resources with LayerMap

Source: `01_effect/05_resources/30_layer-map.ts`.

```ts
/**
 * @title Dynamic resources with LayerMap
 *
 * Use `LayerMap.Service` to dynamically build and manage resources that are
 * keyed by some identifier, such as a tenant ID.
 */
import { Context, Effect, Layer, LayerMap, Schema } from "effect"

class DatabaseQueryError extends Schema.TaggedErrorClass<DatabaseQueryError>()("DatabaseQueryError", {
  tenantId: Schema.String,
  cause: Schema.Defect()
}) {}

type UserRecord = {
  readonly id: number
  readonly email: string
}

let nextConnectionId = 0

export class DatabasePool extends Context.Service<DatabasePool, {
  readonly tenantId: string
  readonly connectionId: number
  readonly query: (sql: string) => Effect.Effect<ReadonlyArray<UserRecord>, DatabaseQueryError>
}>()("app/DatabasePool") {
  // A layer factory that builds one pool per tenant.
  static readonly layer = (tenantId: string) =>
    Layer.effect(
      DatabasePool,
      Effect.acquireRelease(
        Effect.sync(() => {
          const connectionId = ++nextConnectionId

          return DatabasePool.of({
            tenantId,
            connectionId,
            query: Effect.fn("DatabasePool.query")((_sql: string) =>
              Effect.succeed([
                { id: 1, email: `admin@${tenantId}.example.com` },
                { id: 2, email: `ops@${tenantId}.example.com` }
              ])
            )
          })
        }),
        (pool) => Effect.logInfo(`Closing tenant pool ${pool.tenantId}#${pool.connectionId}`)
      )
    )
}

// extend `LayerMap.Service` to create a `LayerMap` service
export class PoolMap extends LayerMap.Service<PoolMap>()("app/PoolMap", {
  // `lookup` tells LayerMap how to build a layer for each tenant key.
  lookup: (tenantId: string) => DatabasePool.layer(tenantId),

  // You can also use the layers option for a static set of layers
  // layers: {
  //   acme: DatabasePool.layer("acme"),
  //   globex: DatabasePool.layer("globex")
  // },

  // If a pool is not used for this duration, it is released automatically.
  idleTimeToLive: "1 minute"
}) {}

const queryUsersForCurrentTenant = Effect.gen(function*() {
  // Run a query agnostic of the tenant. The correct pool will be provided by
  // the LayerMap.
  const pool = yield* DatabasePool
  return yield* pool.query("SELECT id, email FROM users ORDER BY id")
})

export const program = Effect.gen(function*() {
  yield* queryUsersForCurrentTenant.pipe(
    // Use `PoolMap.get` to access the pool for a specific tenant. The first
    // time this is called for a tenant, the pool will be built using the
    // `lookup` function defined in `PoolMap`. Subsequent calls will reuse the
    // cached pool until it is idle for too long or invalidated.
    Effect.provide(PoolMap.get("acme"))
  )

  // `PoolMap.invalidate` forces a key to rebuild on the next access.
  yield* PoolMap.invalidate("acme")
}).pipe(
  // Provide the `PoolMap` layer to the entire program.
  Effect.provide(PoolMap.layer)
)
```
