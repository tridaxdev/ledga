import { useState, useEffect, type MouseEvent } from 'react'
import type { Connection } from '@/common/types/Connection'
import { getLedgaAPI } from '../hooks/apiClient'

type FlowState = 'idle' | 'opening' | 'waiting' | 'done'

interface Props {
    isOpen: boolean
    onClose: () => void
    onSuccess: (connection: Connection) => void
}

export function ConnectGmailModal({ isOpen, onClose, onSuccess }: Props) {
    const [state, setState] = useState<FlowState>('idle')

    useEffect(() => {
        if (!isOpen) {
            setState('idle')
        }
    }, [isOpen])

    useEffect(() => {
        if (state !== 'done') return
        const timer = setTimeout(() => {
            onClose()
        }, 2000)
        return () => clearTimeout(timer)
    }, [state, onClose])

    async function handleConnect() {
        setState('opening')
        setTimeout(() => setState('waiting'), 800)
        try {
            const result = await getLedgaAPI().connections.connect()
            if (result.kind === 'success') {
                setState('done')
                onSuccess(result.value)
            } else {
                setState('idle')
            }
        } catch {
            setState('idle')
        }
    }

    function handleCancel() {
        setState('idle')
        onClose()
    }

    if (!isOpen) return null

    return (
        <div
            style={{
                position: 'fixed',
                inset: 0,
                backgroundColor: 'rgba(31, 27, 22, 0.4)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 50
            }}
            onClick={state === 'idle' ? handleCancel : undefined}
        >
            <div
                style={{
                    backgroundColor: 'var(--color-ledga-bg)',
                    border: '1px solid var(--color-ledga-border)',
                    borderRadius: '12px',
                    padding: '32px',
                    maxWidth: '400px',
                    width: '100%',
                    margin: '0 16px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '20px'
                }}
                onClick={(e: MouseEvent) => e.stopPropagation()}
            >
                {state === 'idle' && (
                    <>
                        <div>
                            <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 600, color: 'var(--color-ledga-text)' }}>
                                Connect your Gmail
                            </h2>
                            <p style={{ margin: '8px 0 0', fontSize: '14px', color: 'var(--color-ledga-text-secondary)' }}>
                                Ledga will read your bank transaction emails to build your ledger.
                            </p>
                        </div>
                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                            <button
                                onClick={handleCancel}
                                style={{
                                    padding: '8px 16px',
                                    borderRadius: '6px',
                                    border: '1px solid var(--color-ledga-border)',
                                    backgroundColor: 'transparent',
                                    color: 'var(--color-ledga-text-secondary)',
                                    cursor: 'pointer',
                                    fontSize: '14px'
                                }}
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleConnect}
                                style={{
                                    padding: '8px 16px',
                                    borderRadius: '6px',
                                    border: 'none',
                                    backgroundColor: 'var(--color-ledga-brand)',
                                    color: '#fff',
                                    cursor: 'pointer',
                                    fontSize: '14px',
                                    fontWeight: 500
                                }}
                            >
                                Continue
                            </button>
                        </div>
                    </>
                )}

                {state === 'opening' && (
                    <div style={{ textAlign: 'center', padding: '8px 0' }}>
                        <Spinner />
                        <p style={{ margin: '12px 0 0', color: 'var(--color-ledga-text-secondary)', fontSize: '14px' }}>
                            Opening browser…
                        </p>
                    </div>
                )}

                {state === 'waiting' && (
                    <>
                        <div style={{ textAlign: 'center', padding: '8px 0' }}>
                            <Spinner />
                            <p style={{ margin: '12px 0 0', color: 'var(--color-ledga-text-secondary)', fontSize: '14px' }}>
                                Waiting for authorization…
                            </p>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'center' }}>
                            <button
                                onClick={handleCancel}
                                style={{
                                    padding: '8px 16px',
                                    borderRadius: '6px',
                                    border: '1px solid var(--color-ledga-border)',
                                    backgroundColor: 'transparent',
                                    color: 'var(--color-ledga-text-secondary)',
                                    cursor: 'pointer',
                                    fontSize: '14px'
                                }}
                            >
                                Cancel
                            </button>
                        </div>
                    </>
                )}

                {state === 'done' && (
                    <div style={{ textAlign: 'center', padding: '8px 0' }}>
                        <div style={{ fontSize: '32px', marginBottom: '8px' }}>✓</div>
                        <p style={{ margin: 0, color: 'var(--color-ledga-brand)', fontSize: '16px', fontWeight: 500 }}>
                            Connected!
                        </p>
                    </div>
                )}
            </div>
        </div>
    )
}

function Spinner() {
    return (
        <div
            style={{
                width: '28px',
                height: '28px',
                border: '2px solid var(--color-ledga-border)',
                borderTopColor: 'var(--color-ledga-brand)',
                borderRadius: '50%',
                margin: '0 auto',
                animation: 'spin 0.8s linear infinite'
            }}
        />
    )
}
