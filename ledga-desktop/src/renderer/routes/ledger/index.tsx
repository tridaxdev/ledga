import { createFileRoute } from "@tanstack/react-router"

export const Route = createFileRoute("/ledger/")({
    component: LedgerScreen
})

function LedgerScreen() {
    return <div style={{ padding: 40 }}><h1>Ledger</h1></div>
}
