/**
 * Integración con Culqi.js para tokenización de tarjetas.
 *
 * Culqi.js es un script externo (https://js.culqi.com/checkout-js) que
 * crea un token de un solo uso a partir de los datos de tarjeta. Ese
 * token se envía al backend, que lo usa para hacer charge.
 *
 * Importante: los datos de la tarjeta nunca tocan nuestro servidor.
 * Sólo el token (formato tkn_test_xxx o tkn_live_xxx) viaja al backend.
 *
 * Este módulo:
 * 1. Carga Culqi.js dinámicamente (lazy: sólo si se necesita)
 * 2. Configura la public_key
 * 3. Expone tokenizeCard() que abre el checkout y resuelve con el token
 */

const CULQI_SCRIPT_URL = 'https://checkout.culqi.com/js/v4'

let scriptLoadingPromise: Promise<void> | null = null

// El tipo global de window.Culqi está declarado en AddPaymentMethodModal.tsx.
// Aquí accedemos via window con cast local para evitar conflicto y tener
// la forma específica que usamos.
interface CulqiCheckout {
  publicKey: string
  settings: (opts: {
    title?: string
    currency?: string
    description?: string
    amount: number
  }) => void
  options: (opts: Record<string, unknown>) => void
  open: () => void
  close: () => void
  token: { id: string; email: string } | null
  error: { code?: string; merchant_message?: string; user_message?: string } | null
}

function getCulqi(): CulqiCheckout | undefined {
  return (window as any).Culqi as CulqiCheckout | undefined
}

function setCulqiCallback(fn: (() => void) | undefined) {
  ;(window as any).culqi = fn
}

function loadCulqiScript(): Promise<void> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('No window'))
  }
  if (getCulqi()) return Promise.resolve()
  if (scriptLoadingPromise) return scriptLoadingPromise

  scriptLoadingPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = CULQI_SCRIPT_URL
    script.async = true
    script.onload = () => {
      if (getCulqi()) resolve()
      else reject(new Error('Culqi.js cargó pero window.Culqi no está definido'))
    }
    script.onerror = () => {
      scriptLoadingPromise = null
      reject(new Error('No se pudo cargar Culqi.js'))
    }
    document.head.appendChild(script)
  })

  return scriptLoadingPromise
}

export interface TokenizeOptions {
  publicKey: string
  amountCents: number // en céntimos (S/ 30.00 = 3000)
  currency?: string
  description?: string
  customerEmail?: string
}

export interface TokenizeResult {
  token: string
  email: string
}

/**
 * Abre el checkout de Culqi y resuelve con el token cuando el cliente
 * completa el formulario de tarjeta. Si cierra el modal sin pagar,
 * rechaza con un error tipo 'cancelled'.
 *
 * NOTA: Culqi.js v4 usa callbacks globales (window.culqi). Esta función
 * envuelve eso en un Promise.
 */
export async function tokenizeCard(opts: TokenizeOptions): Promise<TokenizeResult> {
  await loadCulqiScript()
  const Culqi = getCulqi()
  if (!Culqi) {
    throw new Error('Culqi.js no disponible')
  }

  Culqi.publicKey = opts.publicKey
  Culqi.settings({
    title: 'Stylo',
    currency: opts.currency ?? 'PEN',
    description: opts.description ?? 'Depósito de reserva',
    amount: opts.amountCents,
  })
  Culqi.options({
    lang: 'es',
    installments: false,
    paymentMethods: { tarjeta: true, yape: false },
    style: { logo: '', maincolor: '#1a1a1a' },
  })

  return new Promise<TokenizeResult>((resolve, reject) => {
    const onCulqi = () => {
      const C = getCulqi()
      if (C?.token) {
        resolve({ token: C.token.id, email: C.token.email })
        setCulqiCallback(undefined)
      } else if (C?.error) {
        const msg =
          C.error.user_message ||
          C.error.merchant_message ||
          'No pudimos procesar tu tarjeta.'
        reject(new Error(msg))
        setCulqiCallback(undefined)
      } else {
        reject(new Error('Pago cancelado.'))
        setCulqiCallback(undefined)
      }
    }

    setCulqiCallback(onCulqi)
    Culqi.open()
  })
}

/**
 * Lee la public_key desde una env var del frontend.
 */
export function getCulqiPublicKey(): string {
  return import.meta.env.VITE_CULQI_PUBLIC_KEY || ''
}
