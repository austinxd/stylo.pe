import { useEffect, useRef } from 'react'
import type { PersistedBookingState } from './types'

const STORAGE_PREFIX = 'stylo:booking:'
const TTL_MINUTES = 30

interface StoredEnvelope {
  savedAt: number
  state: PersistedBookingState
}

function storageKey(businessSlug: string, branchSlug: string): string {
  return `${STORAGE_PREFIX}${businessSlug}:${branchSlug}`
}

/**
 * Lee el estado guardado del sessionStorage si corresponde al mismo negocio
 * y aún no ha expirado.
 *
 * Retorna null si: no hay storage, expiró, o cambió de business/branch.
 */
export function loadBookingState(
  businessSlug: string,
  branchSlug: string,
): PersistedBookingState | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = sessionStorage.getItem(storageKey(businessSlug, branchSlug))
    if (!raw) return null
    const env = JSON.parse(raw) as StoredEnvelope
    const ageMs = Date.now() - env.savedAt
    if (ageMs > TTL_MINUTES * 60 * 1000) {
      sessionStorage.removeItem(storageKey(businessSlug, branchSlug))
      return null
    }
    if (
      env.state.businessSlug !== businessSlug ||
      env.state.branchSlug !== branchSlug
    ) {
      return null
    }
    return env.state
  } catch {
    return null
  }
}

export function saveBookingState(state: PersistedBookingState): void {
  if (typeof window === 'undefined') return
  try {
    const env: StoredEnvelope = { savedAt: Date.now(), state }
    sessionStorage.setItem(
      storageKey(state.businessSlug, state.branchSlug),
      JSON.stringify(env),
    )
  } catch {
    // Quota exceeded o navegador privado: ignorar
  }
}

export function clearBookingState(businessSlug: string, branchSlug: string): void {
  if (typeof window === 'undefined') return
  try {
    sessionStorage.removeItem(storageKey(businessSlug, branchSlug))
  } catch {
    /* noop */
  }
}

/**
 * Hook que persiste el estado en sessionStorage cuando cambia (con debounce).
 *
 * - No persiste mientras step === 'success' (el flujo terminó).
 * - Limpia el storage al completar exitosamente.
 *
 * Uso:
 *   useBookingPersistence({ state, enabled: step !== 'success' })
 */
export function useBookingPersistence({
  state,
  enabled,
}: {
  state: PersistedBookingState
  enabled: boolean
}): void {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!enabled) return
    if (timer.current) clearTimeout(timer.current)
    // Debounce 300ms para no escribir en cada keystroke del cliente
    timer.current = setTimeout(() => {
      saveBookingState(state)
    }, 300)
    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
  }, [state, enabled])
}
