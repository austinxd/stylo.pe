import { describe, it, expect } from 'vitest'
import { AxiosError, AxiosHeaders } from 'axios'
import { getApiErrorMessage } from './client'

/**
 * Construye un AxiosError de prueba con status + data.
 * Necesitamos isAxiosError=true para que el helper lo procese.
 */
function makeAxiosError(status: number, data?: unknown): AxiosError {
  const err = new AxiosError(
    'Request failed',
    `${status}`,
    undefined,
    undefined,
    {
      data,
      status,
      statusText: '',
      headers: new AxiosHeaders(),
      config: { headers: new AxiosHeaders() } as any,
    },
  )
  return err
}

describe('getApiErrorMessage', () => {
  it('retorna el fallback para errores que no son axios', () => {
    expect(getApiErrorMessage(new Error('boom'))).toBe(
      'Ocurrió un error. Intenta de nuevo.',
    )
  })

  it('usa fallback custom cuando se pasa', () => {
    expect(getApiErrorMessage(new Error('boom'), 'Custom')).toBe('Custom')
  })

  it('reporta "sin conexión" cuando AxiosError no tiene response', () => {
    const err = new AxiosError('Network Error', 'ERR_NETWORK')
    expect(getApiErrorMessage(err)).toBe(
      'Sin conexión. Verifica tu internet e intenta de nuevo.',
    )
  })

  it('extrae data.error con prioridad sobre código HTTP', () => {
    const err = makeAxiosError(400, { error: 'Slot ya reservado' })
    expect(getApiErrorMessage(err)).toBe('Slot ya reservado')
  })

  it('cae a data.detail si no hay data.error', () => {
    const err = makeAxiosError(404, { detail: 'No encontrado' })
    expect(getApiErrorMessage(err)).toBe('No encontrado')
  })

  it('extrae primer mensaje de array (DRF field errors)', () => {
    const err = makeAxiosError(400, {
      phone_number: ['Formato inválido'],
      email: ['Requerido'],
    })
    expect(getApiErrorMessage(err)).toBe('Formato inválido')
  })

  it('extrae string suelto en algún campo del data', () => {
    const err = makeAxiosError(400, { campo: 'mensaje suelto' })
    expect(getApiErrorMessage(err)).toBe('mensaje suelto')
  })

  describe('mensajes localizados por código HTTP (data null)', () => {
    it('400', () => {
      expect(getApiErrorMessage(makeAxiosError(400, null))).toBe(
        'Datos inválidos. Revisa el formulario.',
      )
    })
    it('401', () => {
      expect(getApiErrorMessage(makeAxiosError(401, null))).toBe(
        'Sesión expirada. Inicia sesión nuevamente.',
      )
    })
    it('402', () => {
      expect(getApiErrorMessage(makeAxiosError(402, null))).toBe(
        'Pago requerido para continuar.',
      )
    })
    it('403', () => {
      expect(getApiErrorMessage(makeAxiosError(403, null))).toBe(
        'No tienes permiso para esta acción.',
      )
    })
    it('404', () => {
      expect(getApiErrorMessage(makeAxiosError(404, null))).toBe(
        'Recurso no encontrado.',
      )
    })
    it('409 (conflict / double-booking)', () => {
      expect(getApiErrorMessage(makeAxiosError(409, null))).toBe(
        'El recurso ya no está disponible.',
      )
    })
    it('429 (rate limit)', () => {
      expect(getApiErrorMessage(makeAxiosError(429, null))).toBe(
        'Demasiados intentos. Espera unos minutos.',
      )
    })
    it.each([500, 502, 503, 504])('%d (server error)', (code) => {
      expect(getApiErrorMessage(makeAxiosError(code, null))).toBe(
        'Servicio no disponible. Intenta de nuevo en unos minutos.',
      )
    })
    it('código desconocido cae a fallback', () => {
      expect(getApiErrorMessage(makeAxiosError(418, null))).toBe(
        'Ocurrió un error. Intenta de nuevo.',
      )
    })
  })
})
