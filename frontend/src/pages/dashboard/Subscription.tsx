import { useQuery } from '@tanstack/react-query'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import subscriptionsApi, {
  SubscriptionSummary,
  InvoiceInfo,
  SubscriptionAlert,
} from '@/api/subscriptions'

const statusColors: Record<string, { bg: string; text: string }> = {
  trial: { bg: 'bg-blue-100', text: 'text-blue-800' },
  active: { bg: 'bg-green-100', text: 'text-green-800' },
  past_due: { bg: 'bg-yellow-100', text: 'text-yellow-800' },
  suspended: { bg: 'bg-red-100', text: 'text-red-800' },
  cancelled: { bg: 'bg-gray-100', text: 'text-gray-800' },
}

const invoiceStatusColors: Record<string, { bg: string; text: string }> = {
  pending: { bg: 'bg-yellow-100', text: 'text-yellow-800' },
  paid: { bg: 'bg-green-100', text: 'text-green-800' },
  overdue: { bg: 'bg-red-100', text: 'text-red-800' },
  cancelled: { bg: 'bg-gray-100', text: 'text-gray-800' },
}

export default function Subscription() {
  const { data: summary, isLoading } = useQuery<SubscriptionSummary>({
    queryKey: ['subscription', 'summary'],
    queryFn: subscriptionsApi.getSummary,
  })

  const { data: alertsData } = useQuery<{ alerts: SubscriptionAlert[] }>({
    queryKey: ['subscription', 'alerts'],
    queryFn: subscriptionsApi.getAlerts,
  })

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    )
  }

  const alerts = alertsData?.alerts || []

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Suscripcion</h1>
        <p className="text-gray-500">Gestiona tu plan y facturacion</p>
      </div>

      {/* Alertas */}
      {alerts.length > 0 && (
        <div className="space-y-3">
          {alerts.map((alert, index) => (
            <div
              key={index}
              className={`p-4 rounded-lg border ${
                alert.severity === 'error'
                  ? 'bg-red-50 border-red-200'
                  : alert.severity === 'warning'
                  ? 'bg-yellow-50 border-yellow-200'
                  : 'bg-blue-50 border-blue-200'
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3">
                  <span className="text-xl">
                    {alert.severity === 'error' ? '!' : alert.severity === 'warning' ? '!' : 'i'}
                  </span>
                  <div>
                    <h4 className="font-medium text-gray-900">{alert.title}</h4>
                    <p className="text-sm text-gray-600 mt-1">{alert.message}</p>
                  </div>
                </div>
                {alert.action && (
                  <button className="px-4 py-2 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 transition-colors">
                    {alert.action_label}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Resumen de suscripcion */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Estado */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <p className="text-sm text-gray-500 mb-2">Estado</p>
          <span
            className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${
              statusColors[summary?.status || 'trial']?.bg
            } ${statusColors[summary?.status || 'trial']?.text}`}
          >
            {summary?.status_display || 'Desconocido'}
          </span>
          {!summary?.can_receive_bookings && (
            <p className="text-xs text-red-600 mt-2">No puedes recibir reservas</p>
          )}
        </div>

        {/* Profesionales activos */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <p className="text-sm text-gray-500 mb-2">Profesionales activos</p>
          <p className="text-3xl font-bold text-gray-900">{summary?.active_staff_count || 0}</p>
          <p className="text-xs text-gray-500 mt-1">
            {summary?.billable_staff_count || 0} facturables
          </p>
        </div>

        {/* Costo mensual */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <p className="text-sm text-gray-500 mb-2">Costo mensual</p>
          <p className="text-3xl font-bold text-primary-600">
            S/ {summary?.monthly_cost || '0.00'}
          </p>
          {summary?.plan && (
            <p className="text-xs text-gray-500 mt-1">
              S/ {summary.plan.price_per_staff} por profesional
            </p>
          )}
        </div>

        {/* Proxima facturacion */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <p className="text-sm text-gray-500 mb-2">Proxima facturacion</p>
          <p className="text-xl font-semibold text-gray-900">
            {summary?.next_billing_date
              ? format(parseISO(summary.next_billing_date), 'd MMM yyyy', { locale: es })
              : 'Sin fecha'}
          </p>
          {summary?.last_payment_date && (
            <p className="text-xs text-gray-500 mt-1">
              Ultimo pago: {format(parseISO(summary.last_payment_date), 'd MMM', { locale: es })}
            </p>
          )}
        </div>
      </div>

      {/* Profesionales en el plan */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Profesionales en el plan</h3>
        {summary?.staff && summary.staff.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left text-sm text-gray-500 border-b">
                  <th className="pb-3 font-medium">Profesional</th>
                  <th className="pb-3 font-medium">Estado</th>
                  <th className="pb-3 font-medium">Trial</th>
                  <th className="pb-3 font-medium">Agregado</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {summary.staff.map((staffSub) => (
                  <tr key={staffSub.id} className="text-sm">
                    <td className="py-3">
                      <div className="flex items-center gap-3">
                        {staffSub.staff_photo ? (
                          <img
                            src={staffSub.staff_photo}
                            alt=""
                            className="w-8 h-8 rounded-full object-cover"
                          />
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-gray-500">
                            {staffSub.staff_name?.charAt(0) || '?'}
                          </div>
                        )}
                        <span className="font-medium text-gray-900">{staffSub.staff_name || 'Sin nombre'}</span>
                      </div>
                    </td>
                    <td className="py-3">
                      {staffSub.is_billable ? (
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                          Facturable
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                          En trial
                        </span>
                      )}
                    </td>
                    <td className="py-3">
                      {staffSub.trial_days_remaining !== null ? (
                        <span
                          className={`font-medium ${
                            staffSub.trial_days_remaining <= 3 ? 'text-orange-600' : 'text-gray-600'
                          }`}
                        >
                          {staffSub.trial_days_remaining} dias restantes
                        </span>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>
                    <td className="py-3 text-gray-500">
                      {format(parseISO(staffSub.added_at), 'd MMM yyyy', { locale: es })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-gray-500 text-center py-8">No hay profesionales registrados</p>
        )}
      </div>

      {/* Facturas pendientes */}
      {summary?.pending_invoices && summary.pending_invoices.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Facturas pendientes</h3>
          <div className="space-y-3">
            {summary.pending_invoices.map((invoice) => (
              <InvoiceCard key={invoice.id} invoice={invoice} />
            ))}
          </div>
        </div>
      )}

      {/* Historial de facturas - Link */}
      <div className="text-center">
        <button className="text-primary-600 hover:text-primary-700 font-medium">
          Ver historial completo de facturas
        </button>
      </div>
    </div>
  )
}

function InvoiceCard({ invoice }: { invoice: InvoiceInfo }) {
  return (
    <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
      <div>
        <p className="font-medium text-gray-900">{invoice.period}</p>
        <p className="text-sm text-gray-500">
          {invoice.staff_count} profesional{invoice.staff_count !== 1 ? 'es' : ''} - Vence:{' '}
          {format(parseISO(invoice.due_date), 'd MMM', { locale: es })}
        </p>
      </div>
      <div className="flex items-center gap-4">
        <div className="text-right">
          <p className="text-lg font-bold text-gray-900">
            {invoice.currency} {invoice.total}
          </p>
          <span
            className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
              invoiceStatusColors[invoice.status]?.bg
            } ${invoiceStatusColors[invoice.status]?.text}`}
          >
            {invoice.status_display}
          </span>
        </div>
        {invoice.status === 'pending' && (
          <button className="px-4 py-2 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 transition-colors">
            Pagar
          </button>
        )}
      </div>
    </div>
  )
}
