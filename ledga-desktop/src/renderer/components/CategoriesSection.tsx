import { useState } from "react"
import { useTranslation } from "react-i18next"
import { useCategories } from "../hooks/useCategories"
import { PROTECTED_CATEGORY_NAME } from "@/common/types/Category"
import type { Category } from "@/common/types/Category"

const COLOR_SWATCHES = ["#4caf50", "#8bc34a", "#009688", "#00bcd4", "#2196f3", "#7c4dff", "#9c27b0", "#e91e63", "#f44336", "#ff9800", "#ffc107", "#795548"]

export function CategoriesSection() {
    const { t } = useTranslation()
    const { categories, isLoading, createCategory, updateCategory, deleteCategory } = useCategories()

    const [formOpen, setFormOpen] = useState(false)
    const [name, setName] = useState("")
    const [color, setColor] = useState(COLOR_SWATCHES[0])
    const [isSaving, setIsSaving] = useState(false)
    const [formError, setFormError] = useState<string | null>(null)

    const [editingId, setEditingId] = useState<string | null>(null)
    const [editName, setEditName] = useState("")
    const [editColor, setEditColor] = useState("")
    const [isSavingEdit, setIsSavingEdit] = useState(false)
    const [editError, setEditError] = useState<string | null>(null)

    const [deletingId, setDeletingId] = useState<string | null>(null)
    const [deleteError, setDeleteError] = useState<string | null>(null)

    function resetForm() {
        setName("")
        setColor(COLOR_SWATCHES[0])
        setFormError(null)
        setFormOpen(false)
    }

    async function handleCreate() {
        if (!name.trim() || isSaving) return
        setIsSaving(true)
        setFormError(null)
        const result = await createCategory({ name: name.trim(), color })
        setIsSaving(false)
        if (result.kind === "success") resetForm()
        else setFormError(result.error.message)
    }

    function startEdit(category: Category) {
        setEditingId(category.id)
        setEditName(category.name)
        setEditColor(category.color)
        setEditError(null)
        setDeleteError(null)
    }

    function cancelEdit() {
        setEditingId(null)
        setEditError(null)
    }

    async function handleSaveEdit(id: string) {
        if (!editName.trim() || isSavingEdit) return
        setIsSavingEdit(true)
        setEditError(null)
        const result = await updateCategory(id, { name: editName.trim(), color: editColor })
        setIsSavingEdit(false)
        if (result.kind === "success") setEditingId(null)
        else setEditError(result.error.message)
    }

    async function handleDelete(id: string) {
        setDeletingId(id)
        setDeleteError(null)
        const result = await deleteCategory(id)
        setDeletingId(null)
        if (result.kind === "error") setDeleteError(result.error.message)
    }

    return (
        <section>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                <h2 style={{ fontSize: 15, fontWeight: 600, color: "var(--color-ledga-text)", margin: 0 }}>{t("categories_section.title")}</h2>
                {!formOpen && (
                    <button onClick={() => setFormOpen(true)} style={addButtonStyle}>
                        {t("categories_section.add_category_button")}
                    </button>
                )}
            </div>

            {isLoading ? (
                <p style={{ fontSize: 14, color: "var(--color-ledga-text-muted)" }}>{t("categories_section.loading")}</p>
            ) : categories.length === 0 && !formOpen ? (
                <div style={{ padding: 24, borderRadius: 8, border: "1px dashed var(--color-ledga-border)", textAlign: "center" }}>
                    <p style={{ margin: 0, fontSize: 14, color: "var(--color-ledga-text-muted)" }}>{t("categories_section.no_categories")}</p>
                </div>
            ) : (
                <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 }}>
                    {categories.map(category => {
                        const isProtected = category.name === PROTECTED_CATEGORY_NAME
                        const isEditing = editingId === category.id

                        return (
                            <li key={category.id} style={categoryRowStyle}>
                                {isEditing ? (
                                    <div style={{ display: "flex", flexDirection: "column", gap: 10, width: "100%" }}>
                                        <Field label={t("categories_section.name_label")}>
                                            <input autoFocus value={editName} onChange={e => setEditName(e.target.value)} style={inputStyle} />
                                        </Field>
                                        <Field label={t("categories_section.color_label")}>
                                            <ColorSwatchPicker value={editColor} onChange={setEditColor} />
                                        </Field>
                                        {editError && <div style={errorTextStyle}>{editError}</div>}
                                        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                                            <button onClick={cancelEdit} style={cancelButtonStyle}>
                                                {t("categories_section.cancel_button")}
                                            </button>
                                            <button
                                                onClick={() => handleSaveEdit(category.id)}
                                                disabled={!editName.trim() || isSavingEdit}
                                                style={{ ...addButtonStyle, opacity: !editName.trim() || isSavingEdit ? 0.6 : 1 }}
                                            >
                                                {isSavingEdit ? t("categories_section.saving") : t("categories_section.save_button")}
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <>
                                        <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                                            <span style={{ width: 12, height: 12, borderRadius: "50%", background: category.color, flexShrink: 0 }} />
                                            <span style={{ fontSize: 14, color: "var(--color-ledga-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{category.name}</span>
                                        </div>
                                        {isProtected ? (
                                            <span style={{ fontSize: 12, color: "var(--color-ledga-text-muted)", flexShrink: 0 }}>{t("categories_section.default_category_note")}</span>
                                        ) : (
                                            <div style={{ display: "flex", gap: 7, flexShrink: 0 }}>
                                                <button onClick={() => startEdit(category)} style={cancelButtonStyle}>
                                                    {t("categories_section.edit_button")}
                                                </button>
                                                <button onClick={() => handleDelete(category.id)} disabled={deletingId === category.id} style={deleteButtonStyle}>
                                                    {deletingId === category.id ? t("categories_section.saving") : t("categories_section.delete_button")}
                                                </button>
                                            </div>
                                        )}
                                    </>
                                )}
                            </li>
                        )
                    })}
                </ul>
            )}

            {deleteError && <div style={{ ...errorTextStyle, marginTop: 10 }}>{deleteError}</div>}

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
                    <Field label={t("categories_section.name_label")}>
                        <input autoFocus value={name} onChange={e => setName(e.target.value)} placeholder={t("categories_section.name_placeholder")} style={inputStyle} />
                    </Field>
                    <Field label={t("categories_section.color_label")}>
                        <ColorSwatchPicker value={color} onChange={setColor} />
                    </Field>
                    {formError && <div style={errorTextStyle}>{formError}</div>}
                    <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                        <button onClick={resetForm} style={cancelButtonStyle}>
                            {t("categories_section.cancel_button")}
                        </button>
                        <button onClick={handleCreate} disabled={!name.trim() || isSaving} style={{ ...addButtonStyle, opacity: !name.trim() || isSaving ? 0.6 : 1 }}>
                            {isSaving ? t("categories_section.saving") : t("categories_section.save_button")}
                        </button>
                    </div>
                </div>
            )}
        </section>
    )
}

function ColorSwatchPicker({ value, onChange }: { value: string; onChange: (color: string) => void }) {
    return (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {COLOR_SWATCHES.map(swatch => (
                <button
                    key={swatch}
                    type="button"
                    onClick={() => onChange(swatch)}
                    aria-label={swatch}
                    style={{
                        width: 22,
                        height: 22,
                        borderRadius: "50%",
                        background: swatch,
                        border: swatch === value ? "2px solid var(--color-ledga-text)" : "2px solid transparent",
                        boxShadow: "0 0 0 1px var(--color-ledga-border)",
                        cursor: "pointer",
                        padding: 0
                    }}
                />
            ))}
        </div>
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

const categoryRowStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
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

const errorTextStyle: React.CSSProperties = {
    fontSize: 12.5,
    color: "var(--color-ledga-danger)"
}
