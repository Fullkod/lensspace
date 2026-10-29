import Image from 'next/image'

// "Desarrollado por Fullkod" (CREA0004): the same credit on every screen.
export function FullkodCredit({ className = '' }: { className?: string }) {
  return (
    <a
      href="https://fullkod.com/?ref=lensspace"
      target="_blank"
      rel="noopener"
      className={`inline-flex items-center gap-1.5 text-xs text-[#8B9A97] transition hover:text-[#0D7A72] ${className}`}
    >
      Desarrollado por
      <Image src="/brand/fullkod-symbol.svg" width={14} height={14} alt="" />
      <span className="font-semibold">Fullkod</span>
    </a>
  )
}
