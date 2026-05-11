/**
 * Helper que envuelve el flujo de verifyOTP + cobro de depósito.
 *
 * Backend devuelve:
 * - 200 OK con appointment: reserva confirmada (sin depósito)
 * - 402 PAYMENT_REQUIRED con deposit_required=true: necesita card_token
 * - 402 PAYMENT_REQUIRED con deposit_failed=true: tarjeta rechazada
 *
 * Este helper:
 * 1. Llama verifyOTP sin card_token
 * 2. Si 402 deposit_required → abre Culqi.js → reintenta con card_token
 * 3. Si todo va bien retorna el appointment
 */
import axios from 'axios'

import bookingApi, {
  type BookingVerifyOTPRequest,
  type BookingVerifyOTPResponse,
  type BookingDepositRequiredError,
} from '@/api/booking'
import { tokenizeCard, getCulqiPublicKey } from './culqi'

export interface VerifyWithDepositOptions {
  request: BookingVerifyOTPRequest
  /** Email del cliente (para el campo de Culqi). */
  customerEmail?: string
  /** Descripción que aparece en el checkout. */
  description?: string
  /**
   * Callback opcional cuando se detecta que se necesita depósito,
   * antes de abrir Culqi (para mostrar UI explicativa).
   */
  onDepositRequired?: (info: BookingDepositRequiredError) => void
}

export class DepositFlowError extends Error {
  constructor(
    message: string,
    public readonly stage:
      | 'initial-verify'
      | 'tokenize'
      | 'charge-retry'
      | 'unknown',
  ) {
    super(message)
  }
}

/**
 * Ejecuta el verifyOTP, manejando el depósito si la sucursal lo requiere.
 */
export async function verifyOTPWithDepositFlow(
  opts: VerifyWithDepositOptions,
): Promise<BookingVerifyOTPResponse> {
  // 1. Primer intento sin card_token
  try {
    return await bookingApi.verifyOTP(opts.request)
  } catch (err) {
    if (!axios.isAxiosError(err) || err.response?.status !== 402) {
      throw err
    }

    const data = err.response.data as Partial<BookingDepositRequiredError> & {
      deposit_failed?: boolean
    }

    if (!data?.deposit_required) {
      // 402 con otro motivo → propagar
      throw err
    }

    // 2. Backend nos dijo que necesitamos depósito. Notificar UI y tokenizar.
    opts.onDepositRequired?.(data as BookingDepositRequiredError)

    const publicKey = getCulqiPublicKey()
    if (!publicKey) {
      throw new DepositFlowError(
        'Pagos no disponibles temporalmente. Contacta al negocio.',
        'tokenize',
      )
    }

    const amountSoles = parseFloat(data.deposit_amount || '0')
    if (!amountSoles || amountSoles <= 0) {
      throw new DepositFlowError(
        'Monto de depósito inválido recibido del servidor.',
        'tokenize',
      )
    }

    let tokenResult
    try {
      tokenResult = await tokenizeCard({
        publicKey,
        amountCents: Math.round(amountSoles * 100),
        currency: 'PEN',
        description: opts.description ?? `Depósito de reserva`,
        customerEmail: opts.customerEmail,
      })
    } catch (e) {
      throw new DepositFlowError(
        e instanceof Error ? e.message : 'No pudimos procesar la tarjeta.',
        'tokenize',
      )
    }

    // 3. Retry verifyOTP con card_token
    try {
      return await bookingApi.verifyOTP({
        ...opts.request,
        card_token: tokenResult.token,
      })
    } catch (e) {
      if (axios.isAxiosError(e) && e.response?.status === 402) {
        const retryData = e.response.data as any
        if (retryData?.deposit_failed) {
          throw new DepositFlowError(
            retryData.error || 'Tu tarjeta fue rechazada. Intenta con otra.',
            'charge-retry',
          )
        }
      }
      throw e
    }
  }
}
