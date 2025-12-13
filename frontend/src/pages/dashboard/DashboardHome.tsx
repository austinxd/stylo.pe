import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Navigate } from 'react-router-dom'
import apiClient from '@/api/client'
import { format, parseISO, subMonths, addMonths } from 'date-fns'
import { es } from 'date-fns/locale'
import { useAuthStore } from '@/store/authStore'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
} from 'recharts'

interface DashboardStats {
  period: {
    year: number
    month: number
    month_name: string
    start_date: string
    end_date: string
  }
  overview: {
    total_appointments: number
    completed_appointments: number
    cancelled_appointments: number
    no_shows: number
    new_clients: number
    revenue: number
    expected_revenue: number
    avg_ticket: number
  }
  efficiency: {
    completion_rate: number
    cancellation_rate: number
    no_show_rate: number
  }
  comparison: {
    appointments_change: number
    revenue_change: number
    prev_appointments: number
    prev_revenue: number
  }
  charts: {
    daily_appointments: { date: string; count: number }[]
    daily_revenue: { date: string; amount: number }[]
  }
  rankings: {
    popular_services: { id: number; name: string; count: number; revenue: number }[]
    top_staff: { id: number; name: string; appointments: number; revenue: number }[]
  }
}

interface OnboardingStatus {
  needs_onboarding: boolean
  has_business: boolean
}

export default function DashboardHome() {
  const { user } = useAuthStore()
  const [selectedMonth, setSelectedMonth] = useState(() => format(new Date(), 'yyyy-MM'))

  // Verificar si necesita onboarding (solo para business_owner)
  const { data: onboardingStatus, isLoading: checkingOnboarding } = useQuery({
    queryKey: ['dashboard', 'onboarding-status'],
    queryFn: async () => {
      const response = await apiClient.get<OnboardingStatus>('/dashboard/onboarding')
      return response.data
    },
    enabled: user?.role === 'business_owner',
  })

  // Obtener estadísticas mensuales
  const { data: stats, isLoading } = useQuery<DashboardStats>({
    queryKey: ['dashboard', 'stats', selectedMonth],
    queryFn: async () => {
      const response = await apiClient.get(`/dashboard/stats/?month=${selectedMonth}`)
      return response.data
    },
    enabled: !onboardingStatus?.needs_onboarding,
  })

  // Generar opciones de meses (6 meses atrás hasta 1 mes adelante)
  const monthOptions = useMemo(() => {
    const options = []
    const now = new Date()
    for (let i = -6; i <= 1; i++) {
      const date = i < 0 ? subMonths(now, Math.abs(i)) : i > 0 ? addMonths(now, i) : now
      options.push({
        value: format(date, 'yyyy-MM'),
        label: format(date, 'MMMM yyyy', { locale: es }),
      })
    }
    return options
  }, [])

  // Redirigir a onboarding si es necesario
  if (user?.role === 'business_owner' && onboardingStatus?.needs_onboarding) {
    return <Navigate to="/dashboard/onboarding" replace />
  }

  if (isLoading || checkingOnboarding) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    )
  }

  const renderChangeIndicator = (change: number, suffix = '%') => {
    if (change === 0) return <span className="text-gray-500 text-sm">Sin cambios</span>
    const isPositive = change > 0
    return (
      <span className={`text-sm font-medium ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
        {isPositive ? '+' : ''}{change.toFixed(1)}{suffix} vs mes anterior
      </span>
    )
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header con selector de mes */}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 sm:gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Panel de Control</h1>
          <p className="text-sm sm:text-base text-gray-500">Estadisticas y metricas de tu negocio</p>
        </div>
        <select
          value={selectedMonth}
          onChange={(e) => setSelectedMonth(e.target.value)}
          className="w-full sm:w-auto px-3 sm:px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white capitalize text-sm sm:text-base"
        >
          {monthOptions.map((option) => (
            <option key={option.value} value={option.value} className="capitalize">
              {option.label}
            </option>
          ))}
        </select>
      </div>

      {/* KPIs principales */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* Total citas */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6">
          <div className="flex items-center justify-between mb-1 sm:mb-2">
            <p className="text-xs sm:text-sm text-gray-500">Citas totales</p>
            <span className="text-lg sm:text-2xl">📅</span>
          </div>
          <p className="text-2xl sm:text-3xl font-bold text-gray-900">{stats?.overview.total_appointments || 0}</p>
          <div className="hidden sm:block">
            {stats?.comparison && renderChangeIndicator(stats.comparison.appointments_change)}
          </div>
        </div>

        {/* Ingresos */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6">
          <div className="flex items-center justify-between mb-1 sm:mb-2">
            <p className="text-xs sm:text-sm text-gray-500">Ingresos</p>
            <span className="text-lg sm:text-2xl">💰</span>
          </div>
          <p className="text-xl sm:text-3xl font-bold text-primary-600">
            S/ {(stats?.overview.revenue || 0).toLocaleString('es-PE', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
          </p>
          <div className="hidden sm:block">
            {stats?.comparison && renderChangeIndicator(stats.comparison.revenue_change)}
          </div>
        </div>

        {/* Ticket promedio */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6">
          <div className="flex items-center justify-between mb-1 sm:mb-2">
            <p className="text-xs sm:text-sm text-gray-500">Ticket promedio</p>
            <span className="text-lg sm:text-2xl">🧾</span>
          </div>
          <p className="text-2xl sm:text-3xl font-bold text-gray-900">
            S/ {(stats?.overview.avg_ticket || 0).toFixed(0)}
          </p>
          <span className="text-xs sm:text-sm text-gray-500 hidden sm:inline">por cita</span>
        </div>

        {/* Clientes nuevos */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6">
          <div className="flex items-center justify-between mb-1 sm:mb-2">
            <p className="text-xs sm:text-sm text-gray-500">Clientes nuevos</p>
            <span className="text-lg sm:text-2xl">👥</span>
          </div>
          <p className="text-2xl sm:text-3xl font-bold text-gray-900">{stats?.overview.new_clients || 0}</p>
          <span className="text-xs sm:text-sm text-gray-500 hidden sm:inline">este mes</span>
        </div>
      </div>

      {/* Metricas de eficiencia */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
        {/* Tasa de completitud */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6">
          <div className="flex items-center justify-between mb-2 sm:mb-4">
            <p className="text-xs sm:text-sm font-medium text-gray-700">Completitud</p>
            <span className={`text-xs sm:text-sm font-bold ${(stats?.efficiency.completion_rate || 0) >= 80 ? 'text-green-600' : (stats?.efficiency.completion_rate || 0) >= 60 ? 'text-yellow-600' : 'text-red-600'}`}>
              {stats?.efficiency.completion_rate || 0}%
            </span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-1.5 sm:h-2">
            <div
              className="bg-green-500 h-1.5 sm:h-2 rounded-full transition-all duration-500"
              style={{ width: `${stats?.efficiency.completion_rate || 0}%` }}
            />
          </div>
          <p className="mt-1.5 sm:mt-2 text-[10px] sm:text-xs text-gray-500">
            {stats?.overview.completed_appointments || 0}/{stats?.overview.total_appointments || 0} completadas
          </p>
        </div>

        {/* Tasa de cancelacion */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6">
          <div className="flex items-center justify-between mb-2 sm:mb-4">
            <p className="text-xs sm:text-sm font-medium text-gray-700">Cancelacion</p>
            <span className={`text-xs sm:text-sm font-bold ${(stats?.efficiency.cancellation_rate || 0) <= 10 ? 'text-green-600' : (stats?.efficiency.cancellation_rate || 0) <= 20 ? 'text-yellow-600' : 'text-red-600'}`}>
              {stats?.efficiency.cancellation_rate || 0}%
            </span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-1.5 sm:h-2">
            <div
              className="bg-red-500 h-1.5 sm:h-2 rounded-full transition-all duration-500"
              style={{ width: `${stats?.efficiency.cancellation_rate || 0}%` }}
            />
          </div>
          <p className="mt-1.5 sm:mt-2 text-[10px] sm:text-xs text-gray-500">
            {stats?.overview.cancelled_appointments || 0} canceladas
          </p>
        </div>

        {/* Tasa de no show */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6">
          <div className="flex items-center justify-between mb-2 sm:mb-4">
            <p className="text-xs sm:text-sm font-medium text-gray-700">No show</p>
            <span className={`text-xs sm:text-sm font-bold ${(stats?.efficiency.no_show_rate || 0) <= 5 ? 'text-green-600' : (stats?.efficiency.no_show_rate || 0) <= 10 ? 'text-yellow-600' : 'text-red-600'}`}>
              {stats?.efficiency.no_show_rate || 0}%
            </span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-1.5 sm:h-2">
            <div
              className="bg-orange-500 h-1.5 sm:h-2 rounded-full transition-all duration-500"
              style={{ width: `${stats?.efficiency.no_show_rate || 0}%` }}
            />
          </div>
          <p className="mt-1.5 sm:mt-2 text-[10px] sm:text-xs text-gray-500">
            {stats?.overview.no_shows || 0} no asistieron
          </p>
        </div>
      </div>

      {/* Graficos */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        {/* Grafico de citas diarias */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6">
          <h3 className="text-sm sm:text-lg font-semibold text-gray-900 mb-3 sm:mb-4">Citas por dia</h3>
          {stats?.charts.daily_appointments && stats.charts.daily_appointments.length > 0 ? (
            <ResponsiveContainer width="100%" height={200} className="sm:!h-[250px]">
              <AreaChart data={stats.charts.daily_appointments}>
                <defs>
                  <linearGradient id="colorCitas" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#3B82F6" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                <XAxis
                  dataKey="date"
                  tickFormatter={(value) => format(parseISO(value), 'd', { locale: es })}
                  stroke="#9CA3AF"
                  fontSize={10}
                  tick={{ fontSize: 10 }}
                  interval="preserveStartEnd"
                />
                <YAxis stroke="#9CA3AF" fontSize={10} tick={{ fontSize: 10 }} width={30} />
                <Tooltip
                  labelFormatter={(value) => format(parseISO(value as string), 'd MMM', { locale: es })}
                  formatter={(value: number) => [value, 'Citas']}
                  contentStyle={{ borderRadius: '8px', border: '1px solid #E5E7EB', fontSize: '12px' }}
                />
                <Area
                  type="monotone"
                  dataKey="count"
                  stroke="#3B82F6"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#colorCitas)"
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[200px] sm:h-[250px] flex items-center justify-center text-gray-400 text-sm">
              No hay datos para mostrar
            </div>
          )}
        </div>

        {/* Grafico de ingresos diarios */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6">
          <h3 className="text-sm sm:text-lg font-semibold text-gray-900 mb-3 sm:mb-4">Ingresos por dia</h3>
          {stats?.charts.daily_revenue && stats.charts.daily_revenue.length > 0 ? (
            <ResponsiveContainer width="100%" height={200} className="sm:!h-[250px]">
              <BarChart data={stats.charts.daily_revenue}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                <XAxis
                  dataKey="date"
                  tickFormatter={(value) => format(parseISO(value), 'd', { locale: es })}
                  stroke="#9CA3AF"
                  fontSize={10}
                  tick={{ fontSize: 10 }}
                  interval="preserveStartEnd"
                />
                <YAxis
                  stroke="#9CA3AF"
                  fontSize={10}
                  tick={{ fontSize: 10 }}
                  width={35}
                  tickFormatter={(value) => `S/${value}`}
                />
                <Tooltip
                  labelFormatter={(value) => format(parseISO(value as string), 'd MMM', { locale: es })}
                  formatter={(value: number) => [`S/ ${value.toFixed(2)}`, 'Ingresos']}
                  contentStyle={{ borderRadius: '8px', border: '1px solid #E5E7EB', fontSize: '12px' }}
                />
                <Bar dataKey="amount" fill="#10B981" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[200px] sm:h-[250px] flex items-center justify-center text-gray-400 text-sm">
              No hay datos para mostrar
            </div>
          )}
        </div>
      </div>

      {/* Rankings */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        {/* Servicios populares */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6">
          <h3 className="text-sm sm:text-lg font-semibold text-gray-900 mb-3 sm:mb-4">Servicios mas populares</h3>
          {stats?.rankings.popular_services && stats.rankings.popular_services.length > 0 ? (
            <div className="space-y-2 sm:space-y-3">
              {stats.rankings.popular_services.map((service, index) => (
                <div key={service.id} className="flex items-center justify-between p-2 sm:p-3 bg-gray-50 rounded-lg">
                  <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
                    <span className={`w-6 h-6 sm:w-8 sm:h-8 rounded-full flex items-center justify-center text-white font-bold text-xs sm:text-sm flex-shrink-0 ${index === 0 ? 'bg-yellow-500' : index === 1 ? 'bg-gray-400' : index === 2 ? 'bg-orange-400' : 'bg-gray-300'}`}>
                      {index + 1}
                    </span>
                    <span className="font-medium text-gray-900 text-xs sm:text-sm truncate">{service.name}</span>
                  </div>
                  <div className="text-right flex-shrink-0 ml-2">
                    <p className="font-semibold text-gray-900 text-xs sm:text-sm">{service.count}</p>
                    <p className="text-[10px] sm:text-sm text-gray-500">S/{service.revenue.toFixed(0)}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-400 text-center py-6 sm:py-8 text-sm">No hay datos</p>
          )}
        </div>

        {/* Top profesionales */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6">
          <h3 className="text-sm sm:text-lg font-semibold text-gray-900 mb-3 sm:mb-4">Top profesionales</h3>
          {stats?.rankings.top_staff && stats.rankings.top_staff.length > 0 ? (
            <div className="space-y-2 sm:space-y-3">
              {stats.rankings.top_staff.map((staff, index) => (
                <div key={staff.id} className="flex items-center justify-between p-2 sm:p-3 bg-gray-50 rounded-lg">
                  <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
                    <span className={`w-6 h-6 sm:w-8 sm:h-8 rounded-full flex items-center justify-center text-white font-bold text-xs sm:text-sm flex-shrink-0 ${index === 0 ? 'bg-yellow-500' : index === 1 ? 'bg-gray-400' : index === 2 ? 'bg-orange-400' : 'bg-gray-300'}`}>
                      {index + 1}
                    </span>
                    <span className="font-medium text-gray-900 text-xs sm:text-sm truncate">{staff.name}</span>
                  </div>
                  <div className="text-right flex-shrink-0 ml-2">
                    <p className="font-semibold text-gray-900 text-xs sm:text-sm">{staff.appointments}</p>
                    <p className="text-[10px] sm:text-sm text-gray-500">S/{staff.revenue.toFixed(0)}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-400 text-center py-6 sm:py-8 text-sm">No hay datos</p>
          )}
        </div>
      </div>
    </div>
  )
}
