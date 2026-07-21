# Effect Cluster

> **Version:** Effect v4 beta. This repository pins `effect@4.0.0-beta.98`; this guide is based on the `4.0.0-beta.98` source snapshot (`3e4abbcb0d0e9a5e82b6b88c7ef7ab69900105ec`). Re-validate code and storage compatibility before every beta upgrade.
>
> **API status:** all APIs imported from `effect/unstable/cluster`, `effect/unstable/rpc`, and `effect/unstable/sql` are **unstable**. Node cluster transports are correspondingly beta integrations. Do not make them part of a public product contract; isolate them behind an application-owned module and an operational rollout flag.

Effect Cluster provides distributed, addressable entities whose typed RPCs can be routed to an active entity instance. It adds distributed-systems failure modes; it is not a transparent replacement for a local service.

## Mental model

- An `Rpc` defines one message's payload, success, and errors as schemas.
- An `Entity` groups RPC definitions under an entity type.
- `entity.client` creates an addressable client function; an entity ID selects a logical instance.
- `entity.toLayer` installs handlers and controls passivation with `maxIdleTime`.
- Handlers for one entity are sequential by default. `Rpc.fork` opts a handler out for concurrent execution.
- Messages are volatile by default. `ClusterSchema.Persisted` opts an RPC into persistence.
- A runner/transport/storage layer supplies routing, membership, message delivery, and persistence.
- `TestRunner.layer` provides a single-process, in-memory runner for tests and development.

Do not infer exactly-once semantics from persistence. Distributed delivery, retries, crashes, and uncertain acknowledgements require idempotent application behavior and explicit consistency decisions.

## Complete entity pattern

```ts
import { NodeClusterSocket, NodeRuntime } from "@effect/platform-node"
import { Effect, Layer, Ref, Schema } from "effect"
import { ClusterSchema, Entity, TestRunner } from "effect/unstable/cluster" // UNSTABLE
import { Rpc } from "effect/unstable/rpc" // UNSTABLE
import type { SqlClient } from "effect/unstable/sql" // UNSTABLE

const CounterId = Schema.String.pipe(Schema.brand("CounterId"))
type CounterId = typeof CounterId.Type

class CounterRejected extends Schema.TaggedErrorClass<CounterRejected>()(
  "CounterRejected",
  { reason: Schema.Literal("NonPositiveAmount") }
) {}

const Increment = Rpc.make("Increment", {
  payload: { amount: Schema.Number },
  success: Schema.Number,
  error: CounterRejected
}).annotate(ClusterSchema.Persisted, true)

const GetCount = Rpc.make("GetCount", {
  success: Schema.Number
})

const Counter = Entity.make("Counter", [Increment, GetCount])

const CounterEntityLive = Counter.toLayer(
  Effect.gen(function*() {
    // In-memory state survives only while this activation lives. If durable
    // state is required, recover/persist it through an application repository.
    const count = yield* Ref.make(0)

    return Counter.of({
      Increment: ({ payload }) =>
        payload.amount <= 0
          ? Effect.fail(new CounterRejected({ reason: "NonPositiveAmount" }))
          : Ref.updateAndGet(count, (n) => n + payload.amount),

      GetCount: () => Ref.get(count).pipe(
        // Safe only because this operation is read-only. It may now overlap
        // with other handlers for this entity.
        Rpc.fork
      )
    })
  }),
  { maxIdleTime: "5 minutes" }
)

const useCounter = (id: CounterId) => Effect.gen(function*() {
  const clientFor = yield* Counter.client
  const counter = clientFor(id)
  const after = yield* counter.Increment({ amount: 1 })
  const current = yield* counter.GetCount()
  return { after, current }
})

declare const SqlClientLayer: Layer.Layer<SqlClient.SqlClient>

const ClusterRuntimeLive = NodeClusterSocket.layer().pipe(
  Layer.provide(SqlClientLayer)
)

const EntitiesLive = Layer.mergeAll(CounterEntityLive)

const ProductionLayer = EntitiesLive.pipe(
  Layer.provide(ClusterRuntimeLive)
)

export const CounterTestLayer = EntitiesLive.pipe(
  Layer.provideMerge(TestRunner.layer)
)

Layer.launch(ProductionLayer).pipe(NodeRuntime.runMain)
```

The ai-docs example marks `GetCount` persisted and `Increment` volatile to demonstrate annotation mechanics. That is not a recommended durability design for a mutable counter: persisting reads while updates are volatile cannot reconstruct state. Classify each message according to replay, durability, and consistency requirements.

## Designing entity interfaces

An entity is worthwhile when its interface gives leverage over placement, serialization, lifecycle, and ordered coordination. Avoid one RPC per repository query: that creates a shallow distributed interface and pays network/storage cost without concentrating behavior.

For every entity type document:

1. identity format and cardinality;
2. ownership/tenant scope encoded or resolved for the ID;
3. RPC schemas and compatibility policy;
4. ordering and concurrency requirements;
5. volatile versus persisted delivery;
6. state source of truth and recovery after passivation/crash;
7. idempotency and deduplication keys;
8. timeout, retry, and backpressure policy;
9. authorization location;
10. passivation and resource limits.

Use stable, namespaced entity and RPC names. Treat schema changes like wire/storage migrations. Add fields compatibly where possible, decode historical persisted messages, and rehearse mixed-version deployments. During v4 beta, an Effect upgrade may also change protocol/storage behavior; snapshot data and test upgrade/rollback before production.

## State, persistence, and delivery

`Ref` state is activation-local. Passivation (`maxIdleTime`), reassignment, process death, or deployment recreates it. Choose one explicit model:

- **Ephemeral coordination:** state may reset; messages can be volatile.
- **Repository-backed state:** the entity serializes decisions but durable state lives in SQL through a repository module.
- **Persisted-message recovery:** persisted RPCs and handlers are designed for replay/deduplication, with a tested retention/compaction strategy.

A persisted message is not synonymous with persisted entity state. Reads normally should not be persisted unless their delivery itself is a durable business requirement. Writes that cross external systems need an outbox/idempotency design; an RPC acknowledgement can be lost after the side effect commits.

Default sequential handlers provide per-entity serialization only. They do not provide a database transaction, global ordering, or ordering across different entity IDs. Use `Rpc.fork` only for operations proven safe to overlap. A read over mutable activation state may race with a forked write and observe a state your product semantics do not allow.

## Lifecycle and operations

### Startup

1. Decode and validate cluster, transport, and SQL configuration before serving traffic.
2. Run required schema migrations explicitly.
3. Build transport/storage layers, then entity handler layers.
4. Start health/readiness only when the runner can safely receive work.
5. Fail startup on missing critical config; never silently fall back from distributed production mode to `TestRunner.layer`.

Use service-local typed `Config` and `Layer.unwrap(Effect.gen(...))` when config constructs a dynamic layer. Critical addresses, ports, database settings, identity, and security material are required; defaults are appropriate only when intentionally safe.

### Runtime

- Bound mailbox/work concurrency and payload sizes.
- Set caller deadlines and propagate cancellation where protocol semantics permit.
- Instrument enqueue/routing/handler/ack phases separately.
- Monitor shard/entity distribution, runner health, rebalances, passivation, retries, persisted backlog, handler latency, and failures.
- Apply load shedding rather than permitting unbounded queues.
- Make rolling deployments compatible with messages emitted by both old and new versions.

### Shutdown

Stop accepting/routing new work, drain within a deadline, preserve/requeue durable messages according to runner semantics, interrupt remaining scoped work, and close transport/storage. Test forced termination during each message phase. `Layer.launch` plus `NodeRuntime.runMain` should own the lifecycle; avoid ad-hoc signal handlers inside entities.

## Error model

Keep these categories distinct:

- **Domain rejection:** schema-declared RPC error, safe for the caller to branch on.
- **Decode/protocol incompatibility:** malformed or version-incompatible envelope/payload/reply.
- **Routing/runner/transport failure:** unavailable runner, socket failure, reassignment, timeout.
- **Message storage failure:** enqueue, lease, acknowledgement, replay, or SQL failure.
- **Handler defect:** invariant violation or unexpected dependency failure.
- **Interruption:** shutdown, cancellation, or ownership movement.
- **Unknown outcome:** caller did not receive a reply and cannot know whether a write ran.

Only retry when the operation and delivery phase make it safe. Domain rejections and decode failures are not transient. Unknown write outcomes require an idempotency key or a read-after-retry reconciliation strategy. Preserve internal causes and safe correlation metadata, but return only declared errors across the RPC interface.

## Authorization and security

The entity ID and schema decoder do not authorize access.

- Authenticate at the ingress and propagate a minimal, verifiable principal/scope claim; re-authorize in the application module used by the handler.
- Never trust tenant/account IDs supplied only in payloads. Resolve ownership and reject cross-scope access.
- Use mutually authenticated, encrypted runner communication and network-level isolation.
- Rotate credentials without restarting into an insecure fallback.
- Constrain payload size, message rate, entity-ID cardinality, and entity activation count to resist resource exhaustion.
- Do not put secrets or unnecessary personal data in entity IDs, persisted envelopes, logs, metrics, or replies.
- Encrypt sensitive persisted messages and define retention/deletion behavior.
- Treat replay as an attack/failure mode: include authorization freshness policy and idempotency/deduplication.
- Keep administrative cluster operations on a separate, least-privilege interface.
- Validate any user-controlled scheduling/delivery time and cap future retention.

## Testing strategy

### Fast entity tests

Use entity layers with `TestRunner.layer`. Test through `Counter.client`, not by calling handler implementation functions. `Layer.provideMerge(TestRunner.layer)` can leave test storage/runner services available for assertions.

Cover:

- schema encode/decode and declared domain errors;
- per-ID isolation and tenant isolation;
- sequential ordering under concurrent callers;
- every `Rpc.fork` race assumption;
- passivation followed by reactivation/recovery;
- duplicate/replayed writes and idempotency;
- cancellation, timeout, and exhausted budgets;
- volatile versus persisted behavior.

### Storage and transport integration

Use temporary SQL, real migrations, and the production message/runner storage adapters. Test lease/ack failure, restart, backlog replay, corrupt/incompatible messages, retention, and transaction failure. Add focused socket tests with multiple local runners for routing, rebalance, disconnect, and rolling-version compatibility.

### Failure and deployment tests

Kill a runner before handler start, during a handler, after durable side effect but before reply, and during acknowledgement. Assert documented outcomes rather than assuming exactly once. Load-test hot entity IDs, high-cardinality IDs, slow handlers, and backpressure. Test upgrade and rollback against a copied message store.

`TestRunner.layer` is not evidence that socket, SQL, or multi-runner behavior works. Production readiness requires all three levels.

## Observability

Use low-cardinality names and safe annotations:

- entity type (not raw entity ID as a metric label);
- RPC name, persisted/volatile, attempt, outcome;
- runner/shard identity with bounded cardinality;
- queue delay, handler duration, reply duration;
- active/passivated entity count, mailbox/backlog size;
- retries, deduplications, unknown outcomes, storage failures.

Traces may carry a hashed/redacted entity correlation value if policy permits. Logs must not contain whole payloads, replies, SQL credentials, or customer content. Ensure context propagation across the transport is tested.

## Anti-patterns

- Assuming persisted RPC means durable state or exactly-once execution.
- Persisting reads while state-changing writes remain volatile without a documented reason.
- Keeping authoritative state only in a `Ref` and expecting it to survive passivation.
- Applying `Rpc.fork` to mutable operations for throughput without race analysis.
- Retrying every failure, especially writes with unknown outcomes.
- Using user-controlled IDs as authorization or allowing unbounded entity cardinality.
- Running production with `TestRunner.layer` or silently falling back to it.
- Exposing unstable cluster types in shared public contracts.
- Changing RPC schemas without persisted-message and rolling-deploy compatibility tests.
- Treating a single-process test as a distributed-systems test.
- Logging payloads or using entity IDs as high-cardinality metric labels.

## Production-readiness checklist

- [ ] Exact Effect beta and adapter versions are pinned and upgrade-tested.
- [ ] Unstable imports are isolated behind an application-owned module.
- [ ] Entity identity, ownership, cardinality, and compatibility are documented.
- [ ] Every RPC is deliberately classified as volatile or persisted.
- [ ] State recovery and passivation behavior are explicit and tested.
- [ ] Writes are idempotent or have an unknown-outcome reconciliation strategy.
- [ ] Sequential versus forked execution is justified per RPC.
- [ ] Typed required config fails startup; no production fallback to test layers exists.
- [ ] Auth/scope is rechecked inside handler dependencies.
- [ ] Backpressure, timeout, retry, shutdown, retention, and encryption are defined.
- [ ] TestRunner, SQL integration, multi-runner, failure-injection, and upgrade tests exist.
- [ ] Safe traces/metrics/logs cover routing, storage, handlers, and lifecycle.

## Source map

| Guidance | Primary source |
|---|---|
| RPC definitions, persisted annotation, entity layer/client, sequential default, `Rpc.fork`, passivation | `effect-smol/ai-docs/src/80_cluster/10_entities.ts` |
| Single-process testing and production layer composition | same ai-docs entity example |
| Concrete unstable cluster modules and semantics | `packages/effect/src/unstable/cluster/*` |
| RPC and SQL seams | `packages/effect/src/unstable/rpc/*`, `packages/effect/src/unstable/sql/*` |
| Node transport integration | `packages/platform-node/src/NodeClusterSocket.ts` and related Node cluster modules |
| Service-local startup configuration | `.agents/skills/effect-service-config/references/config-rules.md` |

The local paths above are under `.repos/effect-smol/` at commit `3e4abbcb0d0e9a5e82b6b88c7ef7ab69900105ec`. Delivery caveats, security controls, lifecycle procedure, failure testing, and production checklist are project-oriented distributed-systems rules; they are not automatic guarantees of the unstable API.
