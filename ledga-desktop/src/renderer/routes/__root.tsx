import { createRootRoute, Outlet } from "@tanstack/react-router"

export const Route = createRootRoute({
    component: RootLayout
})

function RootLayout() {
    return (
        <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
            <Outlet />
        </main>
    )
}