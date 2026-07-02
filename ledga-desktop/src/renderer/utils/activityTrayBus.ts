// Small pub/sub so screens nested under the router (e.g. the Import modal's "View status" button)
// can open the activity tray, which lives in the root layout outside the router outlet.
const listeners = new Set<() => void>()

export function openActivityTray(): void {
    listeners.forEach(listener => listener())
}

export function onOpenActivityTray(listener: () => void): () => void {
    listeners.add(listener)
    return () => listeners.delete(listener)
}
