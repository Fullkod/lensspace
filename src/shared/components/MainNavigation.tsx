'use client'

import Link, { useLinkStatus } from 'next/link'
import { usePathname } from 'next/navigation'
import { BookOpen, Bug, Building, Factory, FileText, LayoutDashboard, LoaderCircle, Plus, ReceiptText, Tags, Users, UsersRound, Wallet, type LucideIcon } from 'lucide-react'

import { useNavigationCounts } from '@/shared/lib/navigation-counters'
import { ButtonLink, cx } from '@/shared/ui'

const noCounts: Record<string, number> = {}
// QA-33: each viewport prefetch re-sends the ~2.6 KB auth cookie. Keep it only for
// the daily routes; the rest load on tap with the pending icon below (QA-29).
const prefetchedHrefs = new Set(['/orders'])

// QA-29: immediate feedback on tap, in the icon slot so nothing shifts.
function NavIcon({ icon: Icon, isActive }: { icon: LucideIcon; isActive: boolean }) {
  const { pending } = useLinkStatus()
  return pending
    ? <LoaderCircle aria-hidden="true" size={18} className="animate-spin text-mint" />
    : <Icon aria-hidden="true" size={18} className={isActive ? 'text-mint' : 'text-on-ink-subtle'} />
}

const navigationSections: { label: string; items: { href: string; label: string; icon: LucideIcon }[] }[] = [
  {
    label: 'Operación',
    items: [
      { href: '/dashboard', label: 'Panel principal', icon: LayoutDashboard },
      { href: '/orders', label: 'Pedidos y cobros', icon: ReceiptText },
      { href: '/customers', label: 'Clientes', icon: Users },
      { href: '/prescriptions', label: 'Recetas', icon: FileText },
      { href: '/production', label: 'Producción', icon: Factory },
      { href: '/cashbox', label: 'Caja y cierres', icon: Wallet },
    ],
  },
  {
    label: 'Gestión',
    items: [
      { href: '/catalog', label: 'Catálogo y precios', icon: Tags },
      { href: '/team', label: 'Equipo', icon: UsersRound },
      { href: '/organizations', label: 'Organizaciones', icon: Building },
      { href: '/errors', label: 'Errores', icon: Bug },
      { href: '/manual', label: 'Manual del sistema', icon: BookOpen },
    ],
  },
]

// The active accent bar sits at -14px: containers must keep a 14px (px-3.5) horizontal padding.
// `counts` maps an href to its pending figure (guide: pill after the label, hidden at 0).
export function MainNavigation({ allowedHrefs, counts: serverCounts = noCounts, canCreateSale = allowedHrefs.includes('/sales'), onNavigate }: { allowedHrefs: string[]; counts?: Record<string, number>; canCreateSale?: boolean; onNavigate?: () => void }) {
  const pathname = usePathname()
  const counts = useNavigationCounts(serverCounts)
  const visibleSections = navigationSections
    .map((section) => ({ ...section, items: section.items.filter(({ href }) => allowedHrefs.includes(href)) }))
    .filter(({ items }) => items.length)

  return (
    <nav aria-label="Navegación principal" className="mt-[22px]">
      {canCreateSale ? (
        <ButtonLink href="/sales" onClick={onNavigate} variant="mint" icon={Plus} block aria-current={pathname === '/sales' ? 'page' : undefined}>
          Nueva venta
        </ButtonLink>
      ) : null}
      {visibleSections.map((section, sectionIndex) => (
        <div key={section.label} className={cx('flex flex-col gap-0.5', (sectionIndex > 0 || canCreateSale) && 'pt-[22px]')}>
          <p className="px-3 pb-2 text-[11px] font-bold uppercase tracking-[0.16em] text-on-ink-subtle">{section.label}</p>
          {section.items.map(({ href, label, icon: Icon }) => {
            const isActive = pathname === href || pathname.startsWith(`${href}/`)
            const count = counts[href] ?? 0
            return (
              <Link
                key={href}
                href={href}
                prefetch={prefetchedHrefs.has(href) ? undefined : false}
                onClick={onNavigate}
                aria-current={isActive ? 'page' : undefined}
                className={cx(
                  'relative flex min-h-[42px] items-center gap-3 rounded-control px-3 text-[14.5px] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mint',
                  isActive ? 'bg-ink-2 font-semibold text-white' : 'font-medium text-on-ink-muted hover:bg-ink-2 hover:text-white',
                )}
              >
                <span aria-hidden="true" className={cx('absolute -left-3.5 bottom-2.5 top-2.5 w-[3px] rounded-r-[3px]', isActive ? 'bg-mint' : 'bg-transparent')} />
                <NavIcon icon={Icon} isActive={isActive} />
                <span className="flex-1">{label}</span>
                {count > 0 ? <span className={cx('grid h-5 min-w-5 place-items-center rounded-full px-1.5 font-display text-[11.5px] font-bold tabular-nums text-ink', isActive ? 'bg-mint' : 'bg-line-soft')}><span className="sr-only">Pendientes: </span>{count > 99 ? '99+' : count}</span> : null}
              </Link>
            )
          })}
        </div>
      ))}
    </nav>
  )
}
