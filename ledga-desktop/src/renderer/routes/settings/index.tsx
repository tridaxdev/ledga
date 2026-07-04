import { createFileRoute } from "@tanstack/react-router"

export const Route = createFileRoute("/settings/")({
    component: SettingsScreen
})

function SettingsScreen() {
    return <div style={{ padding: 40 }}><h1>Settings</h1></div>
}
