/**
 * Modal que muestra el detalle de una factura con line items y pagos.
 */
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import {
  X,
  FileText,
  User,
  CreditCard,
  CheckCircle,
  AlertCircle,
  Clock,
  Loader2,
} from 'lucide-react'
import { clsx } from 'clsx'

import { Button } from '../../components/ui'
import { subscriptionsApi } from '../../api/subscriptions'

interface InvoiceDetailModalProps {
  invoiceId: number | null
  isOpen: boolean
  onClose: () => void
}

const statusConfig = {
  pending: {
    label: 'Pendiente',
    color: 'bg-yellow-100 text-yellow-800',
    icon: Clock,
  },
  paid: {
    label: 'Pagada',
    color: 'bg-green-100 text-green-800',
    icon: CheckCircle,
  },
  failed: {
    label: 'Fallida',
    color: 'bg-red-100 text-red-800',
    icon: AlertCircle,
  },
  overdue: {
    label: 'Vencida',
    color: 'bg-red-100 text-red-800',
    icon: AlertCircle,
  },
  cancelled: {
    label: 'Cancelada',
    color: 'bg-neutral-100 text-neutral-800',
    icon: X,
  },
}

export function InvoiceDetailModal({
  invoiceId,
  isOpen,
  onClose,
}: InvoiceDetailModalProps) {
  const [payingWithMethodId, setPayingWithMethodId] = useState<number | null>(
    null
  )
  const queryClient = useQueryClient()

  // Query para obtener detalle de factura
  const {
    data: invoice,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['invoiceDetail', invoiceId],
    queryFn: () => subscriptionsApi.getInvoiceDetail(invoiceId!),
    enabled: isOpen && invoiceId !== null,
  })

  // Query para obtener métodos de pago
  const { data: paymentMethods = [] } = useQuery({
    queryKey: ['paymentMethods'],
    queryFn: subscriptionsApi.getPaymentMethods,
    enabled: isOpen && invoice?.status === 'pending',
  })

  // Mutation para pagar factura
  const payMutation = useMutation({
    mutationFn: ({
      invoiceId,
      methodId,
    }: {
      invoiceId: number
      methodId?: number
    }) => subscriptionsApi.payInvoice(invoiceId, methodId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoiceDetail', invoiceId] })
      queryClient.invalidateQueries({ queryKey: ['subscriptionSummary'] })
      queryClient.invalidateQueries({ queryKey: ['invoices'] })
      setPayingWithMethodId(null)
    },
    onError: () => {
      setPayingWithMethodId(null)
    },
  })

  const handlePay = (methodId?: number) => {
    if (!invoiceId) return
    setPayingWithMethodId(methodId || -1)
    payMutation.mutate({ invoiceId, methodId })
  }

  if (!isOpen) return null

  const status = invoice?.status ? statusConfig[invoice.status] : null
  const StatusIcon = status?.icon || Clock

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Overlay */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-hidden animate-fade-in-up">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-neutral-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary-100 flex items-center justify-center">
              <FileText className="w-5 h-5 text-primary-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-primary-900">
                Factura #{invoiceId}
              </h2>
              {invoice && (
                <p className="text-sm text-neutral-500">
                  Período: {invoice.period}
                </p>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-neutral-100 text-neutral-500 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-180px)]">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-primary-500" />
            </div>
          ) : error ? (
            <div className="text-center py-12">
              <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
              <p className="text-neutral-600">Error al cargar la factura</p>
            </div>
          ) : invoice ? (
            <div className="space-y-6">
              {/* Estado y total */}
              <div className="flex items-center justify-between bg-neutral-50 rounded-xl p-4">
                <div className="flex items-center gap-3">
                  <StatusIcon
                    className={clsx(
                      'w-5 h-5',
                      invoice.status === 'paid'
                        ? 'text-green-600'
                        : invoice.status === 'pending'
                        ? 'text-yellow-600'
                        : 'text-red-600'
                    )}
                  />
                  <span
                    className={clsx(
                      'px-3 py-1 rounded-full text-sm font-medium',
                      status?.color
                    )}
                  >
                    {status?.label}
                  </span>
                </div>
                <div className="text-right">
                  <p className="text-sm text-neutral-500">Total</p>
                  <p className="text-2xl font-bold text-primary-900">
                    S/ {invoice.total}
                  </p>
                </div>
              </div>

              {/* Info general */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-neutral-50 rounded-xl p-4">
                  <p className="text-sm text-neutral-500 mb-1">
                    Fecha de emisión
                  </p>
                  <p className="font-medium text-primary-900">
                    {format(new Date(invoice.created_at), "d 'de' MMMM, yyyy", {
                      locale: es,
                    })}
                  </p>
                </div>
                <div className="bg-neutral-50 rounded-xl p-4">
                  <p className="text-sm text-neutral-500 mb-1">
                    Fecha de vencimiento
                  </p>
                  <p className="font-medium text-primary-900">
                    {format(new Date(invoice.due_date), "d 'de' MMMM, yyyy", {
                      locale: es,
                    })}
                  </p>
                </div>
              </div>

              {/* Line items */}
              <div>
                <h3 className="font-semibold text-primary-900 mb-4 flex items-center gap-2">
                  <User className="w-4 h-4" />
                  Detalle por profesional
                </h3>
                <div className="bg-neutral-50 rounded-xl overflow-hidden">
                  <table className="w-full">
                    <thead className="bg-neutral-100">
                      <tr>
                        <th className="text-left text-xs font-medium text-neutral-500 uppercase px-4 py-3">
                          Profesional
                        </th>
                        <th className="text-center text-xs font-medium text-neutral-500 uppercase px-4 py-3">
                          Días
                        </th>
                        <th className="text-right text-xs font-medium text-neutral-500 uppercase px-4 py-3">
                          Subtotal
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-100">
                      {invoice.line_items.map((item) => (
                        <tr key={item.id}>
                          <td className="px-4 py-3">
                            <p className="font-medium text-primary-900">
                              {item.staff_name}
                            </p>
                            <p className="text-xs text-neutral-500">
                              {item.days_active} de {item.days_in_period} días
                            </p>
                          </td>
                          <td className="text-center px-4 py-3">
                            <span className="px-2 py-1 bg-white rounded-lg text-sm">
                              {item.days_active}
                            </span>
                          </td>
                          <td className="text-right px-4 py-3 font-medium">
                            S/ {item.subtotal}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-neutral-100">
                      <tr>
                        <td colSpan={2} className="text-right px-4 py-3 font-semibold">
                          Total:
                        </td>
                        <td className="text-right px-4 py-3 font-bold text-lg">
                          S/ {invoice.total}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>

              {/* Historial de pagos */}
              {invoice.payments.length > 0 && (
                <div>
                  <h3 className="font-semibold text-primary-900 mb-4 flex items-center gap-2">
                    <CreditCard className="w-4 h-4" />
                    Historial de pagos
                  </h3>
                  <div className="space-y-2">
                    {invoice.payments.map((payment) => (
                      <div
                        key={payment.id}
                        className={clsx(
                          'flex items-center justify-between p-3 rounded-lg',
                          payment.status === 'succeeded'
                            ? 'bg-green-50'
                            : payment.status === 'failed'
                            ? 'bg-red-50'
                            : 'bg-neutral-50'
                        )}
                      >
                        <div className="flex items-center gap-3">
                          {payment.status === 'succeeded' ? (
                            <CheckCircle className="w-5 h-5 text-green-600" />
                          ) : payment.status === 'failed' ? (
                            <AlertCircle className="w-5 h-5 text-red-600" />
                          ) : (
                            <Clock className="w-5 h-5 text-yellow-600" />
                          )}
                          <div>
                            <p className="text-sm font-medium">
                              {payment.status_display}
                            </p>
                            {payment.payment_method_display && (
                              <p className="text-xs text-neutral-500">
                                {payment.payment_method_display}
                              </p>
                            )}
                            {payment.error_message && (
                              <p className="text-xs text-red-600">
                                {payment.error_message}
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="font-medium">S/ {payment.amount}</p>
                          {payment.processed_at && (
                            <p className="text-xs text-neutral-500">
                              {format(
                                new Date(payment.processed_at),
                                "d MMM, HH:mm",
                                { locale: es }
                              )}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Acción de pago */}
              {invoice.status === 'pending' && (
                <div className="bg-yellow-50 rounded-xl p-4">
                  <h3 className="font-semibold text-yellow-800 mb-3 flex items-center gap-2">
                    <CreditCard className="w-4 h-4" />
                    Realizar pago
                  </h3>

                  {paymentMethods.length === 0 ? (
                    <p className="text-sm text-yellow-700">
                      No tienes métodos de pago configurados. Agrega una tarjeta
                      para poder pagar esta factura.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {paymentMethods.map((method) => (
                        <button
                          key={method.id}
                          onClick={() => handlePay(method.id)}
                          disabled={payMutation.isPending}
                          className={clsx(
                            'w-full flex items-center justify-between p-3 rounded-lg border-2 transition-all',
                            method.is_default
                              ? 'border-primary-500 bg-white'
                              : 'border-transparent bg-white/50 hover:bg-white hover:border-neutral-200'
                          )}
                        >
                          <div className="flex items-center gap-3">
                            <CreditCard className="w-5 h-5 text-neutral-400" />
                            <span className="font-mono">
                              •••• {method.last_four}
                            </span>
                            {method.is_default && (
                              <span className="text-xs bg-primary-100 text-primary-700 px-2 py-0.5 rounded-full">
                                Principal
                              </span>
                            )}
                          </div>
                          <Button
                            size="sm"
                            loading={payingWithMethodId === method.id}
                            disabled={
                              payMutation.isPending &&
                              payingWithMethodId !== method.id
                            }
                          >
                            Pagar
                          </Button>
                        </button>
                      ))}
                    </div>
                  )}

                  {payMutation.isError && (
                    <div className="mt-3 p-3 bg-red-100 rounded-lg text-sm text-red-700">
                      Error al procesar el pago. Por favor intenta de nuevo.
                    </div>
                  )}
                </div>
              )}

              {/* Nota si está pagada */}
              {invoice.status === 'paid' && invoice.paid_at && (
                <div className="bg-green-50 rounded-xl p-4 flex items-center gap-3">
                  <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0" />
                  <div>
                    <p className="font-medium text-green-800">Factura pagada</p>
                    <p className="text-sm text-green-700">
                      Pagada el{' '}
                      {format(
                        new Date(invoice.paid_at),
                        "d 'de' MMMM, yyyy 'a las' HH:mm",
                        { locale: es }
                      )}
                      {invoice.payment_method_display &&
                        ` con ${invoice.payment_method_display}`}
                    </p>
                  </div>
                </div>
              )}
            </div>
          ) : null}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-neutral-100 bg-neutral-50">
          <Button variant="secondary" onClick={onClose} fullWidth>
            Cerrar
          </Button>
        </div>
      </div>
    </div>
  )
}

export default InvoiceDetailModal
