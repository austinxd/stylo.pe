import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { Bell, Clock } from 'lucide-react'

import { waitlistApi, type WaitlistJoinPayload } from '@/api/appointments'
import { getApiErrorMessage } from '@/api/client'
import { Button, Input, Modal } from '@/components/ui'

interface WaitlistJoinModalProps {
  open: boolean
  onClose: () => void
  branchId: number
  serviceId: number
  serviceName?: string
  staffId?: number | null
  staffName?: string
  preferredDate: Date
}

/**
 * Modal para que un cliente se anote en lista de espera cuando un día
 * no tiene slots disponibles.
 *
 * UX:
 * - Pre-llena la fecha (no editable: es la que estaba viendo)
 * - Pide phone + first_name + rango horario opcional
 * - Muestra confirmación clara post-submit
 *
 * Diseño defensivo:
 * - Rate limited en backend; aquí mostramos error si pasa
 * - Si ya está anotado (409), mensaje específico
 */
export function WaitlistJoinModal({
  open,
  onClose,
  branchId,
  serviceId,
  serviceName,
  staffId,
  staffName,
  preferredDate,
}: WaitlistJoinModalProps) {
  const [firstName, setFirstName] = useState('')
  const [phone, setPhone] = useState('+51')
  const [timeStart, setTimeStart] = useState('')
  const [timeEnd, setTimeEnd] = useState('')
  const [submitted, setSubmitted] = useState(false)

  const reset = () => {
    setFirstName('')
    setPhone('+51')
    setTimeStart('')
    setTimeEnd('')
    setSubmitted(false)
  }

  const handleClose = () => {
    reset()
    onClose()
  }

  const join = useMutation({
    mutationFn: (payload: WaitlistJoinPayload) => waitlistApi.join(payload),
    onSuccess: () => {
      setSubmitted(true)
      toast.success('Te anotamos en la lista de espera')
    },
    onError: (err) => {
      toast.error(getApiErrorMessage(err, 'No pudimos anotarte'))
    },
  })

  const handleSubmit = () => {
    if (!firstName.trim() || phone.length < 8) {
      toast.error('Completa tu nombre y teléfono')
      return
    }
    const payload: WaitlistJoinPayload = {
      branch_id: branchId,
      service_id: serviceId,
      staff_id: staffId ?? undefined,
      preferred_date: format(preferredDate, 'yyyy-MM-dd'),
      phone_number: phone.trim(),
      first_name: firstName.trim(),
    }
    if (timeStart && timeEnd) {
      payload.preferred_time_start = timeStart
      payload.preferred_time_end = timeEnd
    }
    join.mutate(payload)
  }

  // Confirmación post-submit
  if (submitted) {
    return (
      <Modal
        open={open}
        onClose={handleClose}
        title="¡Listo!"
        description="Te avisaremos por WhatsApp si se libera un cupo."
        size="sm"
        hideCloseButton
        footer={
          <Button onClick={handleClose} fullWidth>
            Entendido
          </Button>
        }
      >
        <div className="flex flex-col items-center text-center py-4">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-success-100 mb-4">
            <Bell className="w-7 h-7 text-success-600" aria-hidden="true" />
          </div>
          <p className="text-sm text-neutral-700">
            Cuando un cliente cancele su cita de{' '}
            <span className="font-medium">{serviceName ?? 'este servicio'}</span>{' '}
            el{' '}
            <span className="font-medium">
              {format(preferredDate, "EEEE d 'de' MMMM", { locale: es })}
            </span>
            , te enviaremos un link para reservar el horario liberado.
          </p>
          <p className="text-xs text-neutral-500 mt-3">
            Tendrás 30 minutos para confirmar antes de que pase al siguiente.
          </p>
        </div>
      </Modal>
    )
  }

  return (
    <Modal
      open={open}
      onClose={() => !join.isPending && handleClose()}
      title="Avísame cuando se libere"
      description={`No hay cupos disponibles el ${format(preferredDate, "d 'de' MMMM", { locale: es })}. Te notificamos si alguien cancela.`}
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={handleClose} disabled={join.isPending}>
            Cancelar
          </Button>
          <Button
            onClick={handleSubmit}
            loading={join.isPending}
            loadingText="Anotando…"
            icon={<Bell className="w-4 h-4" />}
          >
            Anotarme
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="bg-neutral-50 rounded-xl p-3 text-sm space-y-1">
          {serviceName && (
            <p className="text-neutral-700">
              <span className="font-medium">Servicio:</span> {serviceName}
            </p>
          )}
          {staffName && (
            <p className="text-neutral-700">
              <span className="font-medium">Profesional:</span> {staffName}
            </p>
          )}
          <p className="text-neutral-700">
            <span className="font-medium">Fecha:</span>{' '}
            {format(preferredDate, "EEEE d 'de' MMMM yyyy", { locale: es })}
          </p>
        </div>

        <Input
          label="Tu nombre"
          value={firstName}
          onChange={(e) => setFirstName(e.target.value)}
          placeholder="Ej. Ana"
          required
        />
        <Input
          label="WhatsApp"
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="+51987654321"
          required
          helperText="Te enviaremos el link de confirmación a este número."
        />

        <details className="text-sm">
          <summary className="cursor-pointer text-neutral-700 select-none">
            <Clock className="inline w-3.5 h-3.5 mr-1" aria-hidden="true" />
            Tengo un rango horario preferido (opcional)
          </summary>
          <div className="grid grid-cols-2 gap-3 mt-3">
            <label className="block">
              <span className="label">Desde</span>
              <input
                type="time"
                value={timeStart}
                onChange={(e) => setTimeStart(e.target.value)}
                className="input"
                step={900}
              />
            </label>
            <label className="block">
              <span className="label">Hasta</span>
              <input
                type="time"
                value={timeEnd}
                onChange={(e) => setTimeEnd(e.target.value)}
                className="input"
                step={900}
              />
            </label>
          </div>
        </details>
      </div>
    </Modal>
  )
}

export default WaitlistJoinModal
