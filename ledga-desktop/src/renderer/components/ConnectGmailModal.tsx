import { useState, useEffect, type MouseEvent } from "react"
import { useTranslation } from "react-i18next"
import { getLedgaAPI } from "../hooks/apiClient"
import type { Connection } from "@/common/types/Connection"

type Step = "explainer" | "mailbox" | "waiting" | "sync-preference" | "done"

interface Props {
    isOpen: boolean
    onClose: () => void
    onSuccess: (connection: Connection) => void
}

const STEP_INDEX: Record<Step, number> = {
    explainer: 0,
    mailbox: 1,
    waiting: 2,
    "sync-preference": 3,
    done: 4
}

export function ConnectGmailModal({ isOpen, onClose, onSuccess }: Props) {
    const { t } = useTranslation()
    const [step, setStep] = useState<Step>("explainer")
    const [flowId, setFlowId] = useState<string | null>(null)
    const [autoSync, setAutoSync] = useState(true)
    const [connectedEmail, setConnectedEmail] = useState<string | null>(null)
    const [isFinalizing, setIsFinalizing] = useState(false)

    useEffect(() => {
        if (!isOpen) {
            setStep("explainer")
            setFlowId(null)
            setAutoSync(true)
            setConnectedEmail(null)
            setIsFinalizing(false)
        }
    }, [isOpen])

    async function handleStartOAuth() {
        setStep("waiting")
        try {
            const result = await getLedgaAPI().connections.startOAuth()
            if (result.kind === "success") {
                setFlowId(result.value.flowId)
                setConnectedEmail(result.value.email)
                setStep("sync-preference")
            } else {
                setStep("mailbox")
            }
        } catch {
            setStep("mailbox")
        }
    }

    async function handleFinalize() {
        if (!flowId || isFinalizing) return
        setIsFinalizing(true)
        const result = await getLedgaAPI().connections.finalize(flowId, autoSync)
        if (result.kind === "success") {
            setStep("done")
            onSuccess(result.value)
        } else {
            setIsFinalizing(false)
        }
    }

    async function handleCancel() {
        // Discards any OAuth work in flight: closes the local redirect server if we're still
        // waiting on Google, and drops the completed-but-unfinalized flow (with its tokens) from
        // memory if the user closes the modal on the sync-preference step instead of finishing it.
        if (step === "waiting" || step === "sync-preference") {
            await getLedgaAPI().connections.cancelOAuth(flowId ?? undefined)
        }
        onClose()
    }

    if (!isOpen) return null

    const progressPercent = (STEP_INDEX[step] / 4) * 100

    return (
        <div
            style={{
                position: "fixed",
                inset: 0,
                backgroundColor: "rgba(31, 27, 22, 0.34)",
                backdropFilter: "blur(5px)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                zIndex: 50
            }}
            onClick={step === "explainer" || step === "mailbox" ? handleCancel : undefined}
        >
            <div
                style={{
                    width: "440px",
                    backgroundColor: "#fff",
                    border: "1px solid var(--color-ledga-border)",
                    borderRadius: "14px",
                    boxShadow: "0 24px 50px -12px rgba(63,56,47,.4)",
                    overflow: "hidden"
                }}
                onClick={(e: MouseEvent) => e.stopPropagation()}
            >
                <div
                    style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "14px 18px",
                        borderBottom: "1px solid var(--color-ledga-border-subtle)"
                    }}
                >
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", fontWeight: 500, color: "var(--color-ledga-text-secondary)" }}>
                        <MailIcon />
                        {t("connect_gmail_modal.header")}
                    </div>
                    <button onClick={handleCancel} style={{ color: "var(--color-ledga-text-muted)", cursor: "pointer", border: "none", background: "transparent", display: "inline-flex" }}>
                        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.85" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M18 6 6 18M6 6l12 12" />
                        </svg>
                    </button>
                </div>
                <div style={{ height: "3px", backgroundColor: "var(--color-ledga-border-subtle)" }}>
                    <div style={{ width: `${progressPercent}%`, height: "100%", backgroundColor: "var(--color-ledga-brand)", transition: "width .25s" }} />
                </div>

                <div style={{ padding: "24px 22px" }}>
                    {step === "explainer" && (
                        <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                            <h2 style={{ fontFamily: "var(--font-serif)", fontSize: "24px", fontWeight: 600, margin: 0, color: "var(--color-ledga-text)" }}>
                                {t("connect_gmail_modal.explainer_title")}
                            </h2>
                            <div style={{ display: "flex", flexDirection: "column", gap: "11px" }}>
                                <ExplainerRow text="Ledga only opens emails from known bank senders." />
                                <ExplainerRow text="It pulls out the amount, date and merchant — nothing else." />
                                <ExplainerRow text="Everything is stored on this device only." />
                            </div>
                            <PrimaryButton onClick={() => setStep("mailbox")}>{t("connect_gmail_modal.continue_button")}</PrimaryButton>
                        </div>
                    )}

                    {step === "mailbox" && (
                        <div style={{ display: "flex", flexDirection: "column", gap: "13px" }}>
                            <h2 style={{ fontFamily: "var(--font-serif)", fontSize: "24px", fontWeight: 600, margin: 0, color: "var(--color-ledga-text)" }}>
                                {t("connect_gmail_modal.mailbox_title")}
                            </h2>
                            <div style={{ fontSize: "13px", color: "var(--color-ledga-text-muted)" }}>{t("connect_gmail_modal.mailbox_description")}</div>
                            <PrimaryButton onClick={handleStartOAuth}>{t("connect_gmail_modal.connect_button")}</PrimaryButton>
                        </div>
                    )}

                    {step === "waiting" && (
                        <div style={{ display: "flex", flexDirection: "column", gap: "13px", alignItems: "center", textAlign: "center", padding: "8px 0" }}>
                            <Spinner />
                            <p style={{ margin: 0, color: "var(--color-ledga-text-secondary)", fontSize: "14px" }}>{t("connect_gmail_modal.waiting_text")}</p>
                            <button
                                onClick={handleCancel}
                                style={{
                                    padding: "8px 16px",
                                    borderRadius: "6px",
                                    border: "1px solid var(--color-ledga-border)",
                                    backgroundColor: "transparent",
                                    color: "var(--color-ledga-text-secondary)",
                                    cursor: "pointer",
                                    fontSize: "14px"
                                }}
                            >
                                {t("connect_gmail_modal.cancel_button")}
                            </button>
                        </div>
                    )}

                    {step === "sync-preference" && (
                        <div style={{ display: "flex", flexDirection: "column", gap: "13px" }}>
                            <h2 style={{ fontFamily: "var(--font-serif)", fontSize: "24px", fontWeight: 600, margin: 0, color: "var(--color-ledga-text)" }}>
                                {t("connect_gmail_modal.sync_preference_title")}
                            </h2>
                            {connectedEmail && <div style={{ fontSize: "13px", color: "var(--color-ledga-text-muted)" }}>{connectedEmail}</div>}
                            <SyncOption selected={autoSync} onSelect={() => setAutoSync(true)} title="Automatic sync" description="Ledga is notified the moment a bank email arrives — no polling." />
                            <SyncOption selected={!autoSync} onSelect={() => setAutoSync(false)} title="Manual only" description="Sync when you click the button." />
                            <PrimaryButton onClick={handleFinalize} disabled={isFinalizing}>
                                {isFinalizing ? "Connecting…" : autoSync ? "Enable auto-sync" : "Use manual sync"}
                            </PrimaryButton>
                        </div>
                    )}

                    {step === "done" && (
                        <div style={{ display: "flex", flexDirection: "column", gap: "13px", alignItems: "center", textAlign: "center", padding: "6px 0" }}>
                            <span
                                style={{
                                    width: "54px",
                                    height: "54px",
                                    borderRadius: "50%",
                                    backgroundColor: "var(--color-ledga-brand-bg)",
                                    border: "1px solid var(--color-ledga-brand-border)",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    color: "var(--color-ledga-brand)"
                                }}
                            >
                                <CheckIcon size={28} strokeWidth={2.4} />
                            </span>
                            <h2 style={{ fontFamily: "var(--font-serif)", fontSize: "24px", fontWeight: 600, margin: 0, color: "var(--color-ledga-text)" }}>{t("connect_gmail_modal.done_title")}</h2>
                            <div style={{ fontSize: "13px", color: "var(--color-ledga-text-secondary)", lineHeight: 1.5 }}>{t("connect_gmail_modal.done_description")}</div>
                            <PrimaryButton onClick={onClose}>{t("connect_gmail_modal.go_to_ledger_button")}</PrimaryButton>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}

function MailIcon() {
    return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-ledga-brand)" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="5" width="18" height="14" rx="2" />
            <path d="m3 7 9 6 9-6" />
        </svg>
    )
}

function CheckIcon({ size = 17, strokeWidth = 2 }: { size?: number; strokeWidth?: number }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 6 9 17l-5-5" />
        </svg>
    )
}

function ExplainerRow({ text }: { text: string }) {
    return (
        <div style={{ display: "flex", gap: "10px", alignItems: "flex-start" }}>
            <span style={{ color: "var(--color-ledga-brand)", marginTop: "1px", display: "inline-flex" }}>
                <CheckIcon />
            </span>
            <span style={{ fontSize: "14px", color: "var(--color-ledga-text-secondary)", lineHeight: 1.5 }}>{text}</span>
        </div>
    )
}

function PrimaryButton({ onClick, children, disabled }: { onClick: () => void; children: React.ReactNode; disabled?: boolean }) {
    return (
        <button
            onClick={onClick}
            disabled={disabled}
            style={{
                alignSelf: "flex-start",
                backgroundColor: "var(--color-ledga-brand)",
                color: "#fff",
                border: "none",
                borderRadius: "7px",
                padding: "10px 18px",
                fontSize: "14px",
                fontWeight: 500,
                cursor: disabled ? "default" : "pointer",
                opacity: disabled ? 0.7 : 1
            }}
        >
            {children}
        </button>
    )
}

function SyncOption({ selected, onSelect, title, description }: { selected: boolean; onSelect: () => void; title: string; description: string }) {
    return (
        <button
            onClick={onSelect}
            style={{
                textAlign: "left",
                borderRadius: "9px",
                padding: "13px",
                display: "flex",
                gap: "11px",
                alignItems: "flex-start",
                cursor: "pointer",
                border: selected ? "1px solid var(--color-ledga-brand-border)" : "1px solid var(--color-ledga-border)",
                backgroundColor: selected ? "var(--color-ledga-brand-bg)" : "transparent"
            }}
        >
            <span
                style={{
                    width: "18px",
                    height: "18px",
                    borderRadius: "50%",
                    flex: "none",
                    marginTop: "2px",
                    border: selected ? "5px solid var(--color-ledga-brand)" : "1px solid var(--color-ledga-border)",
                    display: "inline-block"
                }}
            />
            <span>
                <span style={{ display: "block", fontSize: "14px", fontWeight: 600, color: "var(--color-ledga-text)" }}>{title}</span>
                <span style={{ display: "block", fontSize: "13px", color: "var(--color-ledga-text-secondary)", marginTop: "2px", lineHeight: 1.5 }}>{description}</span>
            </span>
        </button>
    )
}

function Spinner() {
    return (
        <div
            style={{
                width: "28px",
                height: "28px",
                border: "2px solid var(--color-ledga-border)",
                borderTopColor: "var(--color-ledga-brand)",
                borderRadius: "50%",
                animation: "spin 0.8s linear infinite"
            }}
        />
    )
}
