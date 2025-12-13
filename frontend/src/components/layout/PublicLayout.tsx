import { Outlet, Link } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'

export default function PublicLayout() {
  const { isAuthenticated, user, _hasHydrated } = useAuthStore()

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            {/* Logo */}
            <Link to="/" className="flex items-center">
              <span className="text-2xl font-bold text-primary-600">Stylo</span>
            </Link>

            {/* Navigation */}
            <nav className="flex items-center space-x-4">
              {!_hasHydrated ? (
                // Mientras se rehidrata, mostrar placeholder
                <div className="h-10 w-24 bg-gray-100 rounded animate-pulse"></div>
              ) : isAuthenticated ? (
                <>
                  {user?.role === 'client' ? (
                    <Link
                      to="/mis-citas"
                      className="text-gray-600 hover:text-gray-900"
                    >
                      Mis Citas
                    </Link>
                  ) : (
                    <Link
                      to="/dashboard"
                      className="text-gray-600 hover:text-gray-900"
                    >
                      Dashboard
                    </Link>
                  )}
                  <Link
                    to="/perfil"
                    className="text-gray-600 hover:text-gray-900"
                  >
                    Perfil
                  </Link>
                </>
              ) : (
                <>
                  <Link
                    to="/login"
                    className="text-gray-600 hover:text-gray-900"
                  >
                    Iniciar Sesión
                  </Link>
                  <Link to="/registro" className="btn-primary">
                    Registrarse
                  </Link>
                </>
              )}
            </nav>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1">
        <Outlet />
      </main>

    </div>
  )
}
