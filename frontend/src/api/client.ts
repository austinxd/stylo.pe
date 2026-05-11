import axios, { AxiosError, AxiosRequestConfig, InternalAxiosRequestConfig } from 'axios'
import { useAuthStore } from '@/store/authStore'

const API_URL = import.meta.env.VITE_API_URL || '/api/v1'

// Base URL para archivos media (sin /api/v1)
export const MEDIA_BASE_URL = API_URL.replace('/api/v1', '').replace('/api', '') || ''

// Helper para construir URLs de media
export const getMediaUrl = (path: string | null | undefined): string | null => {
  if (!path) return null
  if (path.startsWith('http')) return path
  return `${MEDIA_BASE_URL}${path}`
}

export const apiClient = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 30000,
})

// Interceptor de request: inyecta Bearer token
apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = useAuthStore.getState().accessToken
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => Promise.reject(error),
)

/**
 * Refresh token con queue: si varios requests reciben 401 a la vez, sólo
 * ejecutamos UN refresh y los demás esperan al mismo promise.
 *
 * Evita el bug donde múltiples requests paralelos llaman /token/refresh,
 * el primero rota el refresh y los demás se invalidan, deslogueando al usuario.
 */
let refreshPromise: Promise<string | null> | null = null

async function performTokenRefresh(): Promise<string | null> {
  const refreshToken = useAuthStore.getState().refreshToken
  if (!refreshToken) return null

  try {
    // axios "plano" para evitar bucle con interceptor
    const response = await axios.post(`${API_URL}/auth/token/refresh`, {
      refresh: refreshToken,
    })
    const { access, refresh } = response.data
    useAuthStore.getState().setTokens(access, refresh ?? refreshToken)
    return access
  } catch {
    return null
  }
}

function getOrStartRefresh(): Promise<string | null> {
  if (!refreshPromise) {
    refreshPromise = performTokenRefresh().finally(() => {
      // Liberar slot tras resolver (éxito o falla)
      refreshPromise = null
    })
  }
  return refreshPromise
}

function redirectToLogin() {
  useAuthStore.getState().logout()
  // No interrumpir si ya estamos en login
  if (!window.location.pathname.startsWith('/auth/')) {
    window.location.href = '/auth/login'
  }
}

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as
      | (InternalAxiosRequestConfig & { _retry?: boolean })
      | undefined

    // Network error: sin response
    if (!error.response) {
      // No alteramos el flujo; el caller decide cómo mostrarlo
      return Promise.reject(error)
    }

    // 401 → refresh con queue
    if (
      error.response.status === 401 &&
      originalRequest &&
      !originalRequest._retry &&
      !originalRequest.url?.includes('/auth/token/refresh')
    ) {
      originalRequest._retry = true

      const newToken = await getOrStartRefresh()
      if (!newToken) {
        redirectToLogin()
        return Promise.reject(error)
      }

      originalRequest.headers.Authorization = `Bearer ${newToken}`
      return apiClient(originalRequest)
    }

    return Promise.reject(error)
  },
)

/**
 * Extrae un mensaje amigable de un AxiosError.
 *
 * Prioridad:
 * 1. response.data.error (string)
 * 2. response.data.detail (string)
 * 3. Primer campo con errores de DRF (mensaje localizado)
 * 4. Por código HTTP (mensajes genéricos en español)
 * 5. Fallback genérico
 */
export function getApiErrorMessage(
  error: unknown,
  fallback = 'Ocurrió un error. Intenta de nuevo.',
): string {
  if (!axios.isAxiosError(error)) {
    return fallback
  }

  if (!error.response) {
    return 'Sin conexión. Verifica tu internet e intenta de nuevo.'
  }

  const data = error.response.data as Record<string, unknown> | undefined

  if (data) {
    if (typeof data.error === 'string') return data.error
    if (typeof data.detail === 'string') return data.detail

    // DRF field errors: { phone_number: ["Inválido"], otp_code: ["Expirado"] }
    for (const value of Object.values(data)) {
      if (Array.isArray(value) && typeof value[0] === 'string') {
        return value[0]
      }
      if (typeof value === 'string') return value
    }
  }

  switch (error.response.status) {
    case 400:
      return 'Datos inválidos. Revisa el formulario.'
    case 401:
      return 'Sesión expirada. Inicia sesión nuevamente.'
    case 402:
      return 'Pago requerido para continuar.'
    case 403:
      return 'No tienes permiso para esta acción.'
    case 404:
      return 'Recurso no encontrado.'
    case 409:
      return 'El recurso ya no está disponible.'
    case 429:
      return 'Demasiados intentos. Espera unos minutos.'
    case 500:
    case 502:
    case 503:
    case 504:
      return 'Servicio no disponible. Intenta de nuevo en unos minutos.'
    default:
      return fallback
  }
}

/** Helper tipado para invocar requests sin lidiar con AxiosResponse. */
export async function apiRequest<T = unknown>(
  config: AxiosRequestConfig,
): Promise<T> {
  const res = await apiClient.request<T>(config)
  return res.data
}

export default apiClient
