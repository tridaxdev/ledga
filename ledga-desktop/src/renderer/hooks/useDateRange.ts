import { useState, useEffect } from "react"

export type RangeMode = "month" | "year" | "custom"

export interface DateRangeState {
    mode: RangeMode
    month: number
    year: number
    customFrom: string
    customTo: string
}

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]

function defaultState(): DateRangeState {
    const now = new Date()
    return { mode: "month", month: now.getMonth(), year: now.getFullYear(), customFrom: "", customTo: "" }
}

// Module-level so the selected range survives navigating away from /ledger and back,
// without needing a full state-management dependency for one piece of shared UI state.
// Multiple components (DateRangePicker, the Ledger screen) read this concurrently, so
// updates are broadcast to every mounted useDateRange() instance via the listener set --
// otherwise a change made in one component's local useState would never be seen by another.
let sharedState: DateRangeState = defaultState()
const listeners = new Set<(state: DateRangeState) => void>()

function setSharedState(next: DateRangeState) {
    sharedState = next
    listeners.forEach(listener => listener(next))
}

function unixSecondsAt(year: number, month: number, day: number): number {
    return Math.floor(Date.UTC(year, month, day) / 1000)
}

export function dateRangeToBounds(state: DateRangeState): { from?: number; to?: number; title: string } {
    if (state.mode === "month") {
        return {
            from: unixSecondsAt(state.year, state.month, 1),
            to: unixSecondsAt(state.year, state.month + 1, 1) - 1,
            title: `${MONTH_NAMES[state.month]} ${state.year}`
        }
    }
    if (state.mode === "year") {
        return {
            from: unixSecondsAt(state.year, 0, 1),
            to: unixSecondsAt(state.year + 1, 0, 1) - 1,
            title: String(state.year)
        }
    }
    if (state.customFrom && state.customTo) {
        return {
            from: Math.floor(new Date(`${state.customFrom}T00:00:00Z`).getTime() / 1000),
            to: Math.floor(new Date(`${state.customTo}T23:59:59Z`).getTime() / 1000),
            title: `${state.customFrom} → ${state.customTo}`
        }
    }
    return { title: "Custom range" }
}

export function useDateRange() {
    const [state, setState] = useState(sharedState)

    useEffect(() => {
        listeners.add(setState)
        setState(sharedState)
        return () => {
            listeners.delete(setState)
        }
    }, [])

    function update(patch: Partial<DateRangeState>) {
        setSharedState({ ...sharedState, ...patch })
    }

    return { state, update, MONTH_NAMES }
}
