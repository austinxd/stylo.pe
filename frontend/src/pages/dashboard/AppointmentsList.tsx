import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import apiClient from '@/api/client'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { Button } from '@/components/ui'

interface Appointment {
  id: number
  client_name: string
  client_phone: string
  staff: number
  staff_name: string
  service: number
  service_name: string
  start_datetime: string
  end_datetime: string
  status: string
  price: string
  notes: string
  staff_notes: string
  created_at: string
}

const statusConfig: Record<string, { label: string; color: string }> = {
  pending: { label: 'Pendiente', color: 'bg-yellow-100 text-yellow-800' },
  confirmed: { label: 'Confirmada', color: 'bg-green-100 text-green-800' },
  in_progress: { label: 'En progreso', color: 'bg-blue-100 text-blue-800' },
  completed: { label: 'Completada', color: 'bg-gray-100 text-gray-600' },
  cancelled: { label: 'Cancelada', color: 'bg-red-100 text-red-800' },
  no_show: { label: 'No asistio', color: 'bg-orange-100 text-orange-800' },
}

export default function AppointmentsListContent() {
  const queryClient = useQueryClient()
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null)

  // Obtener citas
  const { data: appointments = [], isLoading, error } = useQuery<Appointment[]>({
    queryKey: ['dashboard', 'appointments', statusFilter],
    queryFn: async () => {
      const params = statusFilter ? { status: statusFilter } : {}
      const response = await apiClient.get('/dashboard/appointments/', { params })
      // Manejar formato paginado (DRF) o array directo
      if (Array.isArray(response.data)) {
        return response.data
      }
      return response.data?.results || []
    },
  })

  // Actualizar estado de cita
  const updateStatus = useMutation({
    mutationFn: async ({ id, status, staff_notes }: { id: number; status: string; staff_notes?: string }) => {
      const response = await apiClient.post(`/dashboard/appointments/${id}/update_status/`, {
        status,
        staff_notes,
      })
      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dashboard', 'appointments'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard', 'summary'] })
      setSelectedAppointment(null)
    },
  })

  const handleStatusChange = (appointment: Appointment, newStatus: string) => {
    if (confirm(`¿Cambiar estado a "${statusConfig[newStatus]?.label}"?`)) {
      updateStatus.mutate({ id: appointment.id, status: newStatus })
    }
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-red-500 mb-4">Error al cargar las citas</p>
        <p className="text-gray-500 text-sm">Verifica que tengas permisos para acceder.</p>
      </div>
    )
  }

  return (
    <div>
      {/* Filtros */}
      <div className="flex flex-wrap justify-end items-center gap-4 mb-4">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white text-sm"
        >
          <option value="">Todos los estados</option>
          {Object.entries(statusConfig).map(([value, { label }]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>

      {/* Lista de citas */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
        </div>
      ) : appointments.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <div className="text-4xl mb-4">📋</div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">No hay citas</h3>
          <p className="text-gray-500">
            {statusFilter
              ? `No hay citas con estado "${statusConfig[statusFilter]?.label}"`
              : 'Las citas de tus clientes aparecerán aquí'}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Cliente
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Servicio
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Profesional
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Fecha y Hora
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Precio
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Estado
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {appointments.map((appointment) => (
                  <tr key={appointment.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <div>
                        <p className="font-medium text-gray-900">{appointment.client_name}</p>
                        <p className="text-sm text-gray-500">{appointment.client_phone}</p>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900">
                      {appointment.service_name}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900">
                      {appointment.staff_name}
                    </td>
                    <td className="px-6 py-4">
                      <p className="text-sm font-medium text-gray-900">
                        {format(parseISO(appointment.start_datetime), "d 'de' MMM, yyyy", { locale: es })}
                      </p>
                      <p className="text-sm text-gray-500">
                        {format(parseISO(appointment.start_datetime), 'HH:mm')} -{' '}
                        {format(parseISO(appointment.end_datetime), 'HH:mm')}
                      </p>
                    </td>
                    <td className="px-6 py-4 text-sm font-medium text-gray-900">
                      S/ {parseFloat(appointment.price).toFixed(2)}
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          statusConfig[appointment.status]?.color || 'bg-gray-100 text-gray-800'
                        }`}
                      >
                        {statusConfig[appointment.status]?.label || appointment.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button
                        onClick={() => setSelectedAppointment(appointment)}
                        className="text-primary-600 hover:text-primary-900 text-sm"
                      >
                        Ver detalles
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal de detalle */}
      {selectedAppointment && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4">
            <div className="p-6 border-b border-gray-200">
              <div className="flex justify-between items-start">
                <h3 className="text-lg font-semibold text-gray-900">Detalle de Cita</h3>
                <button
                  onClick={() => setSelectedAppointment(null)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  ✕
                </button>
              </div>
            </div>

            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-gray-500">Cliente</p>
                  <p className="font-medium">{selectedAppointment.client_name}</p>
                  <p className="text-sm text-gray-500">{selectedAppointment.client_phone}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Profesional</p>
                  <p className="font-medium">{selectedAppointment.staff_name}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-gray-500">Servicio</p>
                  <p className="font-medium">{selectedAppointment.service_name}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Precio</p>
                  <p className="font-medium">S/ {parseFloat(selectedAppointment.price).toFixed(2)}</p>
                </div>
              </div>

              <div>
                <p className="text-sm text-gray-500">Fecha y Hora</p>
                <p className="font-medium">
                  {format(parseISO(selectedAppointment.start_datetime), "EEEE d 'de' MMMM, yyyy", { locale: es })}
                </p>
                <p className="text-gray-600">
                  {format(parseISO(selectedAppointment.start_datetime), 'HH:mm')} -{' '}
                  {format(parseISO(selectedAppointment.end_datetime), 'HH:mm')}
                </p>
              </div>

              <div>
                <p className="text-sm text-gray-500">Estado actual</p>
                <span
                  className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                    statusConfig[selectedAppointment.status]?.color || 'bg-gray-100 text-gray-800'
                  }`}
                >
                  {statusConfig[selectedAppointment.status]?.label || selectedAppointment.status}
                </span>
              </div>

              {selectedAppointment.notes && (
                <div>
                  <p className="text-sm text-gray-500">Notas del cliente</p>
                  <p className="text-gray-700">{selectedAppointment.notes}</p>
                </div>
              )}

              {selectedAppointment.staff_notes && (
                <div>
                  <p className="text-sm text-gray-500">Notas internas</p>
                  <p className="text-gray-700">{selectedAppointment.staff_notes}</p>
                </div>
              )}

              {/* Acciones de estado */}
              <div className="pt-4 border-t border-gray-200">
                <p className="text-sm font-medium text-gray-700 mb-3">Cambiar estado:</p>
                <div className="flex flex-wrap gap-2">
                  {selectedAppointment.status === 'pending' && (
                    <>
                      <Button
                        size="sm"
                        onClick={() => handleStatusChange(selectedAppointment, 'confirmed')}
                        disabled={updateStatus.isPending}
                      >
                        Confirmar
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => handleStatusChange(selectedAppointment, 'cancelled')}
                        disabled={updateStatus.isPending}
                      >
                        Cancelar
                      </Button>
                    </>
                  )}
                  {selectedAppointment.status === 'confirmed' && (
                    <>
                      <Button
                        size="sm"
                        onClick={() => handleStatusChange(selectedAppointment, 'in_progress')}
                        disabled={updateStatus.isPending}
                      >
                        Iniciar
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => handleStatusChange(selectedAppointment, 'no_show')}
                        disabled={updateStatus.isPending}
                      >
                        No asistio
                      </Button>
                    </>
                  )}
                  {selectedAppointment.status === 'in_progress' && (
                    <Button
                      size="sm"
                      onClick={() => handleStatusChange(selectedAppointment, 'completed')}
                      disabled={updateStatus.isPending}
                    >
                      Completar
                    </Button>
                  )}
                </div>
              </div>
            </div>

            <div className="p-6 border-t border-gray-200">
              <Button variant="secondary" onClick={() => setSelectedAppointment(null)} className="w-full">
                Cerrar
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
