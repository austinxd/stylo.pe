import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import {
  loadBookingState,
  saveBookingState,
  clearBookingState,
  useBookingPersistence,
} from './useBookingPersistence'
import type { PersistedBookingState } from './types'
import { INITIAL_CLIENT_DATA } from './types'

const sampleState: PersistedBookingState = {
  step: 'client',
  selectedServiceId: 1,
  selectedStaffId: 2,
  selectedDateISO: '2026-05-15T10:00:00Z',
  clientData: {
    ...INITIAL_CLIENT_DATA,
    phone_number: '+51987654321',
    first_name: 'Ana',
  },
  isExistingClient: false,
  clientLookupDone: false,
  businessSlug: 'salon-test',
  branchSlug: 'centro',
}

describe('useBookingPersistence storage helpers', () => {
  beforeEach(() => {
    sessionStorage.clear()
  })

  it('retorna null cuando no hay storage', () => {
    expect(loadBookingState('a', 'b')).toBeNull()
  })

  it('guarda y recupera el estado correctamente', () => {
    saveBookingState(sampleState)
    const loaded = loadBookingState('salon-test', 'centro')
    expect(loaded?.step).toBe('client')
    expect(loaded?.clientData.first_name).toBe('Ana')
    expect(loaded?.selectedServiceId).toBe(1)
  })

  it('aísla por (businessSlug, branchSlug) — anti-leak entre negocios', () => {
    saveBookingState(sampleState)
    expect(loadBookingState('otro-negocio', 'centro')).toBeNull()
    expect(loadBookingState('salon-test', 'otra-sucursal')).toBeNull()
  })

  it('expira tras 31 minutos y limpia la key', () => {
    saveBookingState(sampleState)
    const key = `stylo:booking:salon-test:centro`
    const env = JSON.parse(sessionStorage.getItem(key)!)
    env.savedAt = Date.now() - 31 * 60 * 1000
    sessionStorage.setItem(key, JSON.stringify(env))

    expect(loadBookingState('salon-test', 'centro')).toBeNull()
    // Y limpia la key expirada
    expect(sessionStorage.getItem(key)).toBeNull()
  })

  it('no expira a los 29 minutos', () => {
    saveBookingState(sampleState)
    const key = `stylo:booking:salon-test:centro`
    const env = JSON.parse(sessionStorage.getItem(key)!)
    env.savedAt = Date.now() - 29 * 60 * 1000
    sessionStorage.setItem(key, JSON.stringify(env))

    expect(loadBookingState('salon-test', 'centro')).not.toBeNull()
  })

  it('clearBookingState elimina la key', () => {
    saveBookingState(sampleState)
    clearBookingState('salon-test', 'centro')
    expect(loadBookingState('salon-test', 'centro')).toBeNull()
  })

  it('JSON corrupto retorna null sin lanzar', () => {
    sessionStorage.setItem('stylo:booking:a:b', '{not valid json')
    expect(loadBookingState('a', 'b')).toBeNull()
  })

  it('soporta múltiples negocios sin pisarse', () => {
    saveBookingState({ ...sampleState, businessSlug: 'neg-a', branchSlug: 's1' })
    saveBookingState({
      ...sampleState,
      businessSlug: 'neg-b',
      branchSlug: 's1',
      clientData: { ...sampleState.clientData, first_name: 'Bob' },
    })
    expect(loadBookingState('neg-a', 's1')?.clientData.first_name).toBe('Ana')
    expect(loadBookingState('neg-b', 's1')?.clientData.first_name).toBe('Bob')
  })
})

describe('useBookingPersistence hook', () => {
  beforeEach(() => {
    sessionStorage.clear()
    vi.useFakeTimers()
  })

  it('guarda el estado tras el debounce de 300ms', () => {
    renderHook(() =>
      useBookingPersistence({ state: sampleState, enabled: true }),
    )

    // Antes de 300ms: nada en storage
    vi.advanceTimersByTime(200)
    expect(sessionStorage.getItem('stylo:booking:salon-test:centro')).toBeNull()

    // Después de 300ms: guardado
    vi.advanceTimersByTime(150)
    const stored = sessionStorage.getItem('stylo:booking:salon-test:centro')
    expect(stored).not.toBeNull()
    expect(JSON.parse(stored!).state.step).toBe('client')

    vi.useRealTimers()
  })

  it('no guarda cuando enabled=false', () => {
    renderHook(() =>
      useBookingPersistence({ state: sampleState, enabled: false }),
    )
    vi.advanceTimersByTime(1000)
    expect(sessionStorage.getItem('stylo:booking:salon-test:centro')).toBeNull()
    vi.useRealTimers()
  })

  it('rerender con nuevo estado actualiza storage', () => {
    const { rerender } = renderHook(
      ({ state }) => useBookingPersistence({ state, enabled: true }),
      { initialProps: { state: sampleState } },
    )
    vi.advanceTimersByTime(400)

    const updated: PersistedBookingState = {
      ...sampleState,
      step: 'otp',
      clientData: { ...sampleState.clientData, first_name: 'Cambiado' },
    }
    rerender({ state: updated })
    vi.advanceTimersByTime(400)

    const stored = JSON.parse(
      sessionStorage.getItem('stylo:booking:salon-test:centro')!,
    )
    expect(stored.state.step).toBe('otp')
    expect(stored.state.clientData.first_name).toBe('Cambiado')
    vi.useRealTimers()
  })
})
