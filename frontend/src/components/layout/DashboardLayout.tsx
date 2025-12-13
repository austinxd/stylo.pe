import { useState } from 'react'
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import authApi from '@/api/auth'
import clsx from 'clsx'

const navigation = [
  { name: 'Inicio', href: '/dashboard', icon: '📊' },
  { name: 'Calendario', href: '/dashboard/calendario', icon: '📅' },
  { name: 'Citas', href: '/dashboard/citas', icon: '📋' },
  { name: 'Servicios', href: '/dashboard/servicios', icon: '✂️' },
  { name: 'Equipo', href: '/dashboard/equipo', icon: '👥' },
  { name: 'Sucursales', href: '/dashboard/sucursales', icon: '🏪' },
  { name: 'Codigo QR', href: '/dashboard/qr', icon: '📱' },
  { name: 'Configuracion', href: '/dashboard/configuracion', icon: '⚙️' },
]

export default function DashboardLayout() {
  const { user, refreshToken, logout } = useAuthStore()
  const location = useLocation()
  const navigate = useNavigate()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  // Detectar si estamos en la pagina de onboarding
  const isOnboarding = location.pathname === '/dashboard/onboarding'

  const handleLogout = async () => {
    try {
      if (refreshToken) {
        await authApi.logout(refreshToken)
      }
    } finally {
      logout()
      navigate('/')
    }
  }

  const handleNavClick = () => {
    setSidebarOpen(false)
  }

  // Si estamos en onboarding, mostrar layout simplificado
  if (isOnboarding) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-primary-900 to-primary-800">
        <Outlet />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Mobile sidebar backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={clsx(
          'fixed inset-y-0 left-0 w-64 bg-gray-900 text-white z-50 transform transition-transform duration-300 ease-in-out',
          'lg:translate-x-0',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        {/* Logo */}
        <div className="flex items-center justify-between h-16 px-6 border-b border-gray-800">
          <Link to="/dashboard" className="text-2xl font-bold text-primary-400">
            Stylo
          </Link>
          {/* Close button for mobile */}
          <button
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden text-gray-400 hover:text-white p-1"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Navigation */}
        <nav className="mt-6 px-3 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 140px)' }}>
          <ul className="space-y-1">
            {navigation.map((item) => (
              <li key={item.name}>
                <Link
                  to={item.href}
                  onClick={handleNavClick}
                  className={clsx(
                    'flex items-center px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                    location.pathname === item.href
                      ? 'bg-gray-800 text-white'
                      : 'text-gray-400 hover:bg-gray-800 hover:text-white'
                  )}
                >
                  <span className="mr-3 text-lg">{item.icon}</span>
                  {item.name}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        {/* User info */}
        <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-gray-800 bg-gray-900">
          <div className="flex items-center justify-between">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium truncate">{user?.phone_number}</p>
              <p className="text-xs text-gray-400 capitalize truncate">{user?.role.replace('_', ' ')}</p>
            </div>
            <button
              onClick={handleLogout}
              className="text-gray-400 hover:text-white ml-2 p-2"
              title="Cerrar sesion"
            >
              🚪
            </button>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className="lg:pl-64 min-h-screen flex flex-col">
        {/* Header */}
        <header className="bg-white border-b border-gray-200 sticky top-0 z-30">
          <div className="flex items-center justify-between h-14 sm:h-16 px-4 sm:px-6 lg:px-8">
            {/* Mobile menu button */}
            <button
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden p-2 -ml-2 text-gray-600 hover:text-gray-900"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>

            <h1 className="text-lg sm:text-xl font-semibold text-gray-800 truncate">
              {navigation.find((n) => n.href === location.pathname)?.name || 'Dashboard'}
            </h1>

            <div className="flex items-center space-x-2 sm:space-x-4">
              <button className="p-2 text-gray-400 hover:text-gray-600">
                🔔
              </button>
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
