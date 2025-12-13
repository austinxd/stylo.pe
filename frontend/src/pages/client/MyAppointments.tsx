import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import appointmentsApi from '@/api/appointments'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import type { Appointment } from '@/types'

const statusLabels: Record<string, { label: string; color: string }> = {
  pending: { label: 'Pendiente', color: 'bg-yellow-100 text-yellow-800' },
  confirmed: { label: 'Confirmada', color: 'bg-green-100 text-green-800' },
  in_progress: { label: 'En progreso', color: 'bg-blue-100 text-blue-800' },
  completed: { label: 'Completada', color: 'bg-gray-100 text-gray-800' },
  cancelled: { label: 'Cancelada', color: 'bg-red-100 text-red-800' },
  no_show: { label: 'No asistió', color: 'bg-red-100 text-red-800' },
}

export default function MyAppointments() {
  const queryClient = useQueryClient()

  const { data: upcoming, isLoading: loadingUpcoming } = useQuery({
    queryKey: ['appointments', 'upcoming'],
    queryFn: appointmentsApi.getUpcoming,
  })

  const { data: history, isLoading: loadingHistory } = useQuery({
    queryKey: ['appointments', 'history'],
    queryFn: appointmentsApi.getHistory,
  })

  const cancelMutation = useMutation({
    mutationFn: (id: number) => appointmentsApi.cancelAppointment(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['appointments'] })
    },
  })

  const handleCancel = (appointment: Appointment) => {
    if (confirm('¿Estás seguro de cancelar esta cita?')) {
      cancelMutation.mutate(appointment.id)
    }
  }

  const AppointmentCard = ({
    appointment,
    showCancel = false,
  }: {
    appointment: Appointment
    showCancel?: boolean
  }) => (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <div className="flex justify-between items-start mb-4">
        <div>
          <h3 className="font-semibold text-lg text-gray-900">
            {appointment.service_name}
          </h3>
          <p className="text-gray-600">{appointment.business_name}</p>
        </div>
        <span
          className={`px-3 py-1 rounded-full text-sm font-medium ${
            statusLabels[appointment.status].color
          }`}
        >
          {statusLabels[appointment.status].label}
        </span>
      </div>

      <div className="space-y-2 text-sm text-gray-600 mb-4">
        <p className="flex items-center gap-2">
          <span>📅</span>
          {format(parseISO(appointment.start_datetime), "EEEE d 'de' MMMM, HH:mm", {
            locale: es,
          })}
        </p>
        <p className="flex items-center gap-2">
          <span>👤</span>
          {appointment.staff_name}
        </p>
        <p className="flex items-center gap-2">
          <span>📍</span>
          {appointment.branch_name}
        </p>
      </div>

      <div className="flex justify-between items-center pt-4 border-t border-gray-100">
        <span className="font-semibold text-primary-600">
          S/ {appointment.price}
        </span>
        {showCancel && appointment.can_cancel && (
          <button
            onClick={() => handleCancel(appointment)}
            disabled={cancelMutation.isPending}
            className="text-red-600 hover:text-red-700 text-sm font-medium"
          >
            {cancelMutation.isPending ? 'Cancelando...' : 'Cancelar cita'}
          </button>
        )}
      </div>
    </div>
  )

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-8">Mis Citas</h1>

      {/* Próximas citas */}
      <section className="mb-12">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          Próximas citas
        </h2>

        {loadingUpcoming ? (
          <div className="flex justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
          </div>
        ) : upcoming && upcoming.length > 0 ? (
          <div className="grid md:grid-cols-2 gap-4">
            {upcoming.map((appointment) => (
              <AppointmentCard
                key={appointment.id}
                appointment={appointment}
                showCancel
              />
            ))}
          </div>
        ) : (
          <div className="bg-gray-50 rounded-xl p-8 text-center">
            <p className="text-gray-500 mb-4">No tienes citas próximas</p>
            <a href="/" className="btn-primary">
              Reservar ahora
            </a>
          </div>
        )}
      </section>

      {/* Historial */}
      <section>
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          Historial
        </h2>

        {loadingHistory ? (
          <div className="flex justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
          </div>
        ) : history && history.length > 0 ? (
          <div className="grid md:grid-cols-2 gap-4">
            {history.map((appointment) => (
              <AppointmentCard key={appointment.id} appointment={appointment} />
            ))}
          </div>
        ) : (
          <p className="text-gray-500 text-center py-8">
            No tienes citas anteriores
          </p>
        )}
      </section>
    </div>
  )
}
