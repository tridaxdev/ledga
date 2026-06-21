import { createFileRoute } from "@tanstack/react-router"

export const Route = createFileRoute("/")({
    component: HomeScreen
})

function HomeScreen() {
    return (
        <div className="flex h-full w-full justify-center items-center">
            <h1>Home</h1>
        </div>
    )
}