import { Schema } from "effect"
import { AuthEvent } from "../auth/events.js"

/** Closed catalog of authoritative events accepted by the in-process publisher. */
export const ApplicationEvent = Schema.Union([AuthEvent])
export type ApplicationEvent = typeof ApplicationEvent.Type
