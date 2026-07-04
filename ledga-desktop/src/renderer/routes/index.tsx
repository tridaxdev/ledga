import { createFileRoute, redirect } from "@tanstack/react-router"

export const Route = createFileRoute("/")({
    beforeLoad: () => {
        // TanStack Router's control-flow redirect throws a Response, not an Error
        // eslint-disable-next-line @typescript-eslint/only-throw-error
        throw redirect({ to: "/ledger" })
    }
})
