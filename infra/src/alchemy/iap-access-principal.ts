export type IapAccessPrincipal = `user:${string}` | `group:${string}`

const email = "[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+"
const iapAccessPrincipalPattern = new RegExp(`^(?:user|group):${email}$`)

/** Only individual users and Google groups are valid IAP access principals. */
export const isIapAccessPrincipal = (value: string): value is IapAccessPrincipal =>
  value.length <= 326 && iapAccessPrincipalPattern.test(value)
