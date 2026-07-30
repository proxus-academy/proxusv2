import { RegistryContext, useAtomSet, useAtomValue } from "@effect/atom-react"
import type { MouseEvent, ReactNode } from "react"
import * as React from "react"
import type {
  Router,
  RouterHistory,
  RouterNavigation,
  Routes,
} from "./index.js"

interface MatchRenderContextValue {
  readonly entries: readonly {
    readonly render: () => ReactNode
  }[]
  readonly index: number
}

const MatchRenderContext = React.createContext<MatchRenderContextValue | undefined>(undefined)

class RouteErrorBoundary extends React.Component<{
  readonly children: ReactNode
  readonly ErrorComponent: (props: {
    readonly location: {
      readonly pathname: string
      readonly search: string
      readonly hash: string
    }
    readonly error: unknown
  }) => ReactNode
  readonly location: {
    readonly pathname: string
    readonly search: string
    readonly hash: string
  }
}, {
  readonly error?: unknown
}> {
  state: { readonly error?: unknown } = {}

  static getDerivedStateFromError(error: unknown) {
    return { error }
  }

  render() {
    if (this.state.error !== undefined) {
      return React.createElement(this.props.ErrorComponent, {
        location: this.props.location,
        error: this.state.error,
      })
    }
    return this.props.children
  }
}

const MatchedEntry = (props: MatchRenderContextValue) => {
  const entry = props.entries[props.index]
  if (entry === undefined) return null
  return (
    <MatchRenderContext.Provider value={props}>
      {entry.render()}
    </MatchRenderContext.Provider>
  )
}

export const Outlet = () => {
  const current = React.useContext(MatchRenderContext)
  if (current === undefined) {
    throw new Error("Outlet must be rendered inside a matched route")
  }
  return <MatchedEntry entries={current.entries} index={current.index + 1} />
}

type NavigationProps<Nodes extends Routes> =
  RouterNavigation<Router<Nodes>>

type LinkProps<Nodes extends Routes> = NavigationProps<Nodes> & {
  readonly children?: ReactNode
  readonly className?: string
}

const shouldHandleClick = (event: MouseEvent<HTMLAnchorElement>) =>
  event.button === 0
  && !event.defaultPrevented
  && !event.metaKey
  && !event.altKey
  && !event.ctrlKey
  && !event.shiftKey
  && event.currentTarget.target !== "_blank"

export const createReactRouter = <const Nodes extends Routes>(
  router: Router<Nodes>,
  history: RouterHistory,
) => {
  const RouterProvider = () => {
    const registry = React.useContext(RegistryContext)
    React.useLayoutEffect(() => router.start(registry, history), [registry])
    const match = useAtomValue(router.matchAtom)

    if (match._tag === "NotFound") {
      return React.createElement(router.fallbacks.NotFound, {
        location: match.location,
      })
    }
    if (match._tag === "InvalidUrl") {
      return React.createElement(router.fallbacks.InvalidUrl, {
        location: match.location,
        issues: match.issues,
      })
    }
    const location = router.location()
    const locationKey = `${location.pathname}${location.search}${location.hash}`
    return (
      <RouteErrorBoundary
        key={locationKey}
        ErrorComponent={router.fallbacks.Error}
        location={location}
      >
        <MatchedEntry entries={match.entries} index={0} />
      </RouteErrorBoundary>
    )
  }

  const Navigate = (props: NavigationProps<Nodes>) => {
    const navigate = useAtomSet(router.navigateAtom)
    const href = router.href(props)
    const navigationKey = `${props.replace === true ? "replace" : "push"}:${href}`
    React.useEffect(() => {
      navigate(props)
    }, [navigate, navigationKey])
    return null
  }

  const Link = (props: LinkProps<Nodes>) => {
    const navigate = useAtomSet(router.navigateAtom)
    const href = router.href(props)
    return (
      <a
        className={props.className}
        href={href}
        onClick={(event) => {
          if (!shouldHandleClick(event)) return
          event.preventDefault()
          navigate(props)
        }}
      >
        {props.children}
      </a>
    )
  }

  return {
    RouterProvider,
    Outlet,
    Navigate,
    Link,
  }
}
