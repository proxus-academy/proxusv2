# Secret Manager provider scope

This internal provider manages only secret metadata and additive IAM membership. Secret payloads are intentionally external: Alchemy beta.65 persists resource props and outputs, so a `SecretVersion` input—even if accepted as `Redacted`—cannot currently be proven absent from every plan/state/log serialization path. Create versions through an audited external process and pass only Secret Manager version resource names to workloads.
