import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { Calendar, Clock } from 'lucide-react'

import { appointmentsApi } from '@/api/appointments'
import { getApiErrorMessage } from '@/api/client'
import { Button, Modal } from '@/components/ui'

interface AppointmentLite {
  id: number
  start_datetime: string
  service_name?: string
  staff_name?: string
}

interface RescheduleModalProps {
  appointment: AppointmentLite | null
  onClose: () => void
}

/**
 * Modal para reagendar una cita.
 *
 * Toma el datetime actual de la cita como punto de partida y permite
 * elegir nueva fecha + hora. Envía al endpoint
 * POST /appointments/dashboard/{id}/reschedule/ que valida atómicamente
 * que el nuevo slot no esté ocupado.
 *
 * Si el slot está ocupado, recibe 409 → toast claro al usuario.
 */
export function RescheduleModal({ appointment, onClose }: RescheduleModalProps) {
  const queryClient = useQueryClient()

  // Estado inicial: fecha actual de la cita
  const initial = appointment ? parseISO(appointment.start_datetime) : new Date()
  const [date, setDate] = useState<string>(
    appointment ? format(initial, 'yyyy-MM-dd') : '',
  )
  const [time, setTime] = useState<string>(
    appointment ? format(initial, 'HH:mm') : '',
  )

  const reschedule = useMutation({
    mutationFn: async ({
      id,
      isoString,
    }: {
      id: number
      isoString: string
    }) => appointmentsApi.rescheduleAppointment(id, isoString),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['appointments'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      toast.success('Cita reagendada')
      onClose()
    },
    onError: (err) => {
      toast.error(getApiErrorMessage(err, 'No pudimos reagendar la cita'))
    },
  })

  const handleSubmit = () => {
    if (!appointment) return
    if (!date || !time) {
      toast.error('Selecciona fecha y hora')
      return
    }
    // Construir ISO local y dejar que el server interprete
    const isoString = `${date}T${time}:00`
    reschedule.mutate({ id: appointment.id, isoString })
  }

  const isInvalid = !date || !time

  return (
    <Modal
      open={!!appointment}
      onClose={() => !reschedule.isPending && onClose()}
      title="Reagendar cita"
      description="Elige nueva fecha y hora. Si el horario está tomado, te avisamos."
      size="md"
      footer={
        <>
          <Button
            variant="ghost"
            onClick={onClose}
            disabled={reschedule.isPending}
          >
            Cancelar
          </Button>
          <Button
            onClick={handleSubmit}
            loading={reschedule.isPending}
            loadingText="Reagendando…"
            disabled={isInvalid}
          >
            Reagendar
          </Button>
        </>
      }
    >
      {appointment && (
        <div className="space-y-4">
          <div className="bg-neutral-50 rounded-xl p-3 text-sm">
            <p className="text-neutral-700">
              <span className="font-medium">Actualmente:</span>{' '}
              {format(initial, "EEEE d 'de' MMMM, HH:mm", { locale: es })}
            </p>
            {appointment.service_name && (
              <p className="text-neutral-500 text-xs mt-1">
                {appointment.service_name}
                {appointment.staff_name && ` · ${appointment.staff_name}`}
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="label flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5" aria-hidden="true" />
                Nueva fecha
              </span>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                min={format(new Date(), 'yyyy-MM-dd')}
                className="input"
              />
            </label>

            <label className="block">
              <span className="label flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" aria-hidden="true" />
                Nueva hora
              </span>
              <input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                step={300}
                className="input"
              />
            </label>
          </div>

          <p className="helper-text">
            La duración se mantiene según el servicio. Si el nuevo horario está
            ocupado por otra cita del mismo profesional, no podrás reagendar.
          </p>
        </div>
      )}
    </Modal>
  )
}

export default RescheduleModal
