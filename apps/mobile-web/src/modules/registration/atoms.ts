import { makeRegistrationAtoms } from "@proxus/frontend-core/registration"
import { makeWebRegistrationPathAtom } from "@proxus/frontend-web/registration"

export const {
  goBackRegistrationAtom,
  registrationPathAtom,
  resetRegistrationAtom,
  selectRegistrationNodeAtom,
} = makeRegistrationAtoms(makeWebRegistrationPathAtom())
