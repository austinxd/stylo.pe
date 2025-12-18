/**
 * Modal para agregar un nuevo método de pago usando Culqi.js
 */
import { useState, useEffect, useCallback } from 'react'
import { X, CreditCard, Lock, AlertCircle, CheckCircle } from 'lucide-react'
import { Button } from '../../components/ui'

// Declaración de tipos para Culqi
declare global {
  interface Window {
    Culqi: {
      publicKey: string
      settings: (settings: CulqiSettings) => void
      options: (options: CulqiOptions) => void
      open: () => void
      close: () => void
      token: CulqiToken | null
      error: CulqiError | null
    }
    culqi: () => void
  }
}

interface CulqiSettings {
  title: string
  currency: string
  amount?: number
  order?: string
}

interface CulqiOptions {
  lang: string
  installments: boolean
  paymentMethods?: {
    tarjeta: boolean
    yape?: boolean
  }
  style?: {
    logo?: string
    bannerColor?: string
    buttonBackground?: string
    menuColor?: string
    linksColor?: string
    buttonText?: string
    buttonTextColor?: string
    priceColor?: string
  }
}

interface CulqiToken {
  object: string
  id: string
  type: string
  email: string
  creation_date: number
  card_number: string
  last_four: string
  active: boolean
  iin: {
    object: string
    bin: string
    card_brand: string
    card_type: string
    card_category: string
    issuer: {
      name: string
      country: string
      country_code: string
      website: string
      phone_number: string
    }
    installments_allowed: number[]
  }
  client: {
    ip: string
    ip_country: string
    ip_country_code: string
    browser: string
    device_fingerprint: string
    device_type: string
  }
  metadata: Record<string, unknown>
}

interface CulqiError {
  object: string
  type: string
  charge_id: string
  code: string
  decline_code: string
  merchant_message: string
  user_message: string
  param: string
}

interface AddPaymentMethodModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: (token: string) => Promise<void>
  culqiPublicKey: string
}

type ModalState = 'idle' | 'loading' | 'success' | 'error'

export function AddPaymentMethodModal({
  isOpen,
  onClose,
  onSuccess,
  culqiPublicKey,
}: AddPaymentMethodModalProps) {
  const [state, setState] = useState<ModalState>('idle')
  const [errorMessage, setErrorMessage] = useState<string>('')
  const [culqiLoaded, setCulqiLoaded] = useState(false)

  // Cargar script de Culqi
  useEffect(() => {
    if (!isOpen) return

    // Verificar si ya está cargado
    if (window.Culqi) {
      setCulqiLoaded(true)
      return
    }

    const script = document.createElement('script')
    script.src = 'https://checkout.culqi.com/js/v4'
    script.async = true
    script.onload = () => {
      setCulqiLoaded(true)
    }
    script.onerror = () => {
      setErrorMessage('No se pudo cargar el sistema de pagos')
      setState('error')
    }

    document.body.appendChild(script)

    return () => {
      // No remover el script al cerrar el modal para evitar recargas
    }
  }, [isOpen])

  // Configurar Culqi cuando esté listo
  useEffect(() => {
    if (!culqiLoaded || !isOpen || !window.Culqi) return

    // Configurar clave pública
    window.Culqi.publicKey = culqiPublicKey

    // Configurar settings del checkout
    window.Culqi.settings({
      title: 'Stylo',
      currency: 'PEN',
    })

    // Configurar opciones de estilo
    window.Culqi.options({
      lang: 'es',
      installments: false,
      paymentMethods: {
        tarjeta: true,
        yape: false,
      },
      style: {
        bannerColor: '#1a1a1a',
        buttonBackground: '#1a1a1a',
        buttonTextColor: '#ffffff',
        menuColor: '#1a1a1a',
        linksColor: '#1a1a1a',
        priceColor: '#1a1a1a',
      },
    })
  }, [culqiLoaded, isOpen, culqiPublicKey])

  // Handler global de Culqi
  const handleCulqiResponse = useCallback(async () => {
    if (window.Culqi.token) {
      const token = window.Culqi.token
      setState('loading')

      try {
        await onSuccess(token.id)
        setState('success')
        setTimeout(() => {
          onClose()
          setState('idle')
        }, 1500)
      } catch (error) {
        setErrorMessage(
          error instanceof Error
            ? error.message
            : 'Error al guardar la tarjeta'
        )
        setState('error')
      }
    } else if (window.Culqi.error) {
      setErrorMessage(
        window.Culqi.error.user_message || 'Error al procesar la tarjeta'
      )
      setState('error')
    }
  }, [onSuccess, onClose])

  // Registrar handler global
  useEffect(() => {
    if (!isOpen) return

    window.culqi = handleCulqiResponse

    return () => {
      window.culqi = () => {}
    }
  }, [isOpen, handleCulqiResponse])

  // Abrir checkout de Culqi
  const openCulqiCheckout = () => {
    if (!culqiLoaded || !window.Culqi) {
      setErrorMessage('El sistema de pagos no está disponible')
      setState('error')
      return
    }

    setState('idle')
    setErrorMessage('')
    window.Culqi.open()
  }

  // Cerrar y limpiar
  const handleClose = () => {
    if (state === 'loading') return
    setState('idle')
    setErrorMessage('')
    if (window.Culqi) {
      window.Culqi.close()
    }
    onClose()
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Overlay */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={handleClose}
      />

      {/* Modal */}
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-fade-in-up">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-neutral-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary-100 flex items-center justify-center">
              <CreditCard className="w-5 h-5 text-primary-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-primary-900">
                Agregar tarjeta
              </h2>
              <p className="text-sm text-neutral-500">
                Tarjeta de crédito o débito
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="p-2 rounded-lg hover:bg-neutral-100 text-neutral-500 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {state === 'success' ? (
            <div className="text-center py-8">
              <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
                <CheckCircle className="w-8 h-8 text-green-600" />
              </div>
              <h3 className="text-lg font-semibold text-primary-900 mb-2">
                Tarjeta agregada
              </h3>
              <p className="text-neutral-600">
                Tu tarjeta ha sido guardada correctamente
              </p>
            </div>
          ) : state === 'error' ? (
            <div className="text-center py-4">
              <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
                <AlertCircle className="w-8 h-8 text-red-600" />
              </div>
              <h3 className="text-lg font-semibold text-primary-900 mb-2">
                Error
              </h3>
              <p className="text-red-600 mb-4">{errorMessage}</p>
              <Button onClick={() => setState('idle')} variant="secondary">
                Intentar de nuevo
              </Button>
            </div>
          ) : (
            <>
              {/* Info cards aceptadas */}
              <div className="flex items-center justify-center gap-4 mb-6">
                <img
                  src="/images/cards/visa.svg"
                  alt="Visa"
                  className="h-8 grayscale opacity-60"
                  onError={(e) => (e.currentTarget.style.display = 'none')}
                />
                <img
                  src="/images/cards/mastercard.svg"
                  alt="Mastercard"
                  className="h-8 grayscale opacity-60"
                  onError={(e) => (e.currentTarget.style.display = 'none')}
                />
                <img
                  src="/images/cards/amex.svg"
                  alt="American Express"
                  className="h-8 grayscale opacity-60"
                  onError={(e) => (e.currentTarget.style.display = 'none')}
                />
                <img
                  src="/images/cards/diners.svg"
                  alt="Diners Club"
                  className="h-8 grayscale opacity-60"
                  onError={(e) => (e.currentTarget.style.display = 'none')}
                />
              </div>

              {/* Descripción */}
              <div className="bg-neutral-50 rounded-xl p-4 mb-6">
                <p className="text-sm text-neutral-600 text-center">
                  Serás redirigido al checkout seguro de Culqi para ingresar los
                  datos de tu tarjeta. No almacenamos tu número de tarjeta.
                </p>
              </div>

              {/* Botón principal */}
              <Button
                onClick={openCulqiCheckout}
                loading={state === 'loading' || !culqiLoaded}
                fullWidth
                className="mb-4"
              >
                <CreditCard className="w-4 h-4 mr-2" />
                {culqiLoaded ? 'Ingresar datos de tarjeta' : 'Cargando...'}
              </Button>

              {/* Security note */}
              <div className="flex items-center justify-center gap-2 text-xs text-neutral-500">
                <Lock className="w-3 h-3" />
                <span>Pago seguro procesado por Culqi</span>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default AddPaymentMethodModal
