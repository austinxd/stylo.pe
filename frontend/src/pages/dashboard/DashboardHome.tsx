import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Navigate } from 'react-router-dom'
import { format, parseISO, subMonths, addMonths } from 'date-fns'
import { es } from 'date-fns/locale'
import {
  Calendar,
  TrendingDown,
  TrendingUp,
  Wallet,
  Receipt,
  Users,
  Trophy,
  BarChart3,
  Minus,
} from 'lucide-react'
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

import apiClient from '@/api/client'
import { useAuthStore } from '@/store/authStore'
import { EmptyState, Skeleton } from '@/components/ui'

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

  const { data: onboardingStatus, isLoading: checkingOnboarding } = useQuery({
    queryKey: ['dashboard', 'onboarding-status'],
    queryFn: async () => {
      const response = await apiClient.get<OnboardingStatus>('/dashboard/onboarding/')
      return response.data
    },
    enabled: user?.role === 'business_owner',
  })

  const { data: stats, isLoading } = useQuery<DashboardStats>({
    queryKey: ['dashboard', 'stats', selectedMonth],
    queryFn: async () => {
      const response = await apiClient.get(`/dashboard/stats/?month=${selectedMonth}`)
      return response.data
    },
    enabled: !onboardingStatus?.needs_onboarding,
  })

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

  if (user?.role === 'business_owner' && onboardingStatus?.needs_onboarding) {
    return <Navigate to="/dashboard/onboarding" replace />
  }

  if (isLoading || checkingOnboarding) {
    return <DashboardSkeleton />
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
        <div>
          <h1 className="text-2xl sm:text-display-sm font-display text-neutral-900">
            Panel de control
          </h1>
          <p className="text-sm text-neutral-500">
            Estadísticas y métricas de tu negocio
          </p>
        </div>
        <label className="flex items-center gap-2">
          <span className="sr-only">Mes</span>
          <select
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="input capitalize w-full sm:w-auto"
          >
            {monthOptions.map((option) => (
              <option key={option.value} value={option.value} className="capitalize">
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </header>

      {/* KPIs principales */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <KpiCard
          label="Citas totales"
          value={stats?.overview.total_appointments ?? 0}
          icon={Calendar}
          change={stats?.comparison.appointments_change}
        />
        <KpiCard
          label="Ingresos"
          value={`S/ ${(stats?.overview.revenue || 0).toLocaleString('es-PE', { maximumFractionDigits: 0 })}`}
          icon={Wallet}
          change={stats?.comparison.revenue_change}
          accent
        />
        <KpiCard
          label="Ticket promedio"
          value={`S/ ${(stats?.overview.avg_ticket || 0).toFixed(0)}`}
          icon={Receipt}
          hint="por cita"
        />
        <KpiCard
          label="Clientes nuevos"
          value={stats?.overview.new_clients ?? 0}
          icon={Users}
          hint="este mes"
        />
      </div>

      {/* Métricas de eficiencia */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
        <EfficiencyCard
          label="Completitud"
          rate={stats?.efficiency.completion_rate || 0}
          subtitle={`${stats?.overview.completed_appointments ?? 0}/${stats?.overview.total_appointments ?? 0} completadas`}
          tone="success"
          thresholds={[80, 60]}
        />
        <EfficiencyCard
          label="Cancelación"
          rate={stats?.efficiency.cancellation_rate || 0}
          subtitle={`${stats?.overview.cancelled_appointments ?? 0} canceladas`}
          tone="error"
          thresholds={[10, 20]}
          inverted
        />
        <EfficiencyCard
          label="No show"
          rate={stats?.efficiency.no_show_rate || 0}
          subtitle={`${stats?.overview.no_shows ?? 0} no asistieron`}
          tone="accent"
          thresholds={[5, 10]}
          inverted
        />
      </div>

      {/* Gráficos */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        <ChartCard title="Citas por día">
          {stats?.charts.daily_appointments && stats.charts.daily_appointments.length > 0 ? (
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={stats.charts.daily_appointments}>
                <defs>
                  <linearGradient id="colorCitas" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#1a1a1a" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#1a1a1a" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
                <XAxis
                  dataKey="date"
                  tickFormatter={(value) => format(parseISO(value), 'd', { locale: es })}
                  stroke="#a3a3a3"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis stroke="#a3a3a3" fontSize={11} tickLine={false} axisLine={false} width={30} />
                <Tooltip
                  labelFormatter={(value) => format(parseISO(value as string), 'd MMM', { locale: es })}
                  formatter={(value: number) => [value, 'Citas']}
                  contentStyle={{
                    borderRadius: '12px',
                    border: '1px solid #e5e5e5',
                    fontSize: '12px',
                    boxShadow: '0 2px 15px -3px rgba(0,0,0,0.07)',
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="count"
                  stroke="#1a1a1a"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#colorCitas)"
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState
              icon={BarChart3}
              title="Sin datos este mes"
              description="Las citas aparecerán aquí cuando empieces a recibirlas."
              tone="subtle"
            />
          )}
        </ChartCard>

        <ChartCard title="Ingresos por día">
          {stats?.charts.daily_revenue && stats.charts.daily_revenue.length > 0 ? (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={stats.charts.daily_revenue}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
                <XAxis
                  dataKey="date"
                  tickFormatter={(value) => format(parseISO(value), 'd', { locale: es })}
                  stroke="#a3a3a3"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  stroke="#a3a3a3"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                  width={40}
                  tickFormatter={(value) => `S/${value}`}
                />
                <Tooltip
                  labelFormatter={(value) => format(parseISO(value as string), 'd MMM', { locale: es })}
                  formatter={(value: number) => [`S/ ${value.toFixed(2)}`, 'Ingresos']}
                  contentStyle={{
                    borderRadius: '12px',
                    border: '1px solid #e5e5e5',
                    fontSize: '12px',
                    boxShadow: '0 2px 15px -3px rgba(0,0,0,0.07)',
                  }}
                />
                <Bar dataKey="amount" fill="#b8936a" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState
              icon={Wallet}
              title="Sin ingresos este mes"
              description="Verás aquí el detalle diario cuando se generen pagos."
              tone="subtle"
            />
          )}
        </ChartCard>
      </div>

      {/* Rankings */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        <RankingCard
          title="Servicios más populares"
          items={
            stats?.rankings.popular_services.map((s) => ({
              id: s.id,
              name: s.name,
              metric: s.count.toString(),
              subtitle: `S/ ${s.revenue.toFixed(0)}`,
            })) ?? []
          }
        />
        <RankingCard
          title="Top profesionales"
          items={
            stats?.rankings.top_staff.map((s) => ({
              id: s.id,
              name: s.name,
              metric: s.appointments.toString(),
              subtitle: `S/ ${s.revenue.toFixed(0)}`,
            })) ?? []
          }
        />
      </div>
    </div>
  )
}

// === Subcomponentes ===

function KpiCard({
  label,
  value,
  icon: Icon,
  change,
  hint,
  accent = false,
}: {
  label: string
  value: string | number
  icon: typeof Calendar
  change?: number
  hint?: string
  accent?: boolean
}) {
  return (
    <div className="card !p-4 sm:!p-6">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs sm:text-sm text-neutral-500">{label}</p>
        <Icon className="w-4 h-4 sm:w-5 sm:h-5 text-neutral-400" aria-hidden="true" />
      </div>
      <p
        className={`text-xl sm:text-3xl font-semibold ${
          accent ? 'text-accent-700' : 'text-neutral-900'
        }`}
      >
        {value}
      </p>
      <div className="hidden sm:block mt-1">
        {typeof change === 'number' ? (
          <ChangeIndicator change={change} />
        ) : hint ? (
          <span className="text-xs text-neutral-500">{hint}</span>
        ) : null}
      </div>
    </div>
  )
}

function ChangeIndicator({ change }: { change: number }) {
  if (change === 0) {
    return (
      <span className="text-xs text-neutral-500 inline-flex items-center gap-1">
        <Minus className="w-3 h-3" aria-hidden="true" />
        Sin cambios
      </span>
    )
  }
  const isPositive = change > 0
  const Icon = isPositive ? TrendingUp : TrendingDown
  return (
    <span
      className={`text-xs font-medium inline-flex items-center gap-1 ${
        isPositive ? 'text-success-700' : 'text-error-600'
      }`}
    >
      <Icon className="w-3 h-3" aria-hidden="true" />
      {isPositive ? '+' : ''}
      {change.toFixed(1)}% vs mes anterior
    </span>
  )
}

function EfficiencyCard({
  label,
  rate,
  subtitle,
  tone,
  thresholds,
  inverted = false,
}: {
  label: string
  rate: number
  subtitle: string
  tone: 'success' | 'error' | 'accent'
  thresholds: [number, number]
  inverted?: boolean
}) {
  // Inverted: menor es mejor (cancelación, no-show)
  const [good, neutral] = thresholds
  let color: 'success' | 'accent' | 'error'
  if (inverted) {
    color = rate <= good ? 'success' : rate <= neutral ? 'accent' : 'error'
  } else {
    color = rate >= good ? 'success' : rate >= neutral ? 'accent' : 'error'
  }

  const colorMap = {
    success: 'bg-success-500',
    accent: 'bg-accent-500',
    error: 'bg-error-500',
  }
  const textMap = {
    success: 'text-success-700',
    accent: 'text-accent-700',
    error: 'text-error-700',
  }

  return (
    <div className="card !p-4 sm:!p-6">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs sm:text-sm font-medium text-neutral-700">{label}</p>
        <span className={`text-sm font-bold ${textMap[color]}`}>{rate}%</span>
      </div>
      <div
        className="w-full bg-neutral-100 rounded-full h-2 overflow-hidden"
        role="progressbar"
        aria-valuenow={rate}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${label}: ${rate}%`}
      >
        <div
          className={`h-2 rounded-full transition-all duration-500 ${colorMap[color]}`}
          style={{ width: `${Math.min(rate, 100)}%` }}
        />
      </div>
      <p className="mt-2 text-xs text-neutral-500">{subtitle}</p>
      {/* Tone se mantiene para extensión futura */}
      <span className="sr-only">{tone}</span>
    </div>
  )
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card !p-4 sm:!p-6">
      <h3 className="text-base font-semibold text-neutral-900 mb-4">{title}</h3>
      {children}
    </div>
  )
}

function RankingCard({
  title,
  items,
}: {
  title: string
  items: { id: number; name: string; metric: string; subtitle: string }[]
}) {
  return (
    <div className="card !p-4 sm:!p-6">
      <div className="flex items-center gap-2 mb-4">
        <Trophy className="w-4 h-4 text-accent-600" aria-hidden="true" />
        <h3 className="text-base font-semibold text-neutral-900">{title}</h3>
      </div>
      {items.length > 0 ? (
        <ol className="space-y-2">
          {items.map((item, index) => {
            const medalColor =
              index === 0
                ? 'bg-accent-500'
                : index === 1
                  ? 'bg-neutral-400'
                  : index === 2
                    ? 'bg-accent-700'
                    : 'bg-neutral-300'
            return (
              <li
                key={item.id}
                className="flex items-center justify-between p-3 bg-neutral-50 rounded-xl"
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <span
                    className={`w-7 h-7 rounded-full flex items-center justify-center text-white font-bold text-xs flex-shrink-0 ${medalColor}`}
                    aria-hidden="true"
                  >
                    {index + 1}
                  </span>
                  <span className="font-medium text-neutral-900 text-sm truncate">
                    {item.name}
                  </span>
                </div>
                <div className="text-right flex-shrink-0 ml-2">
                  <p className="font-semibold text-neutral-900 text-sm">{item.metric}</p>
                  <p className="text-xs text-neutral-500">{item.subtitle}</p>
                </div>
              </li>
            )
          })}
        </ol>
      ) : (
        <EmptyState title="Sin datos" tone="subtle" />
      )}
    </div>
  )
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-10 w-40" />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-28" variant="card" />
        ))}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-24" variant="card" />
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Skeleton className="h-72" variant="card" />
        <Skeleton className="h-72" variant="card" />
      </div>
    </div>
  )
}
