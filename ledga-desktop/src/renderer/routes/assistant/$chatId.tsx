import { createFileRoute } from "@tanstack/react-router"

export const Route = createFileRoute("/assistant/$chatId")({
    component: AssistantScreen
})

function AssistantScreen() {
    const { chatId } = Route.useParams()
    return <div style={{ padding: 40 }}><h1>Assistant: {chatId}</h1></div>
}
