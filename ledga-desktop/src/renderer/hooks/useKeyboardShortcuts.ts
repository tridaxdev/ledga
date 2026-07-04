import { useCallback } from "react"
import type { KeyboardShortcut, KeyboardShortcutConfig } from "../types/keyboard"

interface UseKeyboardShortcutsOptions {
    readonly enabled?: boolean
}

// Check if current pressed keys match the shortcut
function matchesShortcut(event: React.KeyboardEvent, shortcut: KeyboardShortcut): boolean {
    const pressedKeys = new Set<string>()

    // Add modifier keys if pressed
    if (event.ctrlKey) {
        pressedKeys.add("Control")
    }
    if (event.metaKey) {
        pressedKeys.add("Meta")
    }
    if (event.altKey) {
        pressedKeys.add("Alt")
    }
    if (event.shiftKey) {
        pressedKeys.add("Shift")
    }

    // Add the main key
    pressedKeys.add(event.key)

    // Convert shortcut keys to set
    const requiredKeys = new Set(shortcut.keys.map(k => String(k)))

    // Check if sets are equal
    if (pressedKeys.size !== requiredKeys.size) {
        return false
    }

    return Array.from(pressedKeys).every(key => requiredKeys.has(key))
}

export function useKeyboardShortcuts(shortcuts: KeyboardShortcutConfig, options: UseKeyboardShortcutsOptions = {}): (event: React.KeyboardEvent) => void {
    const { enabled = true } = options

    return useCallback(
        (event: React.KeyboardEvent) => {
            if (!enabled) {
                return
            }

            // Find matching shortcut
            const matchingShortcut = shortcuts.find(shortcut => {
                if (shortcut.enabled === false) {
                    return false
                }
                return matchesShortcut(event, shortcut)
            })

            if (!matchingShortcut) {
                return
            }

            if (matchingShortcut.preventDefault !== false) {
                event.preventDefault()
            }

            if (matchingShortcut.stopPropagation) {
                event.stopPropagation()
            }

            matchingShortcut.callback()
        },
        [shortcuts, enabled]
    )
}
