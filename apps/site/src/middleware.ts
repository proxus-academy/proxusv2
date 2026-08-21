import { defineMiddleware } from "astro:middleware"
import {
  assertIsLocale,
  baseLocale,
  setLocale,
} from "./paraglide/runtime.js"

export const onRequest = defineMiddleware((context, next) => {
  void setLocale(assertIsLocale(context.currentLocale ?? baseLocale))
  return next()
})
