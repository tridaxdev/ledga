import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useConnections } from '../../hooks/useConnections'
import { ConnectGmailModal } from '../../components/ConnectGmailModal'
import type { Connection } from '@/common/types/Connection'

export const Route = createFileRoute('/settings')({ component: SettingsScreen })

function SettingsScreen() {
    const { connections, isLoading, disconnect } = useConnections()
    const [modalOpen, setModalOpen] = useState(false)

    function handleSuccess(_connection: Connection) {
        setModalOpen(false)
    }

    return (
        <div style={{ padding: '40px', maxWidth: '640px' }}>
            <h1 style={{ fontSize: '22px', fontWeight: 600, color: 'var(--color-ledga-text)', margin: '0 0 32px' }}>
                Settings
            </h1>

            <section>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                    <h2 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--color-ledga-text)', margin: 0 }}>
                        Sources
                    </h2>
                    <button
                        onClick={() => setModalOpen(true)}
                        style={{
                            padding: '6px 14px',
                            borderRadius: '6px',
                            border: '1px solid var(--color-ledga-brand-border)',
                            backgroundColor: 'var(--color-ledga-brand-bg)',
                            color: 'var(--color-ledga-brand)',
                            cursor: 'pointer',
                            fontSize: '13px',
                            fontWeight: 500
                        }}
                    >
                        Add Source
                    </button>
                </div>

                {isLoading ? (
                    <p style={{ fontSize: '14px', color: 'var(--color-ledga-text-muted)' }}>Loading…</p>
                ) : connections.length === 0 ? (
                    <div
                        style={{
                            padding: '24px',
                            borderRadius: '8px',
                            border: '1px dashed var(--color-ledga-border)',
                            textAlign: 'center'
                        }}
                    >
                        <p style={{ margin: 0, fontSize: '14px', color: 'var(--color-ledga-text-muted)' }}>
                            No email accounts connected. Add one to start syncing transactions.
                        </p>
                    </div>
                ) : (
                    <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {connections.map(connection => (
                            <li
                                key={connection.id}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    padding: '12px 16px',
                                    borderRadius: '8px',
                                    border: '1px solid var(--color-ledga-border)',
                                    backgroundColor: 'var(--color-ledga-sidebar)'
                                }}
                            >
                                <span style={{ fontSize: '14px', color: 'var(--color-ledga-text)' }}>
                                    {connection.email}
                                </span>
                                <button
                                    onClick={() => disconnect(connection.id)}
                                    style={{
                                        padding: '4px 12px',
                                        borderRadius: '5px',
                                        border: '1px solid var(--color-ledga-border)',
                                        backgroundColor: 'transparent',
                                        color: 'var(--color-ledga-danger)',
                                        cursor: 'pointer',
                                        fontSize: '13px'
                                    }}
                                >
                                    Disconnect
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
            </section>

            <ConnectGmailModal
                isOpen={modalOpen}
                onClose={() => setModalOpen(false)}
                onSuccess={handleSuccess}
            />
        </div>
    )
}
