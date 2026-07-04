import { useState, useRef, useEffect, type KeyboardEvent } from "react"
import { createFileRoute } from "@tanstack/react-router"
import { useTranslation } from "react-i18next"
import { useAssistant } from "../../hooks/useAssistant"
import { Markdown } from "../../components/Markdown"
import type { ChatMessage, ToolCallRecord } from "@/common/types/ChatTypes"

export const Route = createFileRoute("/assistant/$chatId")({ component: AssistantScreen })

const SUGGESTED_PROMPTS = ["Biggest expense this month?", "Compare to April", "List my subscriptions"]

function AssistantScreen() {
    const { t } = useTranslation()
    const { chatId } = Route.useParams()
    const { messages, streamingText, isStreaming, isThinking, error, send, reload, stop } = useAssistant(chatId)
    const [input, setInput] = useState("")
    const scrollRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
    }, [messages, streamingText])

    function handleSend() {
        const text = input.trim()
        if (!text) return
        setInput("")
        send(text)
    }

    function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
        // isComposing/keyCode 229 guards against IME composition (CJK input etc.) -- the Enter
        // that confirms a composed character shouldn't also submit the message.
        if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing && e.keyCode !== 229) {
            e.preventDefault()
            handleSend()
        }
    }

    return (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
            <div
                style={{
                    flexShrink: 0,
                    padding: "16px 28px",
                    borderBottom: "1px solid var(--color-ledga-border-subtle)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    background: "var(--color-ledga-bg)"
                }}
            >
                <div>
                    <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--color-ledga-text-muted)" }}>{t("assistant_chat.header_label")}</div>
                    <div style={{ fontSize: 14, color: "var(--color-ledga-text-secondary)", marginTop: 1 }}>{t("assistant_chat.header_description")}</div>
                </div>
                <span
                    style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 6,
                        border: "1px solid var(--color-ledga-brand-border)",
                        background: "var(--color-ledga-brand-bg)",
                        borderRadius: 999,
                        padding: "4px 11px",
                        fontSize: 12,
                        color: "var(--color-ledga-brand)",
                        fontWeight: 500
                    }}
                >
                    <LedgerIcon />
                    {t("assistant_chat.using_all_transactions")}
                </span>
            </div>

            <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: "24px 28px" }}>
                <div style={{ maxWidth: 720, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}>
                    {messages.map(message => (
                        <MessageBubble key={message.id} message={message} onReload={reload} reloadDisabled={isStreaming} />
                    ))}

                    {isThinking && (
                        <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-start", maxWidth: "92%" }}>
                            <div
                                style={{
                                    background: "#fff",
                                    border: "1px solid var(--color-ledga-border)",
                                    borderRadius: "14px 14px 14px 4px",
                                    padding: "10px 14px",
                                    fontSize: 14,
                                    color: "var(--color-ledga-text-muted)"
                                }}
                            >
                                {t("assistant_chat.thinking_label")}
                                <span
                                    style={{
                                        display: "inline-block",
                                        width: 2,
                                        height: "1em",
                                        background: "var(--color-ledga-text-muted)",
                                        marginLeft: 3,
                                        verticalAlign: "text-bottom",
                                        animation: "blink .7s step-start infinite"
                                    }}
                                />
                            </div>
                        </div>
                    )}

                    {isStreaming && streamingText && (
                        <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-start", maxWidth: "92%" }}>
                            <div
                                style={{
                                    background: "#fff",
                                    border: "1px solid var(--color-ledga-border)",
                                    borderRadius: "14px 14px 14px 4px",
                                    padding: "11px 14px",
                                    fontSize: 14,
                                    color: "var(--color-ledga-text)"
                                }}
                            >
                                <Markdown content={streamingText} />
                            </div>
                        </div>
                    )}

                    {error && <div style={{ fontSize: 13, color: "var(--color-ledga-danger)" }}>{error}</div>}

                    {messages.length === 0 && !isStreaming && (
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", paddingTop: 2 }}>
                            {SUGGESTED_PROMPTS.map(prompt => (
                                <button key={prompt} onClick={() => send(prompt)} style={promptButtonStyle}>
                                    {prompt}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            <div style={{ flexShrink: 0, padding: "14px 28px 18px", borderTop: "1px solid var(--color-ledga-border-subtle)", background: "var(--color-ledga-bg)" }}>
                <div
                    style={{
                        maxWidth: 720,
                        margin: "0 auto",
                        display: "flex",
                        alignItems: "flex-end",
                        gap: 10,
                        background: "#fff",
                        border: "1px solid var(--color-ledga-border)",
                        borderRadius: 12,
                        padding: "8px 8px 8px 14px",
                        boxShadow: "0 1px 2px rgba(63,56,47,.05)"
                    }}
                >
                    <textarea
                        value={input}
                        onChange={e => setInput(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="Ask about your money…"
                        rows={1}
                        style={{
                            flex: 1,
                            border: "none",
                            outline: "none",
                            background: "transparent",
                            fontFamily: "inherit",
                            fontSize: 14,
                            color: "var(--color-ledga-text)",
                            padding: "8px 0",
                            resize: "none",
                            maxHeight: 120
                        }}
                    />
                    {isStreaming ? (
                        <button onClick={stop} style={{ ...sendButtonStyle, background: "var(--color-ledga-danger)" }} title="Stop">
                            <StopIcon />
                        </button>
                    ) : (
                        <button onClick={handleSend} disabled={!input.trim()} style={{ ...sendButtonStyle, opacity: input.trim() ? 1 : 0.5 }}>
                            <SendIcon />
                        </button>
                    )}
                </div>
            </div>
        </div>
    )
}

function MessageBubble({ message, onReload, reloadDisabled }: { message: ChatMessage; onReload: (messageId: string) => void; reloadDisabled: boolean }) {
    const { t } = useTranslation()

    if (message.role === "user") {
        return (
            <div style={{ display: "flex" }}>
                <div
                    style={{
                        alignSelf: "flex-end",
                        marginLeft: "auto",
                        background: "var(--color-ledga-brand)",
                        color: "#fff",
                        borderRadius: "14px 14px 4px 14px",
                        padding: "10px 14px",
                        fontSize: 14,
                        lineHeight: 1.55,
                        maxWidth: "84%",
                        whiteSpace: "pre-wrap"
                    }}
                >
                    {message.content}
                </div>
            </div>
        )
    }

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-start", maxWidth: "92%" }}>
            {message.tool_calls && message.tool_calls.length > 0 && <ToolDisclosure toolCalls={message.tool_calls} />}
            {message.content && (
                <div
                    style={{
                        background: "#fff",
                        border: "1px solid var(--color-ledga-border)",
                        borderRadius: "14px 14px 14px 4px",
                        padding: "11px 14px",
                        fontSize: 14,
                        color: "var(--color-ledga-text)"
                    }}
                >
                    <Markdown content={message.content} />
                </div>
            )}
            <button
                onClick={() => onReload(message.id)}
                disabled={reloadDisabled}
                style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 5,
                    border: "none",
                    background: "transparent",
                    color: "var(--color-ledga-text-muted)",
                    fontSize: 12,
                    padding: "2px 4px",
                    cursor: reloadDisabled ? "default" : "pointer",
                    opacity: reloadDisabled ? 0.5 : 1
                }}
            >
                <ReloadIcon />
                {t("assistant_chat.reload_button")}
            </button>
        </div>
    )
}

function summarizeToolOutput(output: unknown): string {
    if (output && typeof output === "object" && "error" in output) {
        return `error: ${output.error}`
    }
    if (output && typeof output === "object" && "count" in output) {
        const count = output.count
        const truncated = "truncated" in output && (output as { truncated: unknown }).truncated
        return `${count}${truncated ? "+" : ""} transaction${count === 1 ? "" : "s"} found`
    }
    return "done"
}

function ToolDisclosure({ toolCalls }: { toolCalls: ToolCallRecord[] }) {
    const { t } = useTranslation()
    const [open, setOpen] = useState(false)
    const summary = toolCalls.map(tc => summarizeToolOutput(tc.output)).join(", ")

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, width: "100%" }}>
            <button
                onClick={() => setOpen(prev => !prev)}
                style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 8,
                    border: "1px solid var(--color-ledga-border)",
                    background: "var(--color-ledga-sidebar)",
                    borderRadius: 999,
                    padding: "5px 12px",
                    cursor: "pointer",
                    maxWidth: "100%",
                    width: "fit-content"
                }}
            >
                <SearchIcon />
                <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", color: "var(--color-ledga-text-secondary)" }}>
                    {t("assistant_chat.used_ledger_label")}
                </span>
                <span style={{ fontSize: 12, color: "var(--color-ledga-text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{summary}</span>
                <span style={{ display: "inline-flex", transform: open ? "rotate(180deg)" : "none", transition: "transform .15s" }}>
                    <ChevronDown />
                </span>
            </button>
            {open && (
                <div
                    style={{
                        border: "1px solid var(--color-ledga-border)",
                        borderLeft: "2px solid #6db78c",
                        background: "#fff",
                        borderRadius: 8,
                        padding: "11px 13px",
                        display: "flex",
                        flexDirection: "column",
                        gap: 9
                    }}
                >
                    {toolCalls.map(tc => (
                        <div key={tc.toolCallId} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                            <div style={{ fontSize: 13, color: "var(--color-ledga-text)", fontWeight: 500 }}>{tc.toolName}</div>
                            <div
                                style={{
                                    fontSize: 12,
                                    color: "var(--color-ledga-text-secondary)",
                                    fontFamily: "monospace",
                                    background: "var(--color-ledga-sidebar)",
                                    border: "1px solid var(--color-ledga-border-subtle)",
                                    borderRadius: 5,
                                    padding: "4px 8px",
                                    overflowWrap: "break-word"
                                }}
                            >
                                {JSON.stringify(tc.input)}
                            </div>
                            <div style={{ fontSize: 11.5, color: "var(--color-ledga-text-muted)" }}>→ {summarizeToolOutput(tc.output)}</div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}

const promptButtonStyle: React.CSSProperties = {
    border: "1px solid var(--color-ledga-brand-border)",
    background: "var(--color-ledga-brand-bg)",
    color: "var(--color-ledga-brand)",
    borderRadius: 999,
    padding: "6px 13px",
    fontSize: 12.5,
    fontWeight: 500,
    cursor: "pointer"
}

const sendButtonStyle: React.CSSProperties = {
    width: 36,
    height: 36,
    flexShrink: 0,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    background: "var(--color-ledga-brand)",
    color: "#fff",
    border: "none",
    borderRadius: 9,
    cursor: "pointer"
}

function LedgerIcon() {
    return (
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.85" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 5h16M4 12h16M4 19h10" />
        </svg>
    )
}

function SearchIcon() {
    return (
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--color-ledga-text-secondary)" strokeWidth="1.85" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="7" />
            <path d="m21 21-4.3-4.3" />
        </svg>
    )
}

function ChevronDown() {
    return (
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--color-ledga-text-muted)" strokeWidth="1.85" strokeLinecap="round" strokeLinejoin="round">
            <path d="m6 9 6 6 6-6" />
        </svg>
    )
}

function SendIcon() {
    return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 19V5M5 12l7-7 7 7" />
        </svg>
    )
}

function StopIcon() {
    return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="none">
            <rect x="5" y="5" width="14" height="14" rx="2" />
        </svg>
    )
}

function ReloadIcon() {
    return (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.85" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 12a9 9 0 1 1-3-6.7L21 8" />
            <path d="M21 3v5h-5" />
        </svg>
    )
}
