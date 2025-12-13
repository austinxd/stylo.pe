import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios'
import { useAuthStore } from '@/store/authStore'

const API_URL = import.meta.env.VITE_API_URL || '/api/v1'

export const apiClient = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
})

// Interceptor para agregar token de autenticación
apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = useAuthStore.getState().accessToken
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => Promise.reject(error)
)

// Interceptor para manejar errores y refresh token
apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & {
      _retry?: boolean
    }

    // Si es error 401 y no es un retry, intentar refresh
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true

      const refreshToken = useAuthStore.getState().refreshToken

      if (refreshToken) {
        try {
          const response = await axios.post(`${API_URL}/auth/token/refresh`, {
            refresh: refreshToken,
          })

          const { access, refresh } = response.data
          useAuthStore.getState().setTokens(access, refresh)

          originalRequest.headers.Authorization = `Bearer ${access}`
          return apiClient(originalRequest)
        } catch {
          // Si falla el refresh, hacer logout
          useAuthStore.getState().logout()
          window.location.href = '/auth/login'
        }
      } else {
        useAuthStore.getState().logout()
        window.location.href = '/auth/login'
      }
    }

    return Promise.reject(error)
  }
)

export default apiClient
