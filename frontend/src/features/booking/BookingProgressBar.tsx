import { Check } from 'lucide-react'
import { clsx } from 'clsx'
import { STEP_LABELS, STEP_ORDER, type BookingStep } from './types'

interface BookingProgressBarProps {
  currentStep: BookingStep
  /** Si está en mobile, mostramos versión compacta */
  compact?: boolean
  /** Click handler opcional para volver a un step previo */
  onStepClick?: (step: BookingStep) => void
}

/**
 * Barra de progreso accesible para el booking flow.
 *
 * - Marca steps anteriores como "completed" con check.
 * - Step actual con anillo destacado.
 * - Steps futuros en gris claro.
 * - Click en steps previos permite volver atrás (si onStepClick está definido).
 * - aria-current="step" en el activo.
 */
export function BookingProgressBar({
  currentStep,
  compact = false,
  onStepClick,
}: BookingProgressBarProps) {
  // No mostrar la barra en success: el flujo terminó
  const visibleSteps = STEP_ORDER.filter((s) => s !== 'success') as Exclude<BookingStep, 'success'>[]
  // indexOf con currentStep que podría ser 'success' retorna -1, que tratamos como "todo terminó"
  const currentIdx =
    currentStep === 'success' ? visibleSteps.length : visibleSteps.indexOf(currentStep as Exclude<BookingStep, 'success'>)

  if (compact) {
    // Versión compacta: punto activo + contador "Paso X de Y"
    return (
      <nav aria-label="Progreso de la reserva" className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          {visibleSteps.map((step, idx) => (
            <span
              key={step}
              className={clsx(
                'h-1 flex-1 rounded-full transition-all',
                idx <= currentIdx && idx < visibleSteps.length && 'bg-primary-900',
                idx > currentIdx && 'bg-neutral-200',
              )}
              aria-hidden="true"
            />
          ))}
        </div>
        <p className="text-xs text-neutral-600 text-center">
          Paso {Math.min(currentIdx + 1, visibleSteps.length)} de {visibleSteps.length} ·{' '}
          <span className="font-medium text-neutral-900">{STEP_LABELS[currentStep]}</span>
        </p>
      </nav>
    )
  }

  return (
    <nav aria-label="Progreso de la reserva">
      <ol className="flex items-center justify-between gap-2">
        {visibleSteps.map((step, idx) => {
          const status =
            idx < currentIdx ? 'done' : idx === currentIdx ? 'current' : 'todo'
          const isClickable = onStepClick && status === 'done'

          const dotClasses = clsx(
            'flex items-center justify-center w-8 h-8 rounded-full text-xs font-semibold transition-all',
            status === 'done' && 'bg-primary-900 text-white',
            status === 'current' && 'bg-primary-900 text-white ring-4 ring-primary-900/15',
            status === 'todo' && 'bg-neutral-100 text-neutral-400',
          )

          const content = (
            <>
              <span className={dotClasses}>
                {status === 'done' ? (
                  <Check className="w-4 h-4" aria-hidden="true" />
                ) : (
                  idx + 1
                )}
              </span>
              <span
                className={clsx(
                  'text-xs mt-2 transition-colors',
                  status === 'current' ? 'text-neutral-900 font-medium' : 'text-neutral-500',
                )}
              >
                {STEP_LABELS[step]}
              </span>
            </>
          )

          return (
            <li key={step} className="flex-1">
              <div className="flex items-center">
                {isClickable ? (
                  <button
                    type="button"
                    onClick={() => onStepClick(step)}
                    aria-label={`Volver a ${STEP_LABELS[step]}`}
                    className="flex flex-col items-center w-full focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-900 rounded-md"
                  >
                    {content}
                  </button>
                ) : (
                  <div
                    className="flex flex-col items-center w-full"
                    aria-current={status === 'current' ? 'step' : undefined}
                  >
                    {content}
                  </div>
                )}
                {idx < visibleSteps.length - 1 && (
                  <span
                    className={clsx(
                      'flex-1 h-0.5 mx-2 transition-colors -mt-6',
                      idx < currentIdx ? 'bg-primary-900' : 'bg-neutral-200',
                    )}
                    aria-hidden="true"
                  />
                )}
              </div>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

export default BookingProgressBar
