import {
  ArrowRight, BarChart3, Boxes, Check, CircleDollarSign, ClipboardCheck,
  Eye, Factory, FileClock, Glasses, Layers3, LockKeyhole,
  MessageCircleMore, PackageCheck, ScanEye, ShieldCheck, Sparkles,
  Store, UserRoundCog, UsersRound,
} from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'

import { FullkodCredit } from '@/shared/components/FullkodCredit'
import { InstallAppButton } from '@/shared/components/InstallAppButton'

import { AccessLink } from './AccessLink'
import { PricingSection } from './PricingSection'
import styles from './landing.module.css'

const workflow = [
  { number: '01', title: 'Cliente y receta', copy: 'Datos, teléfonos y revisiones clínicas permanecen conectados.', icon: ScanEye },
  { number: '02', title: 'Venta confirmada', copy: 'Cotización, precios y aceptación quedan congelados en el pedido.', icon: ClipboardCheck },
  { number: '03', title: 'Cobros claros', copy: 'Pagos en CUP o USD y saldo pendiente siempre visibles.', icon: CircleDollarSign },
  { number: '04', title: 'Producción coordinada', copy: 'Cristales, montaje, incidencias y retrabajos en un solo recorrido.', icon: Factory },
  { number: '05', title: 'Cliente informado', copy: 'Notificaciones automáticas conservan destinatario y resultado.', icon: MessageCircleMore },
  { number: '06', title: 'Entrega controlada', copy: 'El sistema protege la entrega mientras exista un saldo pendiente.', icon: PackageCheck },
]

const roles = [
  { name: 'Propietario', eyebrow: 'VISIÓN COMPLETA', copy: 'Supervisa sucursales, equipo, catálogo, indicadores, producción y cierres.', icon: Store, tone: 'mint' },
  { name: 'Vendedor', eyebrow: 'OPERACIÓN DIARIA', copy: 'Atiende clientes, registra recetas, vende, cobra y sigue los pedidos de su flujo autorizado.', icon: UsersRound, tone: 'sky' },
  { name: 'Laboratorio', eyebrow: 'TRABAJO ASIGNADO', copy: 'Accede solo a los trabajos de cristales asignados y a la receta necesaria para fabricarlos.', icon: Glasses, tone: 'coral' },
  { name: 'Montador', eyebrow: 'MONTAJE PRECISO', copy: 'Ve y actualiza únicamente los trabajos de montaje que le corresponden.', icon: Boxes, tone: 'violet' },
  { name: 'Administrador', eyebrow: 'CONTROL DE PLATAFORMA', copy: 'Gestiona organizaciones, módulos y estado operativo sin mezclarse con la venta diaria.', icon: UserRoundCog, tone: 'sand' },
]

const trustPoints = [
  'Cada organización y sucursal mantiene sus datos aislados.',
  'Los proveedores no ven identidad del cliente, precios ni pagos.',
  'El historial comercial y operativo conserva actores y momentos.',
  'Una entrega con saldo pendiente se bloquea desde la base de datos.',
]

export function LandingPage() {
  return (
    <main className={`${styles.page} overflow-hidden bg-[#F7FBFA] text-[#1C3A37]`}>
      <header className="fixed inset-x-0 top-0 z-50 px-4 pt-4 md:px-7">
        <div className={`${styles.headerGlass} mx-auto flex max-w-7xl items-center justify-between rounded-[10px] px-4 py-3 md:px-5`}>
          <Link href="/" className="flex items-center gap-2.5" aria-label="LensSpace, inicio">
            <Image src="/brand/lensspace-mark.svg" width={38} height={38} alt="" priority />
            <span className="font-display text-lg font-bold tracking-[-0.03em] text-[#07322F]">LensSpace</span>
          </Link>
          <nav aria-label="Navegación de la página" className="hidden items-center gap-7 text-sm font-semibold text-[#4A5B58] lg:flex">
            <a className="transition hover:text-[#0D7A72]" href="#como-funciona">Cómo funciona</a>
            <a className="transition hover:text-[#0D7A72]" href="#capacidades">Capacidades</a>
            <a className="transition hover:text-[#0D7A72]" href="#accesos">Accesos</a>
            <a className="transition hover:text-[#0D7A72]" href="#seguridad">Seguridad</a>
            <a className="transition hover:text-[#0D7A72]" href="#precios">Precios</a>
          </nav>
          <AccessLink label="Iniciar sesión" arrow className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[7px] bg-[#07322F] px-4 text-sm font-bold text-white transition hover:bg-[#0D7A72]" />
        </div>
      </header>

      <section className={`${styles.hero} relative px-5 pb-20 pt-36 md:px-8 md:pb-28 md:pt-44`}>
        <div className="mx-auto grid max-w-7xl items-center gap-14 lg:grid-cols-[0.92fr_1.08fr] lg:gap-16">
          <div className={styles.heroCopy}>
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-[#B9DFD8] bg-white/80 px-3.5 py-2 text-xs font-bold uppercase tracking-[0.16em] text-[#0D7A72] shadow-[0_1px_3px_rgba(7,50,47,0.12)]">
              <Sparkles aria-hidden="true" size={15} /> Operación óptica conectada
            </div>
            <h1 className="max-w-3xl font-display text-[44px] font-bold leading-[0.98] tracking-[-0.055em] text-[#07322F] sm:text-6xl lg:text-[72px]">
              De la receta a la entrega, <span className="text-[#0D7A72]">todo en el mismo espacio.</span>
            </h1>
            <p className="mt-7 max-w-2xl text-lg leading-8 text-[#4A5B58] md:text-xl">
              LensSpace conecta clientes, ventas, cobros y producción para que cada pedido avance con información clara y cada persona acceda solo a lo que necesita.
            </p>
            <div className="mt-9 flex flex-wrap gap-3">
              <a href="#como-funciona" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-[7px] bg-[#FF6B4A] px-5 font-display text-sm font-bold text-[#07322F] shadow-[0_12px_30px_rgba(255,107,74,0.22)] transition hover:-translate-y-0.5 hover:bg-[#FF8466]">
                Ver cómo funciona <ArrowRight aria-hidden="true" size={17} />
              </a>
              <AccessLink label="Ya tengo acceso" className="inline-flex min-h-12 items-center justify-center rounded-[7px] border border-[#B9D8D3] bg-white/70 px-5 font-display text-sm font-bold text-[#07322F] transition hover:border-[#0D7A72] hover:bg-white" />
              <InstallAppButton className="inline-flex min-h-12 items-center justify-center gap-2 rounded-[7px] px-4 font-display text-sm font-bold text-[#0D7A72] transition hover:bg-[#DDF5F0]" />
            </div>
            <div className="mt-9 flex flex-wrap gap-x-6 gap-y-3 text-sm text-[#4A5B58]">
              {['Por sucursal', 'Permisos por rol', 'Historial verificable'].map((item) => (
                <span key={item} className="flex items-center gap-2"><span className="grid h-5 w-5 place-items-center rounded-full bg-[#DDF5F0] text-[#0D7A72]"><Check aria-hidden="true" size={13} strokeWidth={3} /></span>{item}</span>
              ))}
            </div>
          </div>

          <div className={`${styles.heroVisual} relative mx-auto w-full max-w-[650px]`} aria-label="Ejemplo visual del seguimiento de un pedido">
            <div className={styles.orbitOne} aria-hidden="true" />
            <div className={styles.orbitTwo} aria-hidden="true" />
            <div className={`${styles.floatingBadge} ${styles.badgeTop}`}><Factory aria-hidden="true" size={17} /> Montaje recibido</div>
            <div className={`${styles.floatingBadge} ${styles.badgeBottom}`}><ShieldCheck aria-hidden="true" size={17} /> Saldo protegido</div>
            <div className={`${styles.productWindow} relative overflow-hidden rounded-[28px] border border-white/10 bg-[#07322F] p-3 shadow-[0_35px_80px_rgba(7,50,47,0.28)] sm:p-5`}>
              <div className="flex items-center justify-between border-b border-white/10 px-1 pb-4">
                <div className="flex items-center gap-3">
                  <Image src="/brand/lensspace-mark.svg" width={38} height={38} alt="" />
                  <div><p className="font-display text-sm font-bold text-white">Pedido VS-0248</p><p className="text-xs text-[#7FB3AC]">Actualizado ahora</p></div>
                </div>
                <span className="rounded-full bg-[#164C46] px-3 py-1.5 text-xs font-bold text-[#9EE5D8]">En producción</span>
              </div>
              <div className="grid gap-3 pt-4 sm:grid-cols-[1.05fr_.95fr]">
                <div className="rounded-[10px] bg-white p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div><p className="text-xs font-bold uppercase tracking-[0.15em] text-[#0D7A72]">Progreso del pedido</p><p className="mt-2 font-display text-2xl font-bold text-[#07322F]">Cristales listos</p></div>
                    <div className="grid h-11 w-11 place-items-center rounded-[7px] bg-[#E3F6F2] text-[#0D7A72]"><Glasses aria-hidden="true" size={23} /></div>
                  </div>
                  <div className="mt-7 space-y-4">
                    {[
                      ['Venta confirmada', 'Completado', true], ['Cristales', 'Listos', true],
                      ['Montaje', 'En curso', false], ['Entrega', 'Pendiente', false],
                    ].map(([label, status, done], index) => (
                      <div key={label as string} className="flex items-center gap-3">
                        <span className={`relative grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-bold ${done ? 'bg-[#35C2A8] text-[#07322F]' : index === 2 ? `${styles.activeStep} bg-[#FF6B4A] text-white` : 'bg-[#EEF4F3] text-[#74857F]'}`}>{done ? <Check aria-hidden="true" size={14} strokeWidth={3} /> : index + 1}</span>
                        <div className="min-w-0 flex-1"><p className="text-sm font-semibold text-[#1C3A37]">{label}</p></div>
                        <span className="text-xs text-[#74857F]">{status}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="grid gap-3">
                  <div className="rounded-[10px] bg-[#10463F] p-5 text-white">
                    <p className="text-xs font-bold uppercase tracking-[0.15em] text-[#7FD8C8]">Saldo pendiente</p>
                    <p className="mt-3 font-display text-3xl font-bold tabular-nums">2 450 CUP</p>
                    <div className="mt-5 h-2 overflow-hidden rounded-full bg-[#07322F]"><div className={`${styles.progressBar} h-full rounded-full bg-[#FF6B4A]`} /></div>
                    <p className="mt-3 text-xs leading-5 text-[#A7CFC9]">La entrega permanecerá protegida hasta completar el cobro.</p>
                  </div>
                  <div className="rounded-[10px] bg-[#F0FBF9] p-5">
                    <div className="flex items-center gap-3"><FileClock aria-hidden="true" className="text-[#0D7A72]" size={20} /><p className="font-display text-sm font-bold text-[#07322F]">Historial conectado</p></div>
                    <p className="mt-3 text-sm leading-6 text-[#4A5B58]">Venta, pago, taller y notificación con actor y momento.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="border-y border-[#DCECEA] bg-white px-5 py-6 md:px-8">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-center gap-x-10 gap-y-4 text-sm font-semibold text-[#4A5B58] lg:justify-between">
          <span className="text-xs font-bold uppercase tracking-[0.18em] text-[#0D7A72]">Un sistema para todo el recorrido</span>
          {['Clientes', 'Recetas', 'Ventas', 'Cobros', 'Producción', 'Entrega'].map((item) => <span key={item}>{item}</span>)}
        </div>
      </section>

      <section id="como-funciona" className="scroll-mt-24 px-5 py-24 md:px-8 md:py-32">
        <div className="mx-auto max-w-7xl">
          <SectionHeading eyebrow="UN SOLO RECORRIDO" title="Cada paso conserva el contexto del anterior." copy="LensSpace no trata la venta, el taller y el cobro como mundos separados. Todo pertenece al mismo pedido y forma un historial operativo continuo." />
          <div className="relative mt-16 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <div className={`${styles.workflowLine} hidden lg:block`} aria-hidden="true" />
            {workflow.map(({ number, title, copy, icon: Icon }, index) => (
              <article key={number} className={`${styles.workflowCard} relative rounded-[10px] border border-[#DCECEA] bg-white p-6 shadow-[0_16px_45px_rgba(7,50,47,0.06)]`}>
                <div className="flex items-center justify-between"><span className="font-display text-xs font-bold tracking-[0.18em] text-[#0D7A72]">{number}</span><div className="grid h-11 w-11 place-items-center rounded-[7px] bg-[#E6F7F3] text-[#0D7A72]"><Icon aria-hidden="true" size={21} /></div></div>
                <h3 className="mt-7 font-display text-xl font-bold tracking-[-0.02em] text-[#07322F]">{title}</h3>
                <p className="mt-3 leading-7 text-[#5B6F6B]">{copy}</p>
                {index < workflow.length - 1 ? <span className="sr-only">Siguiente:</span> : null}
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="capacidades" className="scroll-mt-24 bg-[#07322F] px-5 py-24 text-white md:px-8 md:py-32">
        <div className="mx-auto max-w-7xl">
          <SectionHeading dark eyebrow="CAPACIDADES REALES" title="Menos saltos entre herramientas. Más continuidad." copy="Tres espacios de trabajo cubren la operación comercial, el seguimiento del pedido y la gestión del negocio." />
          <div className="mt-16 grid gap-5 lg:grid-cols-3">
            <CapabilityCard icon={Layers3} number="01" title="Vende con contexto" copy="Clientes, teléfonos, recetas, catálogo y cotizaciones se encuentran antes de confirmar la venta." items={['Recetas con revisiones', 'Precios y advertencias visibles', 'Ajustes con motivo y actor']} />
            <CapabilityCard featured icon={FileClock} number="02" title="Sigue cada pedido" copy="Cobros, producción, incidencias, retrabajos y mensajes forman una sola historia." items={['Saldo en CUP y USD', 'Cristales y montaje coordinados', 'Notificaciones con resultado']} />
            <CapabilityCard icon={BarChart3} number="03" title="Dirige la operación" copy="Sucursales, vendedores, caja, cargas de proveedores y resultados disponibles para decidir." items={['Cierres de caja protegidos', 'Filtros por fecha y equipo', 'Indicadores operativos']} />
          </div>
        </div>
      </section>

      <section id="accesos" className="scroll-mt-24 px-5 py-24 md:px-8 md:py-32">
        <div className="mx-auto max-w-7xl">
          <div className="grid gap-10 lg:grid-cols-[.72fr_1.28fr] lg:items-end">
            <SectionHeading eyebrow="ACCESO POR RESPONSABILIDAD" title="Cada persona ve lo necesario para hacer bien su trabajo." copy="Los accesos no son planes comerciales. Son límites operativos que mantienen la información relevante en las manos correctas." />
            <div className="rounded-[10px] border border-[#B9DFD8] bg-[#EAF8F5] p-5 text-sm leading-6 text-[#315A55] sm:flex sm:items-center sm:gap-4"><div className="mb-3 grid h-11 w-11 shrink-0 place-items-center rounded-[7px] bg-white text-[#0D7A72] shadow-[0_1px_3px_rgba(7,50,47,0.12)] sm:mb-0"><LockKeyhole aria-hidden="true" size={21} /></div>Los permisos se aplican sobre la información y las acciones, no solo ocultando opciones en pantalla.</div>
          </div>
          <div className="mt-14 grid gap-4 md:grid-cols-2 lg:grid-cols-5">
            {roles.map(({ name, eyebrow, copy, icon: Icon, tone }) => (
              <article key={name} className={`${styles.roleCard} ${styles[tone]} rounded-[10px] border border-[#DCECEA] bg-white p-5`}>
                <div className="grid h-11 w-11 place-items-center rounded-[7px] bg-[var(--role-soft)] text-[var(--role-ink)]"><Icon aria-hidden="true" size={21} /></div>
                <p className="mt-6 text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--role-ink)]">{eyebrow}</p>
                <h3 className="mt-2 font-display text-xl font-bold text-[#07322F]">{name}</h3><p className="mt-3 text-sm leading-6 text-[#5B6F6B]">{copy}</p>
              </article>
            ))}
          </div>
          <div className="mt-6 rounded-[10px] border border-[#DCECEA] bg-white p-5 md:p-7"><div className="grid gap-5 md:grid-cols-[1fr_auto] md:items-center"><div><p className="font-display text-lg font-bold text-[#07322F]">Privacidad operativa para proveedores</p><p className="mt-2 text-sm leading-6 text-[#5B6F6B]">Laboratorio y montador acceden a sus trabajos asignados sin ver identidad del cliente, precios, cobros ni pedidos ajenos.</p></div><div className="flex flex-wrap gap-2 text-xs font-bold text-[#0D7A72]">{['Sin identidad', 'Sin precios', 'Sin pagos'].map((item) => <span key={item} className="rounded-full bg-[#E6F7F3] px-3 py-2">{item}</span>)}</div></div></div>
        </div>
      </section>

      <section id="seguridad" className="scroll-mt-24 px-5 md:px-8">
        <div className={`${styles.trustPanel} mx-auto grid max-w-7xl gap-12 overflow-hidden rounded-[30px] bg-[#0A403B] p-7 text-white md:p-12 lg:grid-cols-[.8fr_1.2fr] lg:p-16`}>
          <div><div className="grid h-13 w-13 place-items-center rounded-[10px] bg-[#155A52] p-3 text-[#7FD8C8]"><ShieldCheck aria-hidden="true" size={28} /></div><p className="mt-7 text-xs font-bold uppercase tracking-[0.18em] text-[#7FD8C8]">CONTROL CONCRETO</p><h2 className="mt-4 font-display text-4xl font-bold leading-tight tracking-[-0.04em] md:text-5xl">Claridad sin abrir información de más.</h2><p className="mt-5 max-w-xl text-lg leading-8 text-[#B9DDD7]">LensSpace conserva el contexto completo del pedido y, al mismo tiempo, separa lo que corresponde a cada organización, sucursal y rol.</p></div>
          <div className="grid gap-3 sm:grid-cols-2">{trustPoints.map((point, index) => <div key={point} className="rounded-[10px] border border-white/10 bg-white/[0.06] p-5"><span className="grid h-8 w-8 place-items-center rounded-full bg-[#35C2A8] font-display text-xs font-bold text-[#07322F]">{index + 1}</span><p className="mt-5 leading-7 text-[#E5F5F2]">{point}</p></div>)}</div>
        </div>
      </section>

      <PricingSection />

      <section className="px-5 pb-24 pt-24 md:px-8 md:pb-32 md:pt-32">
        <div className={`${styles.cta} relative mx-auto max-w-7xl overflow-hidden rounded-[30px] border border-[#CBE5E0] bg-[#EAF8F5] px-6 py-16 text-center md:px-12 md:py-20`}>
          <div className={styles.ctaGlow} aria-hidden="true" /><Image className="relative mx-auto" src="/brand/lensspace-mark.svg" width={64} height={64} alt="" /><p className="relative mt-7 text-xs font-bold uppercase tracking-[0.2em] text-[#0D7A72]">UN PEDIDO. UN HISTORIAL.</p><h2 className="relative mx-auto mt-4 max-w-3xl font-display text-4xl font-bold leading-tight tracking-[-0.045em] text-[#07322F] md:text-6xl">Mira tu operación con más claridad.</h2><p className="relative mx-auto mt-5 max-w-2xl text-lg leading-8 text-[#4A5B58]">Clientes, ventas, taller y cobros trabajando sobre la misma información, con el acceso correcto para cada persona.</p>
          <div className="relative mt-9 flex flex-wrap justify-center gap-3"><a href="#como-funciona" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-[7px] bg-[#07322F] px-5 font-display text-sm font-bold text-white transition hover:bg-[#0D7A72]">Explorar el recorrido <ArrowRight aria-hidden="true" size={17} /></a><AccessLink label="Iniciar sesión" className="inline-flex min-h-12 items-center justify-center rounded-[7px] border border-[#9BCDC6] bg-white px-5 font-display text-sm font-bold text-[#07322F] transition hover:border-[#0D7A72]" /></div>
        </div>
      </section>

      <footer className="border-t border-[#DCECEA] bg-white px-5 py-10 md:px-8">
        <div className="mx-auto flex max-w-7xl flex-col items-center gap-7 text-center lg:flex-row lg:justify-between lg:text-left">
          <Link href="/" className="flex flex-col items-center gap-3 sm:flex-row sm:text-left" aria-label="LensSpace, inicio">
            <Image src="/brand/lensspace-mark.svg" width={42} height={42} alt="" />
            <div>
              <p className="font-display text-lg font-bold text-[#07322F]">LensSpace</p>
              <p className="mt-0.5 text-xs text-[#74857F]">Toda tu operación óptica, claramente conectada.</p>
            </div>
          </Link>

          <nav aria-label="Accesos rápidos del pie de página" className="flex flex-wrap items-center justify-center gap-x-6 gap-y-3 text-sm font-semibold text-[#4A5B58]">
            <a href="#como-funciona" className="transition hover:text-[#0D7A72]">Cómo funciona</a>
            <a href="#capacidades" className="transition hover:text-[#0D7A72]">Capacidades</a>
            <a href="#accesos" className="transition hover:text-[#0D7A72]">Accesos</a>
            <a href="#seguridad" className="transition hover:text-[#0D7A72]">Seguridad</a>
            <a href="#precios" className="transition hover:text-[#0D7A72]">Precios</a>
            <AccessLink label="Iniciar sesión" className="transition hover:text-[#0D7A72]" />
          </nav>

          <div className="flex flex-col items-center gap-1.5 text-xs text-[#8B9A97] lg:items-end">
            <p>© {new Date().getFullYear()} LensSpace</p>
            <FullkodCredit />
          </div>
        </div>
      </footer>
    </main>
  )
}

function SectionHeading({ eyebrow, title, copy, dark = false }: { eyebrow: string; title: string; copy: string; dark?: boolean }) {
  return <div className="max-w-3xl"><p className={`text-xs font-bold uppercase tracking-[0.2em] ${dark ? 'text-[#7FD8C8]' : 'text-[#0D7A72]'}`}>{eyebrow}</p><h2 className={`mt-4 font-display text-4xl font-bold leading-tight tracking-[-0.045em] md:text-5xl ${dark ? 'text-white' : 'text-[#07322F]'}`}>{title}</h2><p className={`mt-5 max-w-2xl text-lg leading-8 ${dark ? 'text-[#A7CFC9]' : 'text-[#5B6F6B]'}`}>{copy}</p></div>
}

function CapabilityCard({ icon: Icon, number, title, copy, items, featured = false }: { icon: typeof Eye; number: string; title: string; copy: string; items: string[]; featured?: boolean }) {
  return <article className={`${styles.capabilityCard} ${featured ? styles.capabilityFeatured : ''} rounded-[10px] border p-6 md:p-7`}><div className="flex items-center justify-between"><div className="grid h-12 w-12 place-items-center rounded-[10px] bg-white/10 text-[#7FD8C8]"><Icon aria-hidden="true" size={23} /></div><span className="font-display text-sm font-bold text-[#6F9C96]">{number}</span></div><h3 className="mt-8 font-display text-2xl font-bold tracking-[-0.025em] text-white">{title}</h3><p className="mt-4 leading-7 text-[#A7CFC9]">{copy}</p><ul className="mt-7 space-y-3">{items.map((item) => <li key={item} className="flex gap-3 text-sm text-[#D8F0ED]"><span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-[#35C2A8] text-[#07322F]"><Check aria-hidden="true" size={12} strokeWidth={3} /></span>{item}</li>)}</ul></article>
}
