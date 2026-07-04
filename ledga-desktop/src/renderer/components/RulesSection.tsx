import { useState } from "react"
import { useRules } from "../hooks/useRules"
import { useCategories } from "../hooks/useCategories"

export function RulesSection() {
    const { rules, isLoading, createRule, deleteRule } = useRules()
    const { categories } = useCategories()
    const [formOpen, setFormOpen] = useState(false)
    const [keyword, setKeyword] = useState("")
    const [renameTo, setRenameTo] = useState("")
    const [categoryName, setCategoryName] = useState("")
    const [isSaving, setIsSaving] = useState(false)

    function resetForm() {
        setKeyword("")
        setRenameTo("")
        setCategoryName("")
        setFormOpen(false)
    }

    async function handleSave() {
        if (!keyword.trim() || isSaving) return
        setIsSaving(true)
        await createRule({
            matchKeyword: keyword.trim(),
            renameMerchant: renameTo.trim() || null,
            categoryName: categoryName || null
        })
        setIsSaving(false)
        resetForm()
    }

    return (
        <section style={{ marginTop: 32 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                <h2 style={{ fontSize: 15, fontWeight: 600, color: "var(--color-ledga-text)", margin: 0 }}>Rules</h2>
                {!formOpen && (
                    <button onClick={() => setFormOpen(true)} style={addButtonStyle}>
                        Add rule
                    </button>
                )}
            </div>

            {isLoading ? (
                <p style={{ fontSize: 14, color: "var(--color-ledga-text-muted)" }}>Loading…</p>
            ) : rules.length === 0 && !formOpen ? (
                <div style={{ padding: 24, borderRadius: 8, border: "1px dashed var(--color-ledga-border)", textAlign: "center" }}>
                    <p style={{ margin: 0, fontSize: 14, color: "var(--color-ledga-text-muted)" }}>No rules yet. Rules auto-categorise and rename matching transactions.</p>
                </div>
            ) : (
                <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 }}>
                    {rules.map(rule => (
                        <li key={rule.id} style={ruleRowStyle}>
                            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                                <span style={{ fontSize: 14, color: "var(--color-ledga-text)" }}>
                                    Contains <b>&quot;{rule.match_keyword}&quot;</b>
                                </span>
                                <span style={{ fontSize: 12, color: "var(--color-ledga-text-muted)" }}>
                                    {rule.rename_merchant && `Rename to "${rule.rename_merchant}"`}
                                    {rule.rename_merchant && rule.category_name && " · "}
                                    {rule.category_name && `Categorise as ${rule.category_name}`}
                                    {!rule.rename_merchant && !rule.category_name && "No action"}
                                </span>
                            </div>
                            <button onClick={() => deleteRule(rule.id)} style={deleteButtonStyle}>
                                Delete
                            </button>
                        </li>
                    ))}
                </ul>
            )}

            {formOpen && (
                <div
                    style={{
                        marginTop: 12,
                        padding: 16,
                        borderRadius: 8,
                        border: "1px solid var(--color-ledga-border)",
                        backgroundColor: "var(--color-ledga-sidebar)",
                        display: "flex",
                        flexDirection: "column",
                        gap: 10
                    }}
                >
                    <Field label="Keyword">
                        <input autoFocus value={keyword} onChange={e => setKeyword(e.target.value)} placeholder="e.g. Netflix" style={inputStyle} />
                    </Field>
                    <Field label="Rename merchant to (optional)">
                        <input value={renameTo} onChange={e => setRenameTo(e.target.value)} placeholder="e.g. Netflix Subscription" style={inputStyle} />
                    </Field>
                    <Field label="Category (optional)">
                        <select value={categoryName} onChange={e => setCategoryName(e.target.value)} style={inputStyle}>
                            <option value="">No category</option>
                            {categories.map(category => (
                                <option key={category.id} value={category.name}>
                                    {category.name}
                                </option>
                            ))}
                        </select>
                    </Field>
                    <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                        <button onClick={resetForm} style={cancelButtonStyle}>
                            Cancel
                        </button>
                        <button onClick={handleSave} disabled={!keyword.trim() || isSaving} style={{ ...addButtonStyle, opacity: !keyword.trim() || isSaving ? 0.6 : 1 }}>
                            {isSaving ? "Saving…" : "Save rule"}
                        </button>
                    </div>
                </div>
            )}
        </section>
    )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--color-ledga-text-muted)", marginBottom: 4 }}>{label}</div>
            {children}
        </div>
    )
}

const addButtonStyle: React.CSSProperties = {
    padding: "6px 14px",
    borderRadius: 6,
    border: "1px solid var(--color-ledga-brand-border)",
    backgroundColor: "var(--color-ledga-brand-bg)",
    color: "var(--color-ledga-brand)",
    cursor: "pointer",
    fontSize: 13,
    fontWeight: 500
}

const cancelButtonStyle: React.CSSProperties = {
    padding: "6px 14px",
    borderRadius: 6,
    border: "1px solid var(--color-ledga-border)",
    backgroundColor: "transparent",
    color: "var(--color-ledga-text-secondary)",
    cursor: "pointer",
    fontSize: 13
}

const deleteButtonStyle: React.CSSProperties = {
    padding: "4px 12px",
    borderRadius: 5,
    border: "1px solid var(--color-ledga-border)",
    backgroundColor: "transparent",
    color: "var(--color-ledga-danger)",
    cursor: "pointer",
    fontSize: 13
}

const ruleRowStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "12px 16px",
    borderRadius: 8,
    border: "1px solid var(--color-ledga-border)",
    backgroundColor: "#fff"
}

const inputStyle: React.CSSProperties = {
    width: "100%",
    border: "1px solid var(--color-ledga-border)",
    borderRadius: 6,
    padding: "7px 9px",
    fontFamily: "inherit",
    fontSize: 13,
    color: "var(--color-ledga-text)",
    backgroundColor: "#fff",
    boxSizing: "border-box"
}
