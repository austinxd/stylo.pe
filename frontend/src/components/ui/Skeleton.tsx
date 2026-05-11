import { clsx } from 'clsx'

interface SkeletonProps {
  className?: string
  /** Forma rápida: text, circle, card */
  variant?: 'text' | 'circle' | 'card' | 'block'
}

/**
 * Skeleton loader con shimmer.
 * - variant="text": línea de altura de texto
 * - variant="circle": avatar/icono redondo
 * - variant="card": bloque tipo card
 * - variant="block": bloque rectangular genérico
 *
 * Si necesitas otra forma, usa className para dimensionar.
 */
export function Skeleton({ className, variant = 'block' }: SkeletonProps) {
  const base = 'animate-shimmer rounded-lg'
  const shapes = {
    text: 'h-4 w-full rounded',
    circle: 'rounded-full aspect-square',
    card: 'h-32 w-full rounded-2xl',
    block: 'h-6 w-full',
  }

  return (
    <div
      className={clsx(base, shapes[variant], className)}
      role="status"
      aria-hidden="true"
    />
  )
}

/** Repite N skeletons con un gap entre ellos. */
export function SkeletonList({
  count = 3,
  variant = 'card',
  gap = 'gap-3',
}: {
  count?: number
  variant?: SkeletonProps['variant']
  gap?: string
}) {
  return (
    <div className={clsx('flex flex-col', gap)}>
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} variant={variant} />
      ))}
    </div>
  )
}

export default Skeleton
