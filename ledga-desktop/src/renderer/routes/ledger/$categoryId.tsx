import { useMemo } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useDateRange, dateRangeToBounds } from '../../hooks/useDateRange'
import { useCategoryTransactions } from '../../hooks/useCategoryTransactions'
import { useCategories } from '../../hooks/useCategories'
import { CategoryBadge } from '../../components/CategoryBadge'
import { formatCurrency, formatSignedAmount, formatDate } from '../../utils/formatCurrency'

export const Route = createFileRoute('/ledger/$categoryId')({ component: CategoryReviewScreen })

function CategoryReviewScreen() {
    const { categoryId } = Route.useParams()
    const navigate = useNavigate()
    const { state: rangeState } = useDateRange()
    const { from, to, title } = useMemo(() => dateRangeToBounds(rangeState), [rangeState])
    const { categories } = useCategories()
    const category = categories.find(c => c.id === categoryId)

    const { transactions, aggregate, flagged, updateCategory, keepSuggestion } = useCategoryTransactions({ categoryId, from, to })

    const categoryById = useMemo(() => new Map(categories.map(c => [c.id, c])), [categories])
    const currency = transactions[0]?.currency ?? 'NGN'
    // aggregate.priorMonthTotal is always exactly one calendar month's total (the month before
    // `from`), which is only a meaningful comparison when the selected range IS a single month --
    // for year/custom ranges it would compare e.g. a full year's spend to one prior month, an
    // apples-to-oranges percentage. Only show the trend when the range is month-scoped.
    const isMonthRange = rangeState.mode === 'month'
    const trendDelta = aggregate.total - aggregate.priorMonthTotal
    const trendPercent = isMonthRange && aggregate.priorMonthTotal > 0 ? (trendDelta / aggregate.priorMonthTotal) * 100 : null
    const maxBar = Math.max(aggregate.total, aggregate.priorMonthTotal, 1)

    return (
        <div style={{ flex: 1, overflowY: 'auto' }}>
            <div style={{ maxWidth: 920, margin: '0 auto', padding: '24px 40px 56px' }}>
                <button
                    onClick={() => navigate({ to: '/ledger' })}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-ledga-text-muted)', fontSize: 13, fontWeight: 500, fontFamily: 'inherit', padding: 0, marginBottom: 16 }}
                >
                    <BackIcon />
                    Ledger
                </button>

                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 22 }}>
                    <div>
                        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--color-ledga-text-muted)', marginBottom: 6 }}>
                            Category review
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                            <span style={{ width: 13, height: 13, borderRadius: '50%', flexShrink: 0, background: category?.color ?? 'var(--color-ledga-text-muted)' }} />
                            <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: 34, fontWeight: 600, letterSpacing: '-0.01em', margin: 0, color: 'var(--color-ledga-text)' }}>
                                {category?.name ?? 'Uncategorized'}
                            </h1>
                        </div>
                        <div style={{ fontSize: 14, color: 'var(--color-ledga-text-secondary)', marginTop: 7 }}>
                            {aggregate.count} transaction{aggregate.count === 1 ? '' : 's'} in {title}
                        </div>
                    </div>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, border: '1px solid var(--color-ledga-border)', background: '#fff', borderRadius: 6, padding: '7px 11px', fontSize: 13, color: 'var(--color-ledga-text-secondary)', marginTop: 24, flexShrink: 0 }}>
                        {title}
                    </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 18 }}>
                    <div style={statCardStyle}>
                        <div style={statLabelStyle}>Total spent</div>
                        <div style={statValueStyle}>{formatCurrency(aggregate.total, currency)}</div>
                    </div>
                    <div style={statCardStyle}>
                        <div style={statLabelStyle}>Transactions</div>
                        <div style={statValueStyle}>{aggregate.count}</div>
                    </div>
                    <div style={{ ...statCardStyle, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                        <div>
                            <div style={statLabelStyle}>vs prior month</div>
                            <div style={{ ...statValueStyle, color: trendDelta > 0 ? 'var(--color-ledga-danger)' : 'var(--color-ledga-brand)' }}>
                                {trendPercent === null ? '—' : `${trendDelta > 0 ? '+' : ''}${trendPercent.toFixed(0)}%`}
                            </div>
                            {!isMonthRange && (
                                <div style={{ fontSize: 12, color: 'var(--color-ledga-text-secondary)', marginTop: 2 }}>Switch to Month view to compare</div>
                            )}
                        </div>
                        {isMonthRange && (
                            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 38, flexShrink: 0 }}>
                                <div style={{ width: 10, borderRadius: 2, background: 'var(--color-ledga-border)', height: Math.max(4, (aggregate.priorMonthTotal / maxBar) * 38) }} />
                                <div style={{ width: 10, borderRadius: 2, background: 'var(--color-ledga-brand)', height: Math.max(4, (aggregate.total / maxBar) * 38) }} />
                            </div>
                        )}
                    </div>
                </div>

                {flagged.length > 0 ? (
                    <div style={{ marginBottom: 20 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 9 }}>
                            <WarningIcon />
                            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-ledga-text)' }}>
                                {flagged.length} suggestion{flagged.length === 1 ? '' : 's'} to review
                            </span>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                            {flagged.map(t => (
                                <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 14, background: 'var(--color-ledga-amber)', border: '1px solid var(--color-ledga-amber-border)', borderRadius: 9, padding: '12px 14px' }}>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--color-ledga-text)' }}>{t.merchant}</div>
                                        <div style={{ fontSize: 12, color: 'var(--color-ledga-text-muted)' }}>{formatDate(t.timestamp)} · {t.bank}</div>
                                    </div>
                                    {t.suggestedCategoryName && (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'var(--color-ledga-text-secondary)', flexShrink: 0 }}>
                                            <span style={{ border: '1px solid var(--color-ledga-border)', background: '#fff', borderRadius: 999, padding: '2px 9px' }}>
                                                {category?.name ?? 'Uncategorized'}
                                            </span>
                                            <ArrowIcon />
                                            <span style={{ border: '1px solid var(--color-ledga-brand-border)', background: 'var(--color-ledga-brand-bg)', color: 'var(--color-ledga-brand)', borderRadius: 999, padding: '2px 9px', fontWeight: 500 }}>
                                                {t.suggestedCategoryName}
                                            </span>
                                        </div>
                                    )}
                                    <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--color-ledga-text)', fontVariantNumeric: 'tabular-nums', flexShrink: 0, width: 90, textAlign: 'right' }}>
                                        {formatSignedAmount(t.amount, t.type, t.currency)}
                                    </span>
                                    <div style={{ display: 'flex', gap: 7, flexShrink: 0 }}>
                                        <button onClick={() => keepSuggestion(t.id)} style={keepButtonStyle}>Keep</button>
                                        {t.suggestedCategoryId && (
                                            <button onClick={() => updateCategory(t.id, t.suggestedCategoryId)} style={moveButtonStyle}>
                                                Move to {t.suggestedCategoryName}
                                            </button>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                ) : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 9, background: 'var(--color-ledga-brand-bg)', border: '1px solid var(--color-ledga-brand-border)', borderRadius: 9, padding: '11px 14px', marginBottom: 20 }}>
                        <CheckIcon />
                        <span style={{ fontSize: 13.5, color: 'var(--color-ledga-text-secondary)' }}>Everything here looks correctly categorized.</span>
                    </div>
                )}

                <div style={{ background: '#fff', border: '1px solid var(--color-ledga-border)', borderRadius: 8, boxShadow: '0 1px 2px rgba(63,56,47,.05)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '13px 16px', borderBottom: '1px solid var(--color-ledga-border-subtle)' }}>
                        <div style={{ fontWeight: 600, fontSize: 15, color: 'var(--color-ledga-text)' }}>Transactions in {category?.name ?? 'Uncategorized'}</div>
                        <span style={{ fontSize: 12, color: 'var(--color-ledga-text-muted)' }}>{aggregate.count} total</span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '78px 1fr 150px 110px', gap: 10, padding: '9px 16px', background: 'var(--color-ledga-sidebar)', borderBottom: '1px solid var(--color-ledga-border-subtle)', fontSize: 10.5, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--color-ledga-text-muted)' }}>
                        <span>Date</span><span>Merchant</span><span>Category</span><span style={{ textAlign: 'right' }}>Amount</span>
                    </div>
                    {transactions.length === 0 ? (
                        <div style={{ padding: '32px 16px', textAlign: 'center', fontSize: 13.5, color: 'var(--color-ledga-text-muted)' }}>
                            No transactions in this category for {title}.
                        </div>
                    ) : (
                        transactions.map(t => (
                            <div key={t.id} style={{ display: 'grid', gridTemplateColumns: '78px 1fr 150px 110px', gap: 10, padding: '11px 16px', alignItems: 'center', borderBottom: '1px solid var(--color-ledga-border-subtle)', background: t.needs_review ? '#fdf6e7' : 'transparent' }}>
                                <span style={{ fontSize: 13, color: 'var(--color-ledga-text-secondary)', fontVariantNumeric: 'tabular-nums' }}>{formatDate(t.timestamp)}</span>
                                <span style={{ minWidth: 0, overflow: 'hidden' }}>
                                    <span style={{ display: 'block', fontSize: 13.5, color: 'var(--color-ledga-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.merchant}</span>
                                    <span style={{ display: 'block', fontSize: 11, color: 'var(--color-ledga-text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.bank}</span>
                                </span>
                                <span>
                                    <CategoryBadge
                                        label={categoryById.get(t.category_id ?? '')?.name ?? (t.needs_review ? 'Review' : 'Uncategorized')}
                                        flagged={t.needs_review}
                                        categories={categories}
                                        currentCategoryId={t.category_id}
                                        onSelect={newCategoryId => updateCategory(t.id, newCategoryId)}
                                    />
                                </span>
                                <span style={{ fontSize: 13.5, fontWeight: 600, textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: t.type === 'credit' ? 'var(--color-ledga-brand)' : 'var(--color-ledga-text)' }}>
                                    {formatSignedAmount(t.amount, t.type, t.currency)}
                                </span>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    )
}

const statCardStyle: React.CSSProperties = {
    background: '#fff',
    border: '1px solid var(--color-ledga-border)',
    borderRadius: 8,
    padding: '16px 18px',
    boxShadow: '0 1px 2px rgba(63,56,47,.05)'
}

const statLabelStyle: React.CSSProperties = {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    color: 'var(--color-ledga-text-muted)'
}

const statValueStyle: React.CSSProperties = {
    fontFamily: 'var(--font-serif)',
    fontSize: 30,
    fontWeight: 600,
    color: 'var(--color-ledga-text)',
    marginTop: 6,
    fontVariantNumeric: 'tabular-nums'
}

const keepButtonStyle: React.CSSProperties = {
    border: '1px solid var(--color-ledga-border)',
    background: '#fff',
    borderRadius: 6,
    padding: '6px 11px',
    fontSize: 13,
    fontWeight: 500,
    color: 'var(--color-ledga-text-secondary)',
    cursor: 'pointer',
    fontFamily: 'inherit'
}

const moveButtonStyle: React.CSSProperties = {
    border: 'none',
    background: 'var(--color-ledga-brand)',
    color: '#fff',
    borderRadius: 6,
    padding: '6px 12px',
    fontSize: 13,
    fontWeight: 500,
    cursor: 'pointer',
    fontFamily: 'inherit',
    whiteSpace: 'nowrap'
}

function BackIcon() {
    return (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.85" strokeLinecap="round" strokeLinejoin="round">
            <path d="m15 18-6-6 6-6" />
        </svg>
    )
}

function WarningIcon() {
    return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#b07d22" strokeWidth="1.85" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
        </svg>
    )
}

function ArrowIcon() {
    return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#b07d22" strokeWidth="1.85" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12h14M13 6l6 6-6 6" />
        </svg>
    )
}

function CheckIcon() {
    return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-ledga-brand)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 6 9 17l-5-5" />
        </svg>
    )
}
