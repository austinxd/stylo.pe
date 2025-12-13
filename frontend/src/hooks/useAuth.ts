import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import authApi from '@/api/auth'

/**
 * Hook para manejar la autenticación.
 */
export function useAuth() {
  const navigate = useNavigate()
  const {
    user,
    client,
    isAuthenticated,
    accessToken,
    refreshToken,
    logout: storeLogout,
  } = useAuthStore()

  /**
   * Cierra la sesión del usuario.
   */
  const logout = async () => {
    try {
      if (refreshToken) {
        await authApi.logout(refreshToken)
      }
    } finally {
      storeLogout()
      navigate('/')
    }
  }

  /**
   * Verifica si el usuario tiene un rol específico.
   */
  const hasRole = (role: string | string[]): boolean => {
    if (!user) return false
    if (Array.isArray(role)) {
      return role.includes(user.role)
    }
    return user.role === role
  }

  /**
   * Verifica si el usuario es administrador.
   */
  const isAdmin = (): boolean => {
    return hasRole(['super_admin', 'business_owner', 'branch_manager'])
  }

  /**
   * Verifica si el usuario es cliente.
   */
  const isClient = (): boolean => {
    return hasRole('client')
  }

  return {
    user,
    client,
    isAuthenticated,
    accessToken,
    logout,
    hasRole,
    isAdmin,
    isClient,
  }
}

export default useAuth
