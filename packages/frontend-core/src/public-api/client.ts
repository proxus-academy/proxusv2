import { PublicApi } from "@proxus/shared/public-api"
import { HttpApiClient } from "effect/unstable/httpapi"

/** Typed PublicApi client built from the HttpClient provided by the application runtime. */
export const publicApiClient = HttpApiClient.make(PublicApi, { baseUrl: "/api" })
