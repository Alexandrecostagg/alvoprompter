interface BrandMarkProps {
  compact?: boolean
  className?: string
}

export function BrandIcon({ className = 'h-9 w-9' }: { className?: string }) {
  return <img className={className} src="/logo.svg" alt="" aria-hidden="true" />
}

export default function BrandMark({ compact = false, className = '' }: BrandMarkProps) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <BrandIcon className={compact ? 'h-8 w-8' : 'h-9 w-9'} />
      <span className="text-[17px] font-bold tracking-[-0.03em]" style={{ color: 'var(--text)' }}>
        Alvo<span className="brand-gradient-text">Prompter</span>
      </span>
    </span>
  )
}
