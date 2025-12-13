import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { User, Client } from '@/types'

interface AuthState {
  // Estado
  user: User | null
  client: Client | null
  accessToken: string | null
  refreshToken: string | null
  isAuthenticated: boolean
  _hasHydrated: boolean

  // Acciones
  setAuth: (data: {
    user: User
    client?: Client
    accessToken: string
    refreshToken: string
  }) => void
  updateClient: (client: Client) => void
  logout: () => void
  setTokens: (accessToken: string, refreshToken: string) => void
  setHasHydrated: (state: boolean) => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      // Estado inicial
      user: null,
      client: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,
      _hasHydrated: false,

      // Acciones
      setAuth: (data) =>
        set({
          user: data.user,
          client: data.client || null,
          accessToken: data.accessToken,
          refreshToken: data.refreshToken,
          isAuthenticated: true,
        }),

      updateClient: (client) =>
        set({
          client,
        }),

      logout: () =>
        set({
          user: null,
          client: null,
          accessToken: null,
          refreshToken: null,
          isAuthenticated: false,
        }),

      setTokens: (accessToken, refreshToken) =>
        set({
          accessToken,
          refreshToken,
        }),

      setHasHydrated: (state) =>
        set({
          _hasHydrated: state,
        }),
    }),
    {
      name: 'stylo-auth',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        user: state.user,
        client: state.client,
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
        isAuthenticated: state.isAuthenticated,
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true)
      },
    }
  )
)
