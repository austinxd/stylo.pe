import { useState, useEffect } from 'react'
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useAuthStore } from '@/store/authStore'
import authApi from '@/api/auth'
import subscriptionsApi, { SubscriptionAlert } from '@/api/subscriptions'
import clsx from 'clsx'

const navigation = [
  { name: 'Inicio', href: '/dashboard', icon: '📊' },
  { name: 'Citas', href: '/dashboard/citas', icon: '📅' },
  { name: 'Servicios', href: '/dashboard/servicios', icon: '✂️' },
  { name: 'Equipo', href: '/dashboard/equipo', icon: '👥' },
  { name: 'Sucursales', href: '/dashboard/sucursales', icon: '🏪' },
  { name: 'Codigo QR', href: '/dashboard/qr', icon: '📱' },
  { name: 'Suscripcion', href: '/dashboard/suscripcion', icon: '💳', ownerOnly: true },
  { name: 'Configuracion', href: '/dashboard/configuracion', icon: '⚙️' },
] as const

export default function DashboardLayout() {
  const { user, refreshToken, logout } = useAuthStore()
  const location = useLocation()
  const navigate = useNavigate()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    const saved = localStorage.getItem('sidebar-collapsed')
    return saved === 'true'
  })

  useEffect(() => {
    localStorage.setItem('sidebar-collapsed', String(sidebarCollapsed))
  }, [sidebarCollapsed])

  const isOnboarding = location.pathname === '/dashboard/onboarding'

  const { data: alertsData } = useQuery<{ alerts: SubscriptionAlert[] }>({
    queryKey: ['subscription', 'alerts'],
    queryFn: subscriptionsApi.getAlerts,
    enabled: user?.role === 'business_owner' && !isOnboarding,
    refetchInterval: 5 * 60 * 1000,
  })

  const criticalAlerts = alertsData?.alerts.filter(
    (a) => a.severity === 'error' || a.severity === 'warning'
  ) || []

  const filteredNavigation = navigation.filter((item) => {
    if ('ownerOnly' in item && item.ownerOnly) {
      return user?.role === 'business_owner'
    }
    return true
  })

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
          'fixed inset-y-0 left-0 bg-gray-900 text-white z-50 transition-all duration-300 ease-in-out',
          'lg:translate-x-0',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full',
          sidebarCollapsed ? 'lg:w-[72px]' : 'lg:w-64',
          'w-64'
        )}
      >
        {/* Header con logo */}
        <div className={clsx(
          "flex items-center h-16 border-b border-gray-800",
          sidebarCollapsed ? 'lg:justify-center lg:px-2' : 'px-5'
        )}>
          <Link
            to="/dashboard"
            className={clsx(
              "flex items-center gap-2",
              sidebarCollapsed ? 'lg:justify-center' : ''
            )}
          >
            <div className="w-8 h-8 bg-primary-500 rounded-lg flex items-center justify-center text-white font-bold text-lg">
              S
            </div>
            <span className={clsx(
              "text-xl font-bold text-white transition-opacity duration-200",
              sidebarCollapsed ? 'lg:hidden' : ''
            )}>
              Stylo
            </span>
          </Link>

          {/* Close button for mobile */}
          <button
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden ml-auto text-gray-400 hover:text-white p-1"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 mt-4 px-3 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 180px)' }}>
          <ul className="space-y-1">
            {filteredNavigation.map((item) => {
              const isActive = location.pathname === item.href
              return (
                <li key={item.name}>
                  <Link
                    to={item.href}
                    onClick={handleNavClick}
                    title={sidebarCollapsed ? item.name : undefined}
                    className={clsx(
                      'group flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150',
                      sidebarCollapsed ? 'lg:justify-center lg:px-0' : '',
                      isActive
                        ? 'bg-primary-600 text-white'
                        : 'text-gray-400 hover:bg-gray-800 hover:text-white'
                    )}
                  >
                    <span className={clsx(
                      "text-lg transition-transform",
                      sidebarCollapsed ? '' : 'group-hover:scale-110'
                    )}>{item.icon}</span>
                    <span className={clsx(
                      "transition-opacity duration-200",
                      sidebarCollapsed ? 'lg:hidden' : ''
                    )}>{item.name}</span>
                  </Link>
                </li>
              )
            })}
          </ul>
        </nav>

        {/* Footer con toggle y user */}
        <div className="absolute bottom-0 left-0 right-0 border-t border-gray-800 bg-gray-900">
          {/* Collapse toggle - desktop only */}
          <button
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className={clsx(
              "hidden lg:flex w-full items-center gap-3 px-5 py-3 text-gray-400 hover:text-white hover:bg-gray-800 transition-colors",
              sidebarCollapsed ? 'justify-center px-0' : ''
            )}
          >
            <svg
              className={clsx(
                "w-5 h-5 transition-transform duration-300",
                sidebarCollapsed ? 'rotate-180' : ''
              )}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
            </svg>
            <span className={clsx(
              "text-sm",
              sidebarCollapsed ? 'lg:hidden' : ''
            )}>Colapsar</span>
          </button>

          {/* User info */}
          <div className={clsx(
            "flex items-center gap-3 p-4 border-t border-gray-800",
            sidebarCollapsed ? 'lg:justify-center lg:p-3' : ''
          )}>
            <div className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center text-sm font-medium text-gray-300 flex-shrink-0">
              {user?.phone_number?.slice(-2) || '?'}
            </div>
            <div className={clsx(
              "flex-1 min-w-0",
              sidebarCollapsed ? 'lg:hidden' : ''
            )}>
              <p className="text-sm font-medium truncate text-gray-200">{user?.phone_number}</p>
              <p className="text-xs text-gray-500 capitalize truncate">{user?.role?.replace('_', ' ')}</p>
            </div>
            <button
              onClick={handleLogout}
              className={clsx(
                "p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors",
                sidebarCollapsed ? 'lg:hidden' : ''
              )}
              title="Cerrar sesion"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
            </button>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className={clsx(
        "min-h-screen flex flex-col transition-all duration-300",
        sidebarCollapsed ? 'lg:pl-[72px]' : 'lg:pl-64'
      )}>
        {/* Header */}
        <header className="bg-white border-b border-gray-200 sticky top-0 z-30">
          <div className="flex items-center justify-between h-14 sm:h-16 px-4 sm:px-6 lg:px-8">
            {/* Mobile menu button */}
            <button
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden p-2 -ml-2 text-gray-600 hover:text-gray-900 rounded-lg hover:bg-gray-100"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>

            {/* Spacer for desktop */}
            <div className="hidden lg:block" />

            <h1 className="text-lg sm:text-xl font-semibold text-gray-800 truncate">
              {filteredNavigation.find((n) => n.href === location.pathname)?.name || 'Dashboard'}
            </h1>

            <div className="flex items-center space-x-2 sm:space-x-4">
              <button className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg">
                🔔
              </button>
            </div>
          </div>
        </header>

        {/* Alert Banner */}
        {criticalAlerts.length > 0 && (
          <div
            className={clsx(
              "px-4 py-3",
              criticalAlerts[0].severity === 'error' ? 'bg-red-600' : 'bg-yellow-500'
            )}
          >
            <div className="flex items-center justify-between max-w-7xl mx-auto">
              <div className="flex items-center gap-3 text-white">
                <svg className="w-5 h-5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                <div>
                  <span className="font-medium">{criticalAlerts[0].title}:</span>{' '}
                  <span className="text-sm opacity-90">{criticalAlerts[0].message}</span>
                </div>
              </div>
              {criticalAlerts[0].action && (
                <Link
                  to="/dashboard/suscripcion"
                  className="flex-shrink-0 px-4 py-1.5 bg-white text-gray-900 text-sm font-medium rounded-lg hover:bg-gray-100 transition-colors"
                >
                  {criticalAlerts[0].action_label}
                </Link>
              )}
            </div>
          </div>
        )}

        {/* Page content */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
