import { GoogleSessionIssuer } from "@proxus/backend-domain/auth/google-live"
import { Effect, Layer } from "effect"
import { OpaqueSessions } from "./sessions.js"

export const GoogleSessionIssuerLive = Layer.effect(GoogleSessionIssuer, Effect.map(OpaqueSessions, (sessions) =>
  GoogleSessionIssuer.of({ issue: sessions.create }),
))
