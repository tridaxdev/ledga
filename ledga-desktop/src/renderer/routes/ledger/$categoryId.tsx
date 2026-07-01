import { createFileRoute } from "@tanstack/react-router"

export const Route = createFileRoute("/ledger/$categoryId")({
    component: CategoryReviewScreen
})

function CategoryReviewScreen() {
    const { categoryId } = Route.useParams()
    return <div style={{ padding: 40 }}><h1>Category Review: {categoryId}</h1></div>
}
