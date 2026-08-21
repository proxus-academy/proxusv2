import { Schema } from "effect"

export class CreateThreadPayload extends Schema.Class<CreateThreadPayload>("CreateThreadPayload")({
  title: Schema.NonEmptyString.pipe(Schema.check(Schema.isMaxLength(200))),
}) {}
export class RenameThreadPayload extends Schema.Class<RenameThreadPayload>("RenameThreadPayload")({
  title: Schema.NonEmptyString.pipe(Schema.check(Schema.isMaxLength(200))),
}) {}

export class StartAgentRunPayload extends Schema.Class<StartAgentRunPayload>("StartAgentRunPayload")({
  message: Schema.NonEmptyString.pipe(Schema.check(Schema.isMaxLength(32_000))),
}) {}
