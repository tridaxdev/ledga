import { useState, useEffect } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useConnections } from '../../hooks/useConnections'
import { ConnectGmailModal } from '../../components/ConnectGmailModal'
import { RulesSection } from '../../components/RulesSection'
import { getLedgaAPI } from '../../hooks/apiClient'
import type { Connection } from '@/common/types/Connection'

export const Route = createFileRoute('/settings/')({ component: SettingsScreen })

function SettingsScreen() {
    const { connections, isLoading, disconnect, syncNow, setAutoSync } = useConnections()
    const [modalOpen, setModalOpen] = useState(false)
    const [justSyncedIds, setJustSyncedIds] = useState<Set<string>>(new Set())
    const [syncingIds, setSyncingIds] = useState<Set<string>>(new Set())

    function handleSuccess(_connection: Connection) {
        setModalOpen(false)
    }

    async function handleSyncNow(id: string) {
        setSyncingIds(prev => new Set(prev).add(id))
        await syncNow(id)
        setSyncingIds(prev => {
            const next = new Set(prev)
            next.delete(id)
            return next
        })
        setJustSyncedIds(prev => new Set(prev).add(id))
    }

    return (
        <div style={{ padding: '40px', maxWidth: '640px' }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--color-ledga-text-muted)', marginBottom: 4 }}>
                Settings
            </div>
            <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: 32, fontWeight: 600, letterSpacing: '-0.01em', margin: '0 0 32px', color: 'var(--color-ledga-text)' }}>
                Sources &amp; data
            </h1>

            <section>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                    <h2 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--color-ledga-text)', margin: 0 }}>
                        Connected sources
                    </h2>
                </div>

                {isLoading ? (
                    <p style={{ fontSize: '14px', color: 'var(--color-ledga-text-muted)' }}>Loading…</p>
                ) : connections.length === 0 ? (
                    <div style={{ padding: '24px', borderRadius: '8px', border: '1px dashed var(--color-ledga-border)', textAlign: 'center', marginBottom: 14 }}>
                        <p style={{ margin: 0, fontSize: '14px', color: 'var(--color-ledga-text-muted)' }}>
                            No email accounts connected. Add one to start syncing transactions.
                        </p>
                    </div>
                ) : (
                    <ul style={{ listStyle: 'none', margin: '0 0 14px', padding: 0, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {connections.map(connection => (
                            <li
                                key={connection.id}
                                style={{
                                    borderRadius: '8px',
                                    border: '1px solid var(--color-ledga-border)',
                                    backgroundColor: '#fff',
                                    overflow: 'hidden'
                                }}
                            >
                                <div style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '15px 16px', borderBottom: '1px solid var(--color-ledga-border-subtle)' }}>
                                    <span style={{ width: 36, height: 36, borderRadius: 8, background: 'var(--color-ledga-brand-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                        <MailIcon />
                                    </span>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--color-ledga-text)' }}>{connection.email}</div>
                                        <div style={{ fontSize: 12, color: 'var(--color-ledga-brand)' }}>
                                            {syncingIds.has(connection.id)
                                                ? 'Syncing…'
                                                : justSyncedIds.has(connection.id)
                                                    ? 'Synced just now'
                                                    : connection.auto_sync
                                                        ? 'auto-sync on'
                                                        : 'manual sync'}
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                        <span style={{ fontSize: 12, color: 'var(--color-ledga-text-secondary)' }}>Auto-sync</span>
                                        <Toggle checked={connection.auto_sync} onChange={checked => setAutoSync(connection.id, checked)} />
                                    </div>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 16px' }}>
                                    <button
                                        onClick={() => handleSyncNow(connection.id)}
                                        disabled={syncingIds.has(connection.id)}
                                        style={{ ...secondaryButtonStyle, borderColor: 'var(--color-ledga-brand-border)', color: 'var(--color-ledga-brand)', opacity: syncingIds.has(connection.id) ? 0.6 : 1 }}
                                    >
                                        {syncingIds.has(connection.id) ? 'Syncing…' : 'Sync now'}
                                    </button>
                                    <button onClick={() => disconnect(connection.id)} style={{ ...secondaryButtonStyle, borderColor: '#e7c6b9', color: 'var(--color-ledga-danger)' }}>
                                        Disconnect
                                    </button>
                                </div>
                            </li>
                        ))}
                    </ul>
                )}

                <button onClick={() => setModalOpen(true)} style={addSourceButtonStyle}>
                    <PlusIcon />
                    Add source
                </button>
            </section>

            <RulesSection />

            <DataSection connections={connections} />

            <ConnectGmailModal
                isOpen={modalOpen}
                onClose={() => setModalOpen(false)}
                onSuccess={handleSuccess}
            />
        </div>
    )
}

function DataSection({ connections }: { connections: Connection[] }) {
    const navigate = useNavigate()
    const [dbPath, setDbPath] = useState('')
    const [exportStatus, setExportStatus] = useState<string | null>(null)
    const [confirmingClear, setConfirmingClear] = useState(false)
    const [isClearing, setIsClearing] = useState(false)

    const anyAutoSync = connections.some(c => c.auto_sync)

    useEffect(() => {
        getLedgaAPI().settings.getDbPath().then(result => {
            if (result.kind === 'success') setDbPath(result.value)
        })
    }, [])

    async function handleReveal() {
        await getLedgaAPI().settings.revealDb()
    }

    async function handleExport() {
        setExportStatus(null)
        const result = await getLedgaAPI().settings.exportCsv()
        if (result.kind === 'success') {
            setExportStatus(result.value ? `Saved to ${result.value}` : null)
        } else {
            setExportStatus(`Export failed: ${result.error.message}`)
        }
    }

    async function handleClearData() {
        setIsClearing(true)
        const result = await getLedgaAPI().settings.clearData()
        setIsClearing(false)
        setConfirmingClear(false)
        if (result.kind === 'success') {
            navigate({ to: '/ledger' })
        }
    }

    return (
        <section style={{ marginTop: 32 }}>
            <h2 style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-ledga-text)', margin: '0 0 16px' }}>Data &amp; privacy</h2>

            <div style={{ background: '#fff', border: '1px solid var(--color-ledga-border)', borderRadius: 8, overflow: 'hidden' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', borderBottom: '1px solid var(--color-ledga-border-subtle)' }}>
                    <div>
                        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--color-ledga-text-muted)' }}>Database</div>
                        <div style={{ fontSize: 13.5, color: 'var(--color-ledga-text)', fontFamily: 'monospace', marginTop: 3 }}>{dbPath}</div>
                    </div>
                    <button onClick={handleReveal} style={secondaryButtonStyle}>Reveal</button>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', borderBottom: '1px solid var(--color-ledga-border-subtle)' }}>
                    <div style={{ fontSize: 14, color: 'var(--color-ledga-text)' }}>Sync frequency</div>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, border: '1px solid var(--color-ledga-border)', borderRadius: 999, padding: '5px 12px', fontSize: 13, color: 'var(--color-ledga-text-secondary)' }}>
                        {anyAutoSync ? 'Real-time (watch)' : 'Manual only'}
                    </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', borderBottom: '1px solid var(--color-ledga-border-subtle)' }}>
                    <div>
                        <div style={{ fontSize: 14, color: 'var(--color-ledga-text)' }}>Export everything</div>
                        <div style={{ fontSize: 12, color: 'var(--color-ledga-text-muted)' }}>{exportStatus ?? 'All transactions as CSV.'}</div>
                    </div>
                    <button onClick={handleExport} style={{ ...secondaryButtonStyle, borderColor: 'var(--color-ledga-brand-border)', color: 'var(--color-ledga-brand)', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <ExportIcon />
                        Export CSV
                    </button>
                </div>

                <div style={{ padding: '14px 16px' }}>
                    {!confirmingClear ? (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <div>
                                <div style={{ fontSize: 14, color: 'var(--color-ledga-danger)', fontWeight: 500 }}>Clear all data</div>
                                <div style={{ fontSize: 12, color: 'var(--color-ledga-text-muted)' }}>Deletes the local ledger. Cannot be undone.</div>
                            </div>
                            <button onClick={() => setConfirmingClear(true)} style={{ ...secondaryButtonStyle, borderColor: '#e7c6b9', color: 'var(--color-ledga-danger)' }}>
                                Clear
                            </button>
                        </div>
                    ) : (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <div style={{ fontSize: 13.5, color: 'var(--color-ledga-text)', fontWeight: 500 }}>
                                Delete every transaction, email, and chat? This can&apos;t be undone.
                            </div>
                            <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                                <button onClick={() => setConfirmingClear(false)} style={secondaryButtonStyle}>Cancel</button>
                                <button
                                    onClick={handleClearData}
                                    disabled={isClearing}
                                    style={{ border: 'none', background: 'var(--color-ledga-danger)', color: '#fff', borderRadius: 6, padding: '6px 12px', fontSize: 13, fontWeight: 500, cursor: 'pointer', opacity: isClearing ? 0.6 : 1 }}
                                >
                                    {isClearing ? 'Clearing…' : 'Confirm clear'}
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 14, color: 'var(--color-ledga-text-muted)', fontSize: 12.5 }}>
                <ShieldIcon />
                No cloud — everything lives in one file on this device.
            </div>
        </section>
    )
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (checked: boolean) => void }) {
    return (
        <button
            onClick={() => onChange(!checked)}
            style={{
                width: 42,
                height: 24,
                borderRadius: 999,
                position: 'relative',
                cursor: 'pointer',
                border: 'none',
                flexShrink: 0,
                background: checked ? 'var(--color-ledga-brand)' : 'var(--color-ledga-border)',
                transition: 'background .18s'
            }}
        >
            <span
                style={{
                    position: 'absolute',
                    top: 2,
                    left: checked ? 20 : 2,
                    width: 20,
                    height: 20,
                    borderRadius: '50%',
                    background: '#fff',
                    boxShadow: '0 1px 2px rgba(0,0,0,.2)',
                    transition: 'left .18s'
                }}
            />
        </button>
    )
}

const secondaryButtonStyle: React.CSSProperties = {
    border: '1px solid var(--color-ledga-border)',
    background: '#fff',
    borderRadius: 6,
    padding: '6px 12px',
    fontSize: 13,
    fontWeight: 500,
    color: 'var(--color-ledga-text)',
    cursor: 'pointer'
}

const addSourceButtonStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 7,
    border: '1px dashed #b9ad95',
    background: 'transparent',
    borderRadius: 6,
    padding: '8px 14px',
    fontSize: 13,
    fontWeight: 500,
    color: 'var(--color-ledga-text)',
    cursor: 'pointer'
}

function MailIcon() {
    return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--color-ledga-brand)" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" />
        </svg>
    )
}

function PlusIcon() {
    return (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.85" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 5v14M5 12h14" />
        </svg>
    )
}

function ExportIcon() {
    return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 3v12M7 10l5 5 5-5M5 21h14" />
        </svg>
    )
}

function ShieldIcon() {
    return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" />
        </svg>
    )
}
