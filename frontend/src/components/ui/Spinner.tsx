import { clsx } from 'clsx'

interface SpinnerProps {
  size?: 'xs' | 'sm' | 'md' | 'lg'
  className?: string
  label?: string
}

const sizes = {
  xs: 'h-3 w-3 border',
  sm: 'h-4 w-4 border-2',
  md: 'h-6 w-6 border-2',
  lg: 'h-8 w-8 border-[3px]',
}

/**
 * Spinner accesible. Usa border en lugar de SVG para mejor performance en listas.
 * El borde de un lado en color del texto crea el efecto de rotación.
 */
export function Spinner({ size = 'md', className, label = 'Cargando…' }: SpinnerProps) {
  return (
    <span
      role="status"
      aria-live="polite"
      className={clsx('inline-flex items-center justify-center', className)}
    >
      <span
        className={clsx(
          'inline-block rounded-full animate-spin',
          'border-current border-t-transparent',
          sizes[size],
        )}
        aria-hidden="true"
      />
      <span className="sr-only">{label}</span>
    </span>
  )
}

export default Spinner
