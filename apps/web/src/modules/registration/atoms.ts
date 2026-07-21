import { composition } from "../../composition.js"

export const {
  assignmentAtom,
  exposureLifecycleAtom,
  goBackRegistrationAtom,
  registrationPathAtom,
  resetRegistrationAtom,
  selectRegistrationNodeAtom,
} = composition.registration

export const { failedAtom, retryAtom } = composition.navigation
