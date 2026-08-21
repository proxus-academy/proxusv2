# anti-slop vendored source

The files in this directory are copied from
[`dmmulroy/anti-slop`](https://github.com/dmmulroy/anti-slop) at commit
`6d538555cb151d4121ed51a27db81890eacf8ae9`.

They are vendored because anti-slop is designed to be adopted and customized by
each repository rather than consumed as a versioned package. The upstream MIT
license is included in `LICENSE`.

Run the rules independently from the repository's normative lint gate with:

```bash
pnpm lint:anti-slop
```
