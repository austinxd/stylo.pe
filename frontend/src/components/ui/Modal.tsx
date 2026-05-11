import { useEffect, useRef, ReactNode } from 'react'
import { X } from 'lucide-react'
import { clsx } from 'clsx'

interface ModalProps {
  open: boolean
  onClose: () => void
  title?: string
  description?: string
  children: ReactNode
  /** sm | md | lg | xl, controla max-width */
  size?: 'sm' | 'md' | 'lg' | 'xl'
  /** Sticky en mobile: bottom sheet en pantallas chicas */
  mobileBottomSheet?: boolean
  /** Ocultar el botón de cerrar (X) */
  hideCloseButton?: boolean
  /** Footer fijo, e.g. botones de acción */
  footer?: ReactNode
}

const sizes = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-2xl',
}

/**
 * Modal accesible con manejo de foco, ESC, click fuera, y soporte mobile bottom-sheet.
 *
 * Características:
 * - Cierra con ESC y click en backdrop
 * - Bloquea scroll del body cuando está abierto
 * - Focus trap (restaura el foco al elemento previo al cerrar)
 * - aria-modal, role="dialog", aria-labelledby
 *
 * NOTA: Para diálogos complejos con formularios, usar este Modal + react-hook-form dentro.
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  size = 'md',
  mobileBottomSheet = false,
  hideCloseButton = false,
  footer,
}: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!open) return

    previousFocusRef.current = document.activeElement as HTMLElement
    document.body.style.overflow = 'hidden'

    // Focus inicial al diálogo
    const t = setTimeout(() => dialogRef.current?.focus(), 0)

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    document.addEventListener('keydown', onKey)

    return () => {
      clearTimeout(t)
      document.body.style.overflow = ''
      document.removeEventListener('keydown', onKey)
      previousFocusRef.current?.focus()
    }
  }, [open, onClose])

  if (!open) return null

  const titleId = title ? 'modal-title' : undefined
  const descId = description ? 'modal-desc' : undefined

  return (
    <div
      className={clsx(
        'fixed inset-0 z-50 flex',
        mobileBottomSheet ? 'items-end sm:items-center' : 'items-center',
        'justify-center px-4 sm:px-6',
      )}
      role="presentation"
    >
      {/* Backdrop */}
      <button
        type="button"
        aria-label="Cerrar"
        onClick={onClose}
        className="absolute inset-0 bg-neutral-900/40 backdrop-blur-sm animate-fade-in"
        tabIndex={-1}
      />

      {/* Dialog */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        tabIndex={-1}
        className={clsx(
          'relative w-full bg-white shadow-soft-lg outline-none',
          'animate-fade-in-up',
          mobileBottomSheet
            ? 'rounded-t-3xl sm:rounded-2xl pb-safe sm:pb-0'
            : 'rounded-2xl',
          sizes[size],
        )}
      >
        {(title || !hideCloseButton) && (
          <div className="flex items-start justify-between gap-4 px-6 pt-6 pb-4">
            <div className="flex-1 min-w-0">
              {title && (
                <h2 id={titleId} className="text-lg font-semibold text-neutral-900">
                  {title}
                </h2>
              )}
              {description && (
                <p id={descId} className="text-sm text-neutral-600 mt-1">
                  {description}
                </p>
              )}
            </div>
            {!hideCloseButton && (
              <button
                type="button"
                onClick={onClose}
                aria-label="Cerrar"
                className="text-neutral-500 hover:text-neutral-900 rounded-full p-1 hover:bg-neutral-100 transition"
              >
                <X className="w-5 h-5" aria-hidden="true" />
              </button>
            )}
          </div>
        )}

        <div className="px-6 pb-6">{children}</div>

        {footer && (
          <div className="px-6 py-4 border-t border-neutral-100 bg-neutral-50/50 rounded-b-2xl flex gap-2 justify-end">
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}

export default Modal
