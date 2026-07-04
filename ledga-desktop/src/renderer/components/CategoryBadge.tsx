import { useState, useRef, useEffect } from "react"
import type { Category } from "@/common/types/Category"

interface Props {
    label: string
    flagged: boolean
    categories: Category[]
    currentCategoryId: string | null
    onSelect: (categoryId: string) => void
}

export function CategoryBadge({ label, flagged, categories, currentCategoryId, onSelect }: Props) {
    const [open, setOpen] = useState(false)
    const ref = useRef<HTMLSpanElement>(null)

    useEffect(() => {
        if (!open) return
        function handleClickOutside(event: MouseEvent) {
            if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false)
        }
        document.addEventListener("mousedown", handleClickOutside)
        return () => document.removeEventListener("mousedown", handleClickOutside)
    }, [open])

    return (
        <span ref={ref} style={{ position: "relative", display: "inline-block" }}>
            <button
                onClick={() => setOpen(prev => !prev)}
                style={{
                    fontSize: 11,
                    fontWeight: flagged ? 600 : 500,
                    color: flagged ? "#9a7a1a" : "var(--color-ledga-brand)",
                    border: `1px solid ${flagged ? "#d9a24c" : "var(--color-ledga-brand-border)"}`,
                    background: flagged ? "#faf0d8" : "var(--color-ledga-brand-bg)",
                    borderRadius: 999,
                    padding: "2px 9px",
                    whiteSpace: "nowrap",
                    fontFamily: "inherit",
                    cursor: "pointer"
                }}
            >
                {label}
            </button>
            {open && (
                <div
                    style={{
                        position: "absolute",
                        top: "calc(100% + 5px)",
                        left: 0,
                        width: 182,
                        backgroundColor: "#fff",
                        border: "1px solid var(--color-ledga-border)",
                        borderRadius: 9,
                        boxShadow: "0 14px 30px -10px rgba(63,56,47,.26), 0 4px 10px -2px rgba(63,56,47,.1)",
                        zIndex: 30,
                        padding: 5
                    }}
                >
                    <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.09em", textTransform: "uppercase", color: "#a89c87", padding: "5px 8px 4px" }}>Move to</div>
                    {categories.map(category => (
                        <button
                            key={category.id}
                            onClick={() => {
                                onSelect(category.id)
                                setOpen(false)
                            }}
                            style={{
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between",
                                gap: 8,
                                width: "100%",
                                textAlign: "left",
                                padding: "7px 8px",
                                borderRadius: 6,
                                border: "none",
                                background: category.id === currentCategoryId ? "var(--color-ledga-sidebar)" : "transparent",
                                fontSize: 13,
                                color: "var(--color-ledga-text)",
                                cursor: "pointer",
                                fontFamily: "inherit"
                            }}
                        >
                            <span>{category.name}</span>
                            {category.id === currentCategoryId && (
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-ledga-brand)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M20 6 9 17l-5-5" />
                                </svg>
                            )}
                        </button>
                    ))}
                </div>
            )}
        </span>
    )
}
