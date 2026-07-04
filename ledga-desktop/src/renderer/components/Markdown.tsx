import ReactMarkdown, { type Components } from "react-markdown"
import remarkGfm from "remark-gfm"

const components: Components = {
    p: ({ children }) => <p style={{ margin: "0 0 8px", lineHeight: 1.6 }}>{children}</p>,
    ul: ({ children }) => <ul style={{ margin: "0 0 8px", paddingLeft: 20, lineHeight: 1.6 }}>{children}</ul>,
    ol: ({ children }) => <ol style={{ margin: "0 0 8px", paddingLeft: 20, lineHeight: 1.6 }}>{children}</ol>,
    li: ({ children }) => <li style={{ marginBottom: 2 }}>{children}</li>,
    strong: ({ children }) => <strong style={{ fontWeight: 600 }}>{children}</strong>,
    em: ({ children }) => <em>{children}</em>,
    a: ({ children, href }) => (
        <a href={href} target="_blank" rel="noreferrer" style={{ color: "var(--color-ledga-brand)", textDecoration: "underline" }}>
            {children}
        </a>
    ),
    h1: ({ children }) => <div style={{ fontSize: 16, fontWeight: 600, margin: "4px 0 8px" }}>{children}</div>,
    h2: ({ children }) => <div style={{ fontSize: 15, fontWeight: 600, margin: "4px 0 8px" }}>{children}</div>,
    h3: ({ children }) => <div style={{ fontSize: 14, fontWeight: 600, margin: "4px 0 8px" }}>{children}</div>,
    blockquote: ({ children }) => (
        <blockquote style={{ margin: "0 0 8px", paddingLeft: 10, borderLeft: "2px solid var(--color-ledga-border)", color: "var(--color-ledga-text-secondary)" }}>{children}</blockquote>
    ),
    hr: () => <hr style={{ border: "none", borderTop: "1px solid var(--color-ledga-border-subtle)", margin: "10px 0" }} />,
    code: ({ children, className }) =>
        className ? (
            <code style={{ display: "block", overflowX: "auto", fontFamily: "monospace", fontSize: 12.5, background: "var(--color-ledga-sidebar)", padding: "8px 10px", borderRadius: 6 }}>
                {children}
            </code>
        ) : (
            <code style={{ fontFamily: "monospace", fontSize: "0.9em", background: "var(--color-ledga-sidebar)", padding: "1px 5px", borderRadius: 4 }}>{children}</code>
        ),
    pre: ({ children }) => <pre style={{ margin: "0 0 8px", overflowX: "auto" }}>{children}</pre>,
    table: ({ children }) => (
        <div style={{ overflowX: "auto", marginBottom: 8 }}>
            <table style={{ borderCollapse: "collapse", fontSize: 13 }}>{children}</table>
        </div>
    ),
    th: ({ children }) => <th style={{ textAlign: "left", padding: "4px 10px", borderBottom: "1px solid var(--color-ledga-border)", fontWeight: 600 }}>{children}</th>,
    td: ({ children }) => <td style={{ padding: "4px 10px", borderBottom: "1px solid var(--color-ledga-border-subtle)" }}>{children}</td>
}

export function Markdown({ content }: { content: string }) {
    return (
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
            {content}
        </ReactMarkdown>
    )
}
