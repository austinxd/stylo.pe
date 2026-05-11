import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery, useMutation } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import {
  CalendarCheck,
  CalendarX,
  Check,
  Clock,
  MapPin,
  Sparkles,
  User,
} from 'lucide-react'

import { waitlistApi } from '@/api/appointments'
import { getApiErrorMessage } from '@/api/client'
import { Button, EmptyState, Spinner } from '@/components/ui'

/**
 * Página pública para reclamar un slot liberado de waitlist.
 *
 * Flujo:
 * 1. Cliente recibe WhatsApp con link /waitlist/claim/{token}
 * 2. GET muestra detalles del slot ofrecido + countdown
 * 3. Click "Confirmar" → POST → crea la cita + muestra éxito
 *
 * Estados manejados:
 * - Loading: skeleton
 * - Token inválido / expirado: empty state con CTA al home
 * - Notified vigente: muestra slot + botón confirmar
 * - Claimed exitoso: muestra cita creada con detalles
 * - Conflict (otro cliente reservó): mensaje claro + CTA a búsqueda
 */
export default function WaitlistClaim() {
  const { token } = useParams<{ token: string }>()
  const [confirmed, setConfirmed] = useState<{
    appointment?: any
    message: string
  } | null>(null)

  const detail = useQuery({
    queryKey: ['waitlist-claim', token],
    queryFn: () => waitlistApi.getClaim(token!),
    enabled: !!token,
    retry: false,
  })

  const claim = useMutation({
    mutationFn: () => waitlistApi.claim(token!),
    onSuccess: (data) => {
      setConfirmed({
        appointment: data.appointment,
        message: data.message,
      })
      toast.success(data.message)
    },
    onError: (err) => {
      toast.error(getApiErrorMessage(err, 'No pudimos confirmar la reserva'))
    },
  })

  // === Confirmación exitosa ===
  if (confirmed) {
    return (
      <SuccessView confirmed={confirmed} />
    )
  }

  // === Loading ===
  if (detail.isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-neutral-50">
        <Spinner size="lg" className="text-primary-600" />
      </div>
    )
  }

  // === Token inválido o expirado ===
  if (detail.isError) {
    return (
      <ErrorView
        title={getClaimErrorTitle(detail.error)}
        description={getApiErrorMessage(
          detail.error,
          'Este enlace no es válido o ya no está disponible.',
        )}
      />
    )
  }

  const data = detail.data
  if (!data) {
    return <ErrorView title="No encontrado" description="No pudimos cargar tu reserva." />
  }

  const slotStart = data.entry.notified_for_start_datetime
    ? parseISO(data.entry.notified_for_start_datetime)
    : null

  return (
    <div className="min-h-screen bg-neutral-50 py-8 px-4">
      <div className="max-w-md mx-auto">
        <header className="text-center mb-8 animate-fade-in-up">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-success-100 mb-4">
            <Sparkles className="w-8 h-8 text-success-600" aria-hidden="true" />
          </div>
          <h1 className="text-2xl font-display text-neutral-900 mb-1">
            ¡Se liberó un cupo!
          </h1>
          <p className="text-sm text-neutral-600">
            Hola {data.entry.first_name}, este es el horario que se abrió:
          </p>
        </header>

        <article className="card mb-6">
          <div className="space-y-3">
            <Row
              icon={Sparkles}
              label="Servicio"
              value={data.entry.service_name}
            />
            {data.entry.notified_for_staff_name && (
              <Row
                icon={User}
                label="Profesional"
                value={data.entry.notified_for_staff_name}
              />
            )}
            {slotStart && (
              <Row
                icon={CalendarCheck}
                label="Fecha y hora"
                value={
                  format(slotStart, "EEEE d 'de' MMMM, HH:mm", { locale: es })
                }
              />
            )}
            <Row
              icon={MapPin}
              label="Sucursal"
              value={`${data.entry.business_name ?? ''} · ${data.entry.branch_name}`.trim()}
            />
          </div>

          <div className="mt-5 pt-4 border-t border-neutral-100 flex items-center gap-2 text-xs text-accent-700 bg-accent-50 -mx-6 -mb-6 px-6 pb-6 rounded-b-2xl">
            <Clock className="w-4 h-4 flex-shrink-0" aria-hidden="true" />
            <span>
              Tienes hasta las{' '}
              <span className="font-medium">
                {format(parseISO(data.expires_at), 'HH:mm')}
              </span>{' '}
              para confirmar. Después, pasamos al siguiente en la cola.
            </span>
          </div>
        </article>

        <Button
          onClick={() => claim.mutate()}
          loading={claim.isPending}
          loadingText="Confirmando…"
          fullWidth
          size="lg"
          icon={<Check className="w-5 h-5" />}
        >
          Confirmar mi reserva
        </Button>

        <p className="text-center text-xs text-neutral-500 mt-4">
          Si no era el horario que querías, ignora este link. Seguirás en la
          lista de espera si vuelve a liberarse otro cupo.
        </p>
      </div>
    </div>
  )
}

// === Subcomponentes ===

function Row({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Sparkles
  label: string
  value: string
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="w-9 h-9 rounded-full bg-neutral-100 flex items-center justify-center flex-shrink-0">
        <Icon className="w-4 h-4 text-neutral-600" aria-hidden="true" />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-neutral-500">{label}</p>
        <p className="text-sm font-medium text-neutral-900 capitalize">{value}</p>
      </div>
    </div>
  )
}

function SuccessView({
  confirmed,
}: {
  confirmed: { appointment?: any; message: string }
}) {
  const ap = confirmed.appointment
  return (
    <div className="min-h-screen bg-neutral-50 py-12 px-4">
      <div className="max-w-md mx-auto text-center animate-fade-in-up">
        <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-success-100 mb-6">
          <Check className="w-10 h-10 text-success-600" aria-hidden="true" />
        </div>
        <h1 className="text-2xl font-display text-neutral-900 mb-2">
          {confirmed.message}
        </h1>
        {ap ? (
          <>
            <p className="text-sm text-neutral-600 mb-6">
              Te esperamos. Te enviaremos un recordatorio por WhatsApp 24h antes.
            </p>
            <div className="card text-left">
              <div className="space-y-3">
                <Row icon={Sparkles} label="Servicio" value={ap.service_name} />
                <Row icon={User} label="Con" value={ap.staff_name} />
                <Row
                  icon={CalendarCheck}
                  label="Fecha y hora"
                  value={format(
                    parseISO(ap.start_datetime),
                    "EEEE d 'de' MMMM, HH:mm",
                    { locale: es },
                  )}
                />
                <Row
                  icon={MapPin}
                  label="Sucursal"
                  value={`${ap.business_name} · ${ap.branch_name}`}
                />
              </div>
            </div>
          </>
        ) : (
          <p className="text-sm text-neutral-600 mb-6">
            Te contactaremos para confirmar los detalles de tu reserva.
          </p>
        )}
        <Link to="/" className="btn-secondary mt-6 inline-flex">
          Volver al inicio
        </Link>
      </div>
    </div>
  )
}

function ErrorView({
  title,
  description,
}: {
  title: string
  description: string
}) {
  return (
    <div className="min-h-screen bg-neutral-50 flex items-center justify-center px-4">
      <EmptyState
        icon={CalendarX}
        title={title}
        description={description}
        tone="default"
        action={
          <Link to="/" className="btn-primary inline-flex">
            Volver al inicio
          </Link>
        }
      />
    </div>
  )
}

function getClaimErrorTitle(error: unknown): string {
  const msg = getApiErrorMessage(error, '')
  if (msg.toLowerCase().includes('expir')) return 'Este enlace expiró'
  if (msg.toLowerCase().includes('ya está')) return 'Ya procesado'
  return 'Enlace no válido'
}
