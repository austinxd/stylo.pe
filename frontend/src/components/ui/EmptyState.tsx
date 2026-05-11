import { ReactNode } from 'react'
import { LucideIcon } from 'lucide-react'

interface EmptyStateProps {
  icon?: LucideIcon
  title: string
  description?: string
  action?: ReactNode
  /** Tono visual: 'default' (neutro), 'subtle' (más sutil), 'error' (estado de error) */
  tone?: 'default' | 'subtle' | 'error'
}

/**
 * Estado vacío consistente para listas, búsquedas sin resultados, etc.
 * Usar en lugar de "No hay datos" suelto.
 *
 * Ejemplo:
 * <EmptyState
 *   icon={CalendarX}
 *   title="No tienes citas próximas"
 *   description="Cuando reserves una cita la verás aquí."
 *   action={<Button>Reservar ahora</Button>}
 * />
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  tone = 'default',
}: EmptyStateProps) {
  const tones = {
    default: {
      bg: 'bg-neutral-100',
      icon: 'text-neutral-500',
      title: 'text-neutral-900',
      desc: 'text-neutral-600',
    },
    subtle: {
      bg: 'bg-neutral-50',
      icon: 'text-neutral-400',
      title: 'text-neutral-800',
      desc: 'text-neutral-500',
    },
    error: {
      bg: 'bg-error-50',
      icon: 'text-error-500',
      title: 'text-error-900',
      desc: 'text-error-700',
    },
  }
  const t = tones[tone]

  return (
    <div
      className="flex flex-col items-center justify-center text-center px-6 py-12 sm:py-16"
      role="status"
      aria-live="polite"
    >
      {Icon && (
        <div className={`inline-flex items-center justify-center w-14 h-14 rounded-full ${t.bg} mb-5`}>
          <Icon className={`w-6 h-6 ${t.icon}`} aria-hidden="true" />
        </div>
      )}
      <h3 className={`text-lg font-semibold ${t.title} mb-1`}>{title}</h3>
      {description && (
        <p className={`text-sm ${t.desc} max-w-sm mb-5`}>{description}</p>
      )}
      {action && <div>{action}</div>}
    </div>
  )
}

export default EmptyState
