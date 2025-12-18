/**
 * Tarjeta que muestra un método de pago guardado.
 * Soporta tanto tarjetas reales como métodos virtuales (cortesía).
 */
import { clsx } from 'clsx'
import { CreditCard, Trash2, Star, Gift } from 'lucide-react'
import type { PaymentMethod } from '../../api/subscriptions'

interface PaymentMethodCardProps {
  paymentMethod: PaymentMethod
  onSetDefault?: (id: number) => void
  onDelete?: (id: number) => void
  isLoading?: boolean
  showActions?: boolean
}

// Logos de marcas de tarjetas
const brandLogos: Record<string, string> = {
  visa: '/images/cards/visa.svg',
  mastercard: '/images/cards/mastercard.svg',
  amex: '/images/cards/amex.svg',
  diners: '/images/cards/diners.svg',
  courtesy: '/images/cards/courtesy.svg',
}

// Colores por marca
const brandColors: Record<string, string> = {
  visa: 'bg-blue-50 border-blue-200',
  mastercard: 'bg-orange-50 border-orange-200',
  amex: 'bg-cyan-50 border-cyan-200',
  diners: 'bg-gray-50 border-gray-200',
  courtesy: 'bg-purple-50 border-purple-200',
  other: 'bg-neutral-50 border-neutral-200',
}

export function PaymentMethodCard({
  paymentMethod,
  onSetDefault,
  onDelete,
  isLoading = false,
  showActions = true,
}: PaymentMethodCardProps) {
  const brandColor = brandColors[paymentMethod.brand] || brandColors.other
  const isCourtesy = paymentMethod.method_type === 'courtesy'

  return (
    <div
      className={clsx(
        'relative p-4 rounded-xl border-2 transition-all',
        brandColor,
        paymentMethod.is_default && 'ring-2 ring-primary-500 ring-offset-2',
        isLoading && 'opacity-50 pointer-events-none'
      )}
    >
      {/* Badge default */}
      {paymentMethod.is_default && (
        <span className="absolute -top-2 -right-2 bg-primary-500 text-white text-xs px-2 py-0.5 rounded-full flex items-center gap-1">
          <Star className="w-3 h-3 fill-current" />
          Principal
        </span>
      )}

      {/* Badge cortesía */}
      {isCourtesy && !paymentMethod.is_default && (
        <span className="absolute -top-2 -right-2 bg-purple-500 text-white text-xs px-2 py-0.5 rounded-full flex items-center gap-1">
          <Gift className="w-3 h-3" />
          Cortesía
        </span>
      )}

      <div className="flex items-start justify-between gap-4">
        {/* Icono/Logo de marca */}
        <div className="flex-shrink-0">
          {isCourtesy ? (
            <div className="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center">
              <Gift className="w-5 h-5 text-purple-600" />
            </div>
          ) : brandLogos[paymentMethod.brand] ? (
            <img
              src={brandLogos[paymentMethod.brand]}
              alt={paymentMethod.brand_display}
              className="h-8 w-auto"
              onError={(e) => {
                e.currentTarget.style.display = 'none'
                e.currentTarget.nextElementSibling?.classList.remove('hidden')
              }}
            />
          ) : null}
          {!isCourtesy && (
            <CreditCard
              className={clsx(
                'w-8 h-8 text-neutral-400',
                brandLogos[paymentMethod.brand] && 'hidden'
              )}
            />
          )}
        </div>

        {/* Info de la tarjeta */}
        <div className="flex-1 min-w-0">
          {isCourtesy ? (
            <>
              <div className="flex items-center gap-2">
                <span className="text-lg font-semibold text-purple-900">
                  Cortesía Stylo
                </span>
              </div>
              <p className="text-sm text-purple-700 mt-1">
                Acceso sin cargo habilitado
              </p>
              <p className="text-xs text-purple-500 mt-0.5">
                Paga facturas sin tarjeta
              </p>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <span className="font-mono text-lg font-semibold text-primary-900">
                  •••• {paymentMethod.last_four}
                </span>
                {paymentMethod.card_type_display && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-white/50 text-neutral-600">
                    {paymentMethod.card_type_display}
                  </span>
                )}
              </div>
              <p className="text-sm text-neutral-600 mt-1 truncate">
                {paymentMethod.holder_name || 'Titular no disponible'}
              </p>
              <p className="text-xs text-neutral-500 mt-0.5">
                Vence {paymentMethod.display_expiration}
              </p>
            </>
          )}
        </div>

        {/* Acciones - No mostrar para cortesía (gestionado por admin) */}
        {showActions && !isCourtesy && (
          <div className="flex flex-col gap-2">
            {!paymentMethod.is_default && onSetDefault && (
              <button
                onClick={() => onSetDefault(paymentMethod.id)}
                className="p-2 rounded-lg hover:bg-white/50 text-neutral-500 hover:text-primary-600 transition-colors"
                title="Establecer como principal"
              >
                <Star className="w-4 h-4" />
              </button>
            )}
            {onDelete && (
              <button
                onClick={() => onDelete(paymentMethod.id)}
                className="p-2 rounded-lg hover:bg-red-50 text-neutral-500 hover:text-red-600 transition-colors"
                title="Eliminar tarjeta"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default PaymentMethodCard
