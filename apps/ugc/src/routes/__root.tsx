import { createRootRoute, Outlet } from "@tanstack/react-router"
export const Route = createRootRoute({ component: Outlet, errorComponent: () => <main className="p-8"><h1>No se pudo abrir esta página</h1></main> })
