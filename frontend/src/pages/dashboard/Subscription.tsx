import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import {
  FileText,
  Users,
  Calendar,
  TrendingUp,
  AlertCircle,
  CheckCircle,
  Clock,
  ChevronRight,
  Zap,
  Gift,
  UserMinus,
} from 'lucide-react'
import subscriptionsApi, {
  SubscriptionSummary,
  InvoiceInfo,
  SubscriptionAlert,
  StaffSubscriptionInfo,
} from '@/api/subscriptions'
import { PaymentMethodList, InvoiceDetailModal } from '@/features/subscription'
import { Button } from '@/components/ui'
import toast from 'react-hot-toast'

const CULQI_PUBLIC_KEY = import.meta.env.VITE_CULQI_PUBLIC_KEY || ''

const statusColors: Record<string, { bg: string; text: string; icon: typeof CheckCircle }> = {
  trial: { bg: 'bg-blue-100', text: 'text-blue-800', icon: Clock },
  active: { bg: 'bg-green-100', text: 'text-green-800', icon: CheckCircle },
  past_due: { bg: 'bg-yellow-100', text: 'text-yellow-800', icon: AlertCircle },
  suspended: { bg: 'bg-red-100', text: 'text-red-800', icon: AlertCircle },
  cancelled: { bg: 'bg-gray-100', text: 'text-gray-800', icon: AlertCircle },
}

const invoiceStatusColors: Record<string, { bg: string; text: string }> = {
  pending: { bg: 'bg-yellow-100', text: 'text-yellow-800' },
  paid: { bg: 'bg-green-100', text: 'text-green-800' },
  failed: { bg: 'bg-red-100', text: 'text-red-800' },
  overdue: { bg: 'bg-red-100', text: 'text-red-800' },
  cancelled: { bg: 'bg-gray-100', text: 'text-gray-800' },
}

export default function Subscription() {
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<number | null>(null)
  const [showAllInvoices, setShowAllInvoices] = useState(false)
  const [activatingStaffId, setActivatingStaffId] = useState<number | null>(null)
  const queryClient = useQueryClient()

  const { data: summary, isLoading } = useQuery<SubscriptionSummary>({
    queryKey: ['subscription', 'summary'],
    queryFn: subscriptionsApi.getSummary,
  })

  const { data: alertsData } = useQuery<{ alerts: SubscriptionAlert[] }>({
    queryKey: ['subscription', 'alerts'],
    queryFn: subscriptionsApi.getAlerts,
  })

  const { data: allInvoices } = useQuery<InvoiceInfo[]>({
    queryKey: ['invoices'],
    queryFn: subscriptionsApi.getInvoices,
    enabled: showAllInvoices,
  })

  // Mutation para activar un profesional (sin cobro inmediato - mes vencido)
  const activateStaffMutation = useMutation({
    mutationFn: subscriptionsApi.activateStaff,
    onSuccess: (data) => {
      if (data.success) {
        toast.success(data.message || 'Profesional activado')
        queryClient.invalidateQueries({ queryKey: ['subscription'] })
      } else {
        toast.error(data.error || 'Error al activar')
      }
      setActivatingStaffId(null)
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Error al activar profesional')
      setActivatingStaffId(null)
    },
  })

  // Mutation para activar todos los profesionales (sin cobro inmediato)
  const activateAllMutation = useMutation({
    mutationFn: subscriptionsApi.activateAllStaff,
    onSuccess: (data) => {
      if (data.success) {
        toast.success(data.message || 'Profesionales activados')
        queryClient.invalidateQueries({ queryKey: ['subscription'] })
      } else {
        toast.error(data.error || 'Error al activar')
      }
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Error al activar profesionales')
    },
  })

  // Mutation para desactivar un profesional
  const deactivateStaffMutation = useMutation({
    mutationFn: subscriptionsApi.deactivateStaff,
    onSuccess: (data) => {
      if (data.success) {
        toast.success(data.message || 'Profesional desactivado')
        queryClient.invalidateQueries({ queryKey: ['subscription'] })
      } else {
        toast.error(data.error || 'Error al desactivar')
      }
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Error al desactivar profesional')
    },
  })

  // Función para verificar si un profesional tiene trial vencido
  const hasExpiredTrial = (staff: StaffSubscriptionInfo) => {
    return !staff.is_billable && staff.trial_days_remaining !== null && staff.trial_days_remaining <= 0
  }

  // Contar profesionales con trial vencido
  const expiredTrialCount = summary?.staff?.filter(hasExpiredTrial).length || 0

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    )
  }

  const alerts = alertsData?.alerts || []
  const StatusIcon = statusColors[summary?.status || 'trial']?.icon || Clock

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Suscripción</h1>
          <p className="text-gray-500">Gestiona tu plan, pagos y facturación</p>
        </div>
        {summary?.plan && (
          <div className="text-right">
            <p className="text-sm text-gray-500">Plan actual</p>
            <p className="text-lg font-semibold text-primary-600">{summary.plan.name}</p>
          </div>
        )}
      </div>

      {/* Alertas */}
      {alerts.length > 0 && (
        <div className="space-y-3">
          {alerts.map((alert, index) => (
            <div
              key={index}
              className={`p-4 rounded-xl border ${
                alert.severity === 'error'
                  ? 'bg-red-50 border-red-200'
                  : alert.severity === 'warning'
                  ? 'bg-yellow-50 border-yellow-200'
                  : 'bg-blue-50 border-blue-200'
              }`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div
                    className={`p-2 rounded-lg ${
                      alert.severity === 'error'
                        ? 'bg-red-100'
                        : alert.severity === 'warning'
                        ? 'bg-yellow-100'
                        : 'bg-blue-100'
                    }`}
                  >
                    <AlertCircle
                      className={`w-5 h-5 ${
                        alert.severity === 'error'
                          ? 'text-red-600'
                          : alert.severity === 'warning'
                          ? 'text-yellow-600'
                          : 'text-blue-600'
                      }`}
                    />
                  </div>
                  <div>
                    <h4 className="font-medium text-gray-900">{alert.title}</h4>
                    <p className="text-sm text-gray-600 mt-1">{alert.message}</p>
                  </div>
                </div>
                {alert.action && (
                  <Button size="sm">{alert.action_label}</Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Resumen de suscripción - Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Estado */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center gap-3 mb-3">
            <div className={`p-2 rounded-lg ${statusColors[summary?.status || 'trial']?.bg}`}>
              <StatusIcon className={`w-5 h-5 ${statusColors[summary?.status || 'trial']?.text}`} />
            </div>
            <p className="text-sm text-gray-500">Estado</p>
          </div>
          <span
            className={`inline-flex items-center px-3 py-1.5 rounded-full text-sm font-medium ${
              statusColors[summary?.status || 'trial']?.bg
            } ${statusColors[summary?.status || 'trial']?.text}`}
          >
            {summary?.status_display || 'Desconocido'}
          </span>
          {!summary?.can_receive_bookings && (
            <p className="text-xs text-red-600 mt-3 flex items-center gap-1">
              <AlertCircle className="w-3 h-3" />
              No puedes recibir reservas
            </p>
          )}
        </div>

        {/* Profesionales activos */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 rounded-lg bg-purple-100">
              <Users className="w-5 h-5 text-purple-600" />
            </div>
            <p className="text-sm text-gray-500">Profesionales</p>
          </div>
          <p className="text-3xl font-bold text-gray-900">{summary?.active_staff_count || 0}</p>
          <p className="text-sm text-gray-500 mt-1">
            {summary?.billable_staff_count || 0} facturables
          </p>
        </div>

        {/* Costo mensual */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 rounded-lg bg-emerald-100">
              <TrendingUp className="w-5 h-5 text-emerald-600" />
            </div>
            <p className="text-sm text-gray-500">Costo mensual</p>
          </div>
          <p className="text-3xl font-bold text-primary-600">
            S/ {summary?.monthly_cost || '0.00'}
          </p>
          {summary?.plan && (
            <p className="text-sm text-gray-500 mt-1">
              S/ {summary.plan.price_per_staff}/profesional
            </p>
          )}
        </div>

        {/* Próxima facturación */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 rounded-lg bg-orange-100">
              <Calendar className="w-5 h-5 text-orange-600" />
            </div>
            <p className="text-sm text-gray-500">Próxima facturación</p>
          </div>
          <p className="text-xl font-semibold text-gray-900">
            {summary?.next_billing_date
              ? format(parseISO(summary.next_billing_date), "d 'de' MMMM", { locale: es })
              : 'Sin fecha'}
          </p>
          {summary?.last_payment_date && (
            <p className="text-sm text-gray-500 mt-1">
              Último pago: {format(parseISO(summary.last_payment_date), 'd MMM', { locale: es })}
            </p>
          )}
        </div>
      </div>

      {/* Grid de dos columnas para contenido principal */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Métodos de pago */}
        <PaymentMethodList culqiPublicKey={CULQI_PUBLIC_KEY} />

        {/* Facturas */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <FileText className="w-5 h-5 text-gray-400" />
                Facturas
              </h3>
              <p className="text-sm text-gray-500">Historial de facturación</p>
            </div>
            {!showAllInvoices && (
              <Button variant="ghost" size="sm" onClick={() => setShowAllInvoices(true)}>
                Ver todas
              </Button>
            )}
          </div>

          {/* Lista de facturas pendientes o todas */}
          {(() => {
            const invoicesToShow = showAllInvoices
              ? allInvoices || []
              : summary?.pending_invoices || []

            if (invoicesToShow.length === 0) {
              return (
                <div className="text-center py-8 bg-gray-50 rounded-xl">
                  <FileText className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-500">
                    {showAllInvoices ? 'No hay facturas' : 'No hay facturas pendientes'}
                  </p>
                </div>
              )
            }

            return (
              <div className="space-y-3">
                {invoicesToShow.slice(0, showAllInvoices ? 10 : 5).map((invoice) => (
                  <InvoiceCard
                    key={invoice.id}
                    invoice={invoice}
                    onClick={() => setSelectedInvoiceId(invoice.id)}
                  />
                ))}
              </div>
            )
          })()}
        </div>
      </div>

      {/* Banner de cortesía activa */}
      {summary?.is_courtesy_active && (
        <div className="bg-purple-50 border border-purple-200 rounded-xl p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-purple-100">
              <Gift className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <h4 className="font-medium text-purple-900">Acceso Cortesía Activo</h4>
              <p className="text-sm text-purple-700">
                {summary.courtesy_reason || 'Puedes activar profesionales sin cargo'}
                {summary.courtesy_until && (
                  <> · Válido hasta {format(parseISO(summary.courtesy_until), "d 'de' MMMM yyyy", { locale: es })}</>
                )}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Banner de profesionales pendientes de activar */}
      {expiredTrialCount > 0 && (
        <div className="bg-orange-50 border border-orange-200 rounded-xl p-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-orange-100">
                <AlertCircle className="w-5 h-5 text-orange-600" />
              </div>
              <div>
                <h4 className="font-medium text-orange-900">
                  {expiredTrialCount} profesional{expiredTrialCount > 1 ? 'es' : ''} con trial vencido
                </h4>
                <p className="text-sm text-orange-700">
                  Activa los profesionales para que puedan recibir reservas
                </p>
              </div>
            </div>
            <Button
              onClick={() => activateAllMutation.mutate()}
              disabled={activateAllMutation.isPending}
              className="bg-orange-600 hover:bg-orange-700"
            >
              <Zap className="w-4 h-4 mr-2" />
              {activateAllMutation.isPending ? 'Activando...' : `Activar ${expiredTrialCount > 1 ? 'todos' : ''}`}
            </Button>
          </div>
        </div>
      )}

      {/* Profesionales en el plan */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <Users className="w-5 h-5 text-gray-400" />
          Profesionales en el plan
        </h3>
        {summary?.staff && summary.staff.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left text-sm text-gray-500 border-b">
                  <th className="pb-3 font-medium">Profesional</th>
                  <th className="pb-3 font-medium">Estado</th>
                  <th className="pb-3 font-medium">Trial</th>
                  <th className="pb-3 font-medium">Agregado</th>
                  <th className="pb-3 font-medium"></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {summary.staff.map((staffSub) => {
                  const isExpired = hasExpiredTrial(staffSub)
                  const isActivating = activatingStaffId === staffSub.id

                  return (
                    <tr key={staffSub.id} className={`text-sm ${isExpired ? 'bg-orange-50' : ''}`}>
                      <td className="py-4">
                        <div className="flex items-center gap-3">
                          {staffSub.staff_photo ? (
                            <img
                              src={staffSub.staff_photo}
                              alt=""
                              className="w-10 h-10 rounded-full object-cover"
                            />
                          ) : (
                            <div className="w-10 h-10 rounded-full bg-primary-100 flex items-center justify-center text-primary-600 font-semibold">
                              {staffSub.staff_name?.charAt(0) || '?'}
                            </div>
                          )}
                          <span className="font-medium text-gray-900">
                            {staffSub.staff_name || 'Sin nombre'}
                          </span>
                        </div>
                      </td>
                      <td className="py-4">
                        {staffSub.is_billable ? (
                          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                            <CheckCircle className="w-3 h-3 mr-1" />
                            Activo
                          </span>
                        ) : isExpired ? (
                          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-orange-100 text-orange-800">
                            <AlertCircle className="w-3 h-3 mr-1" />
                            Trial vencido
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                            <Clock className="w-3 h-3 mr-1" />
                            En trial
                          </span>
                        )}
                      </td>
                      <td className="py-4">
                        {staffSub.is_billable ? (
                          <span className="text-gray-400">-</span>
                        ) : isExpired ? (
                          <span className="font-medium text-orange-600">Vencido</span>
                        ) : staffSub.trial_days_remaining !== null ? (
                          <span
                            className={`font-medium ${
                              staffSub.trial_days_remaining <= 3 ? 'text-orange-600' : 'text-gray-600'
                            }`}
                          >
                            {staffSub.trial_days_remaining} días
                          </span>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                      <td className="py-4 text-gray-500">
                        {format(parseISO(staffSub.added_at), "d MMM yyyy", { locale: es })}
                      </td>
                      <td className="py-4 text-right">
                        {isExpired ? (
                          <Button
                            size="sm"
                            onClick={() => {
                              setActivatingStaffId(staffSub.id)
                              activateStaffMutation.mutate(staffSub.id)
                            }}
                            disabled={isActivating || activateStaffMutation.isPending}
                            className="bg-orange-600 hover:bg-orange-700"
                          >
                            <Zap className="w-3 h-3 mr-1" />
                            {isActivating ? 'Activando...' : 'Activar'}
                          </Button>
                        ) : staffSub.is_billable && staffSub.is_active ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              if (confirm(`¿Desactivar a ${staffSub.staff_name}? Solo se facturarán los días que estuvo activo.`)) {
                                deactivateStaffMutation.mutate(staffSub.id)
                              }
                            }}
                            disabled={deactivateStaffMutation.isPending}
                            className="text-gray-500 hover:text-red-600 hover:bg-red-50"
                          >
                            <UserMinus className="w-3 h-3 mr-1" />
                            Desactivar
                          </Button>
                        ) : null}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-8 bg-gray-50 rounded-xl">
            <Users className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">No hay profesionales registrados</p>
          </div>
        )}
      </div>

      {/* Modal de detalle de factura */}
      <InvoiceDetailModal
        invoiceId={selectedInvoiceId}
        isOpen={selectedInvoiceId !== null}
        onClose={() => setSelectedInvoiceId(null)}
      />
    </div>
  )
}

interface InvoiceCardProps {
  invoice: InvoiceInfo
  onClick: () => void
}

function InvoiceCard({ invoice, onClick }: InvoiceCardProps) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center justify-between p-4 bg-gray-50 hover:bg-gray-100 rounded-xl transition-colors text-left"
    >
      <div className="flex items-center gap-4">
        <div
          className={`w-10 h-10 rounded-lg flex items-center justify-center ${
            invoice.status === 'paid'
              ? 'bg-green-100'
              : invoice.status === 'pending'
              ? 'bg-yellow-100'
              : 'bg-red-100'
          }`}
        >
          {invoice.status === 'paid' ? (
            <CheckCircle className="w-5 h-5 text-green-600" />
          ) : invoice.status === 'pending' ? (
            <Clock className="w-5 h-5 text-yellow-600" />
          ) : (
            <AlertCircle className="w-5 h-5 text-red-600" />
          )}
        </div>
        <div>
          <p className="font-medium text-gray-900">{invoice.period}</p>
          <p className="text-sm text-gray-500">
            {invoice.staff_count} profesional{invoice.staff_count !== 1 ? 'es' : ''}
            {invoice.status === 'pending' && (
              <> · Vence: {format(parseISO(invoice.due_date), 'd MMM', { locale: es })}</>
            )}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-4">
        <div className="text-right">
          <p className="text-lg font-bold text-gray-900">S/ {invoice.total}</p>
          <span
            className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
              invoiceStatusColors[invoice.status]?.bg
            } ${invoiceStatusColors[invoice.status]?.text}`}
          >
            {invoice.status_display}
          </span>
        </div>
        <ChevronRight className="w-5 h-5 text-gray-400" />
      </div>
    </button>
  )
}
