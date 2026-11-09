'use client'

import { ChevronDown, ChevronRight, ChevronUp } from 'lucide-react'
import { useId, useState, type ReactNode } from 'react'

import { Button } from './button'
import { cx } from './cx'

type PageHeaderProps = {
  title: ReactNode
  eyebrow?: ReactNode
  description?: ReactNode
  actions?: ReactNode
  // Featured (default): ink panel, optionally with 2-4 key figures. The user chose it for
  // every page (2026-10-01). Simple: white card with breadcrumb eyebrow; kept but unused.
  variant?: 'featured' | 'simple'
  stats?: ReactNode
  breadcrumb?: ReactNode
}

// On a phone only the title and actions stay visible, so daily work starts above the fold;
// the key figures wait behind the «Resumen» button (user decision, 2026-11-09).
function FeaturedPageHeader({ title, eyebrow, description, actions, stats }: Omit<PageHeaderProps, 'variant' | 'breadcrumb'>) {
  const [summaryOpen, setSummaryOpen] = useState(false)
  const statsId = useId()
  const mobileDetail = summaryOpen ? undefined : 'hidden md:block'

  return (
    <header className="relative flex flex-col gap-3 overflow-hidden rounded-panel bg-ink p-4 md:gap-[22px] md:p-[30px]">
      <span aria-hidden="true" className="pointer-events-none absolute -right-[90px] -top-[150px] size-[380px] rounded-full border border-on-ink-line" />
      <span aria-hidden="true" className="pointer-events-none absolute -top-[60px] right-[30px] size-[210px] rounded-full border border-on-ink-line" />
      <div className="relative flex flex-wrap items-center justify-between gap-3 md:items-end md:gap-5">
        <div className="min-w-0 flex-1 md:max-w-[620px] md:flex-none">
          {eyebrow ? <p className={cx('text-xs font-bold uppercase tracking-[0.16em] text-on-ink-eyebrow', mobileDetail)}>{eyebrow}</p> : null}
          <h1 className={cx('font-display text-[24px] font-bold leading-[1.08] tracking-[-0.03em] text-white md:mt-2 md:text-[38px]', summaryOpen && 'mt-2')}>{title}</h1>
          {description ? <p className={cx('mt-2 text-[15px] leading-[1.55] text-on-ink-body', mobileDetail)}>{description}</p> : null}
        </div>
        {stats ? (
          <Button variant="inverse" icon={summaryOpen ? ChevronUp : ChevronDown} className="md:hidden" aria-expanded={summaryOpen} aria-controls={statsId} onClick={() => setSummaryOpen((open) => !open)}>
            Resumen
          </Button>
        ) : null}
        {actions ? <div className="flex w-full flex-wrap gap-2.5 md:w-auto">{actions}</div> : null}
      </div>
      {stats ? <div id={statsId} className={cx('relative grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-2.5', summaryOpen ? 'grid' : 'hidden md:grid')}>{stats}</div> : null}
    </header>
  )
}

export function PageHeader({ title, eyebrow, description, actions, variant = 'featured', stats, breadcrumb }: PageHeaderProps) {
  if (variant === 'featured') {
    return <FeaturedPageHeader title={title} eyebrow={eyebrow} description={description} actions={actions} stats={stats} />
  }

  return (
    <header className="flex flex-wrap items-end justify-between gap-4 rounded-card border border-line-card bg-surface px-5 py-5 md:px-[26px] md:py-[22px]">
      <div className="min-w-0">
        {breadcrumb ?? (eyebrow ? (
          <p className="flex items-center gap-1.5 text-[13px] text-text-muted">
            {eyebrow}
            <ChevronRight aria-hidden="true" size={13} className="text-text-disabled" />
            <span className="font-semibold text-ink">{title}</span>
          </p>
        ) : null)}
        <h1 className={cx('font-display text-[28px] font-bold tracking-[-0.03em] text-ink md:text-[32px]', Boolean(breadcrumb || eyebrow) && 'mt-1.5')}>{title}</h1>
        {description ? <p className="mt-1 text-[15px] text-text-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2.5">{actions}</div> : null}
    </header>
  )
}
