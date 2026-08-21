import manifest from "@proxus/assets/manifest"

export const prerender = true

export const GET = () => new Response(JSON.stringify(manifest), {
  headers: {
    "cache-control": "public, max-age=300",
    "content-type": "application/json; charset=utf-8",
  },
})
