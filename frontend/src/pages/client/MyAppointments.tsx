import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import {
  Calendar,
  CalendarX,
  Clock,
  MapPin,
  Sparkles,
  User,
} from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'

import appointmentsApi from '@/api/appointments'
import { getApiErrorMessage } from '@/api/client'
import { Button, EmptyState, Modal, SkeletonList } from '@/components/ui'
import type { Appointment } from '@/types'

type StatusKey = Appointment['status']

const statusLabels: Record<StatusKey, { label: string; tone: string }> = {
  pending: { label: 'Pendiente', tone: 'bg-accent-100 text-accent-800' },
  confirmed: { label: 'Confirmada', tone: 'bg-success-100 text-success-800' },
  in_progress: { label: 'En progreso', tone: 'bg-primary-100 text-primary-800' },
  completed: { label: 'Completada', tone: 'bg-neutral-100 text-neutral-700' },
  cancelled: { label: 'Cancelada', tone: 'bg-error-100 text-error-800' },
  no_show: { label: 'No asistió', tone: 'bg-error-100 text-error-800' },
}

export default function MyAppointments() {
  const queryClient = useQueryClient()
  const [appointmentToCancel, setAppointmentToCancel] = useState<Appointment | null>(null)

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
      toast.success('Cita cancelada')
      setAppointmentToCancel(null)
    },
    onError: (err) => {
      toast.error(getApiErrorMessage(err, 'No pudimos cancelar la cita'))
    },
  })

  return (
    <div className="container-narrow py-8 sm:py-12">
      <header className="mb-8">
        <h1 className="text-display-sm font-display text-neutral-900">Mis citas</h1>
        <p className="text-neutral-600 mt-1">
          Gestiona tus reservas próximas e historial de visitas.
        </p>
      </header>

      <section className="mb-12">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500 mb-4">
          Próximas
        </h2>
        {loadingUpcoming ? (
          <SkeletonList count={2} variant="card" gap="gap-4" />
        ) : upcoming && upcoming.length > 0 ? (
          <div className="grid md:grid-cols-2 gap-4">
            {upcoming.map((appointment) => (
              <AppointmentCard
                key={appointment.id}
                appointment={appointment}
                onCancel={() => setAppointmentToCancel(appointment)}
                cancelling={cancelMutation.isPending && appointmentToCancel?.id === appointment.id}
              />
            ))}
          </div>
        ) : (
          <EmptyState
            icon={Sparkles}
            title="No tienes citas próximas"
            description="Cuando reserves un servicio, aparecerá aquí con todos los detalles."
            action={
              <a href="/" className="btn-primary inline-flex">
                Reservar ahora
              </a>
            }
          />
        )}
      </section>

      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500 mb-4">
          Historial
        </h2>
        {loadingHistory ? (
          <SkeletonList count={3} variant="card" gap="gap-4" />
        ) : history && history.length > 0 ? (
          <div className="grid md:grid-cols-2 gap-4">
            {history.map((appointment) => (
              <AppointmentCard key={appointment.id} appointment={appointment} />
            ))}
          </div>
        ) : (
          <EmptyState
            icon={CalendarX}
            title="Aún no tienes historial"
            description="Las citas pasadas aparecerán aquí para que las consultes cuando quieras."
            tone="subtle"
          />
        )}
      </section>

      <Modal
        open={!!appointmentToCancel}
        onClose={() => !cancelMutation.isPending && setAppointmentToCancel(null)}
        title="¿Cancelar esta cita?"
        description="Esta acción no se puede deshacer. El negocio recibirá la notificación."
        size="sm"
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => setAppointmentToCancel(null)}
              disabled={cancelMutation.isPending}
            >
              No, mantener
            </Button>
            <Button
              variant="danger"
              loading={cancelMutation.isPending}
              loadingText="Cancelando…"
              onClick={() =>
                appointmentToCancel && cancelMutation.mutate(appointmentToCancel.id)
              }
            >
              Sí, cancelar
            </Button>
          </>
        }
      >
        {appointmentToCancel && (
          <div className="text-sm text-neutral-700 space-y-2">
            <p>
              <span className="font-medium">{appointmentToCancel.service_name}</span>{' '}
              en <span className="font-medium">{appointmentToCancel.business_name}</span>
            </p>
            <p className="text-neutral-500">
              {format(parseISO(appointmentToCancel.start_datetime), "EEEE d 'de' MMMM, HH:mm", {
                locale: es,
              })}
            </p>
          </div>
        )}
      </Modal>
    </div>
  )
}

function AppointmentCard({
  appointment,
  onCancel,
  cancelling,
}: {
  appointment: Appointment
  onCancel?: () => void
  cancelling?: boolean
}) {
  const status = statusLabels[appointment.status]

  return (
    <article className="card hover:shadow-soft-lg transition-shadow">
      <div className="flex justify-between items-start gap-3 mb-4">
        <div className="min-w-0">
          <h3 className="font-semibold text-neutral-900 truncate">
            {appointment.service_name}
          </h3>
          <p className="text-sm text-neutral-600 truncate">
            {appointment.business_name}
          </p>
        </div>
        <span className={`badge ${status.tone} flex-shrink-0`}>{status.label}</span>
      </div>

      <dl className="space-y-1.5 text-sm text-neutral-600 mb-4">
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-neutral-400" aria-hidden="true" />
          <span>
            {format(parseISO(appointment.start_datetime), "EEEE d 'de' MMMM", {
              locale: es,
            })}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-neutral-400" aria-hidden="true" />
          <span>{format(parseISO(appointment.start_datetime), 'HH:mm')}</span>
        </div>
        <div className="flex items-center gap-2">
          <User className="w-4 h-4 text-neutral-400" aria-hidden="true" />
          <span>{appointment.staff_name}</span>
        </div>
        <div className="flex items-center gap-2">
          <MapPin className="w-4 h-4 text-neutral-400" aria-hidden="true" />
          <span className="truncate">{appointment.branch_name}</span>
        </div>
      </dl>

      <div className="flex justify-between items-center pt-4 border-t border-neutral-100">
        <span className="font-semibold text-neutral-900">
          S/ {appointment.price}
        </span>
        {onCancel && appointment.can_cancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={cancelling}
            className="text-error-600 hover:text-error-700 text-sm font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-error-500 rounded px-1 disabled:opacity-50"
          >
            {cancelling ? 'Cancelando…' : 'Cancelar'}
          </button>
        )}
      </div>
    </article>
  )
}
