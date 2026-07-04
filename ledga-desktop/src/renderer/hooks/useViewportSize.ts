import { useEffect, useState } from "react"

interface ViewportSize {
    readonly width: number
    readonly height: number
}

function readSize(): ViewportSize {
    if (typeof window === "undefined") return { width: 0, height: 0 }
    return { width: window.innerWidth, height: window.innerHeight }
}

export function useViewportSize(): ViewportSize {
    const [size, setSize] = useState<ViewportSize>(readSize)

    useEffect(() => {
        let rafId: number | null = null
        const handleResize = () => {
            if (rafId !== null) return
            rafId = requestAnimationFrame(() => {
                rafId = null
                setSize(readSize())
            })
        }
        window.addEventListener("resize", handleResize)
        return () => {
            window.removeEventListener("resize", handleResize)
            if (rafId !== null) cancelAnimationFrame(rafId)
        }
    }, [])

    return size
}
