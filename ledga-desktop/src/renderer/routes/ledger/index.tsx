import { useState, useEffect, useMemo } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useDateRange, dateRangeToBounds } from '../../hooks/useDateRange'
import { useTransactions } from '../../hooks/useTransactions'
import { useCategories } from '../../hooks/useCategories'
import { useConnections } from '../../hooks/useConnections'
import { DateRangePicker } from '../../components/DateRangePicker'
import { CategoryBadge } from '../../components/CategoryBadge'
import { formatCurrency, formatSignedAmount, formatDate } from '../../utils/formatCurrency'

export const Route = createFileRoute('/ledger/')({ component: LedgerScreen })

function useDebouncedValue<T>(value: T, delayMs: number): T {
    const [debounced, setDebounced] = useState(value)
    useEffect(() => {
        const timer = setTimeout(() => setDebounced(value), delayMs)
        return () => clearTimeout(timer)
    }, [value, delayMs])
    return debounced
}

function LedgerScreen() {
    const navigate = useNavigate()
    const { state: rangeState } = useDateRange()
    const { from, to } = useMemo(() => dateRangeToBounds(rangeState), [rangeState])
    const { categories } = useCategories()
    const { connections } = useConnections()
    const [searchInput, setSearchInput] = useState('')
    const search = useDebouncedValue(searchInput, 250)

    const { transactions, summary, updateCategory } = useTransactions({ from, to, search: search || undefined })

    const categoryById = useMemo(() => new Map(categories.map(c => [c.id, c])), [categories])
    const flagged = transactions.filter(t => t.needs_review)
    const firstFlaggedCategoryId = flagged.find(t => t.category_id)?.category_id ?? null
    const summaryCurrency = transactions[0]?.currency ?? 'NGN'

    return (
        <div style={{ flex: 1, overflowY: 'auto' }}>
            <div style={{ maxWidth: 920, margin: '0 auto', padding: '30px 40px 56px' }}>
                <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, marginBottom: 24 }}>
                    <DateRangePicker />
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <div style={filterPillStyle}>
                            All accounts
                            <ChevronDown />
                        </div>
                        <button style={{ ...filterPillStyle, cursor: 'pointer', fontWeight: 500, color: 'var(--color-ledga-text)' }}>
                            <ImportIcon />
                            Import
                        </button>
                    </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 14 }}>
                    <StatCard label="Balance" value={formatCurrency(summary.balance, summaryCurrency)} sub={`across ${connections.length} source${connections.length === 1 ? '' : 's'}`} />
                    <StatCard label="Money in" value={`+${formatCurrency(summary.moneyIn, summaryCurrency)}`} valueColor="var(--color-ledga-brand)" sub={`${summary.incomeCount} deposit${summary.incomeCount === 1 ? '' : 's'}`} />
                    <StatCard label="Money out" value={`−${formatCurrency(summary.moneyOut, summaryCurrency)}`} sub={`${summary.expenseCount} transaction${summary.expenseCount === 1 ? '' : 's'}`} />
                </div>

                {flagged.length > 0 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 11, background: 'var(--color-ledga-amber)', border: '1px solid var(--color-ledga-amber-border)', borderRadius: 8, padding: '11px 14px', marginBottom: 18 }}>
                        <WarningIcon />
                        <div style={{ flex: 1, fontSize: 13.5, color: 'var(--color-ledga-text-secondary)' }}>
                            <b style={{ color: 'var(--color-ledga-text)' }}>
                                {flagged.length} transaction{flagged.length === 1 ? '' : 's'} need{flagged.length === 1 ? 's' : ''} a look
                            </b>{' '}
                            — parsed with low confidence and saved to your ledger.
                        </div>
                        <button
                            onClick={() => firstFlaggedCategoryId && navigate({ to: '/ledger/$categoryId', params: { categoryId: firstFlaggedCategoryId } })}
                            disabled={!firstFlaggedCategoryId}
                            style={{ border: '1px solid #d9a24c', background: '#fff', borderRadius: 6, padding: '6px 12px', fontSize: 13, fontWeight: 500, color: '#9a7a1a', cursor: firstFlaggedCategoryId ? 'pointer' : 'default' }}
                        >
                            Review
                        </button>
                    </div>
                )}

                {/* overflow left visible (not hidden) so a CategoryBadge "Move to" dropdown opened
                    from a row near the bottom of the table isn't clipped by this container */}
                <div style={{ background: '#fff', border: '1px solid var(--color-ledga-border)', borderRadius: 8, boxShadow: '0 1px 2px rgba(63,56,47,.05)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '13px 16px', borderBottom: '1px solid var(--color-ledga-border-subtle)' }}>
                        <div style={{ fontWeight: 600, fontSize: 15, color: 'var(--color-ledga-text)' }}>Transactions</div>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, border: '1px solid var(--color-ledga-border)', borderRadius: 6, padding: '5px 10px', minWidth: 200 }}>
                            <SearchIcon />
                            <input
                                value={searchInput}
                                onChange={e => setSearchInput(e.target.value)}
                                placeholder="Search transactions"
                                style={{ border: 'none', outline: 'none', background: 'transparent', fontFamily: 'inherit', fontSize: 13, color: 'var(--color-ledga-text)', flex: 1 }}
                            />
                        </div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '78px 1fr 132px 96px 110px', gap: 10, padding: '9px 16px', background: 'var(--color-ledga-sidebar)', borderBottom: '1px solid var(--color-ledga-border-subtle)', fontSize: 10.5, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--color-ledga-text-muted)' }}>
                        <span>Date</span><span>Merchant</span><span>Category</span><span>Source</span><span style={{ textAlign: 'right' }}>Amount</span>
                    </div>
                    {transactions.length === 0 ? (
                        <div style={{ padding: '32px 16px', textAlign: 'center', fontSize: 13.5, color: 'var(--color-ledga-text-muted)' }}>
                            No transactions in this range.
                        </div>
                    ) : (
                        transactions.map(t => {
                            const category = t.category_id ? categoryById.get(t.category_id) : undefined
                            return (
                                <div
                                    key={t.id}
                                    style={{ display: 'grid', gridTemplateColumns: '78px 1fr 132px 96px 110px', gap: 10, padding: '11px 16px', alignItems: 'center', borderBottom: '1px solid var(--color-ledga-border-subtle)', background: t.needs_review ? '#fdf6e7' : 'transparent' }}
                                >
                                    <span style={{ fontSize: 13, color: 'var(--color-ledga-text-secondary)', fontVariantNumeric: 'tabular-nums' }}>{formatDate(t.timestamp)}</span>
                                    <span style={{ minWidth: 0, overflow: 'hidden' }}>
                                        <span style={{ display: 'block', fontSize: 13.5, color: 'var(--color-ledga-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.merchant}</span>
                                        <span style={{ display: 'block', fontSize: 11, color: 'var(--color-ledga-text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.bank}</span>
                                    </span>
                                    <span>
                                        <CategoryBadge
                                            label={category?.name ?? (t.needs_review ? 'Review' : 'Uncategorized')}
                                            flagged={t.needs_review}
                                            categories={categories}
                                            currentCategoryId={t.category_id}
                                            onSelect={categoryId => updateCategory(t.id, categoryId)}
                                        />
                                    </span>
                                    <span style={{ fontSize: 12, color: 'var(--color-ledga-text-muted)' }}>{t.source === 'gmail' ? 'Gmail' : 'CSV'}</span>
                                    <span style={{ fontSize: 13.5, fontWeight: 600, textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: t.type === 'credit' ? 'var(--color-ledga-brand)' : 'var(--color-ledga-text)' }}>
                                        {formatSignedAmount(t.amount, t.type, t.currency)}
                                    </span>
                                </div>
                            )
                        })
                    )}
                </div>
            </div>
        </div>
    )
}

const filterPillStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 7,
    border: '1px solid var(--color-ledga-border)',
    background: '#fff',
    borderRadius: 6,
    padding: '7px 11px',
    fontSize: 13,
    color: 'var(--color-ledga-text-secondary)'
}

function StatCard({ label, value, sub, valueColor }: { label: string; value: string; sub: string; valueColor?: string }) {
    return (
        <div style={{ background: '#fff', border: '1px solid var(--color-ledga-border)', borderRadius: 8, padding: '16px 18px', boxShadow: '0 1px 2px rgba(63,56,47,.05)' }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--color-ledga-text-muted)' }}>{label}</div>
            <div style={{ fontFamily: 'var(--font-serif)', fontSize: 30, fontWeight: 600, color: valueColor ?? 'var(--color-ledga-text)', marginTop: 6, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
            <div style={{ fontSize: 12, color: 'var(--color-ledga-text-secondary)', marginTop: 2 }}>{sub}</div>
        </div>
    )
}

function ChevronDown() {
    return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-ledga-text-muted)" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
            <path d="m6 9 6 6 6-6" />
        </svg>
    )
}

function ImportIcon() {
    return (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 3v12M7 10l5 5 5-5M5 21h14" />
        </svg>
    )
}

function SearchIcon() {
    return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-ledga-text-muted)" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" />
        </svg>
    )
}

function WarningIcon() {
    return (
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#b07d22" strokeWidth="1.85" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
        </svg>
    )
}
