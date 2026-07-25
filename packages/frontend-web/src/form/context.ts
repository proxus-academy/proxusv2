import { catalogFor, type MessagesCatalog } from "@proxus/product-messages"
import * as React from "react"

const MessagesContext = React.createContext<MessagesCatalog>(catalogFor("es"))
export const FormMessagesProvider = MessagesContext.Provider
export const useFormMessages = (): MessagesCatalog => React.useContext(MessagesContext)
