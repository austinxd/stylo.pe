"""
Servicios de negocio para citas.

Provee `create_appointment_atomic` para crear citas evitando race conditions
en double-booking, usando select_for_update sobre el rango de conflicto.
También provee `process_waitlist_for_appointment` para notificar al primer
cliente en lista de espera cuando un slot se libera.
"""
import logging
from datetime import timedelta

from django.db import models, transaction
from django.utils import timezone

from .models import Appointment, AppointmentReminder, WaitlistEntry

logger = logging.getLogger(__name__)

# Tiempo que el cliente notificado tiene para reclamar el slot
WAITLIST_CLAIM_TTL = timedelta(minutes=30)


class AppointmentConflictError(Exception):
    """Se levanta cuando el slot solicitado ya no está disponible."""


ACTIVE_STATUSES = ('pending', 'confirmed', 'in_progress')


def _has_conflict(*, staff_id, start_datetime, end_datetime, exclude_id=None):
    """
    Verifica si existe un conflicto de horario para el staff.

    DEBE ejecutarse dentro de transaction.atomic para que select_for_update
    tenga efecto sobre las filas conflictivas.
    """
    qs = Appointment.objects.select_for_update().filter(
        staff_id=staff_id,
        status__in=ACTIVE_STATUSES,
        start_datetime__lt=end_datetime,
        end_datetime__gt=start_datetime,
    )
    if exclude_id:
        qs = qs.exclude(pk=exclude_id)
    return qs.exists()


@transaction.atomic
def create_appointment_atomic(
    *,
    branch_id,
    client,
    staff_id,
    service,
    start_datetime,
    price,
    notes='',
    status='confirmed',
    create_reminder=True,
):
    """
    Crea una cita garantizando que no exista double-booking.

    Adquiere lock pessimista (FOR UPDATE) sobre las filas de Appointment
    que podrían entrar en conflicto con el rango solicitado, antes de
    insertar la nueva. Si dos peticiones llegan a la vez, la segunda
    espera a que la primera commitee y entonces ve el conflicto.

    Levanta AppointmentConflictError si el slot ya no está disponible.
    """
    end_datetime = start_datetime + timedelta(minutes=service.total_duration)

    if _has_conflict(
        staff_id=staff_id,
        start_datetime=start_datetime,
        end_datetime=end_datetime,
    ):
        raise AppointmentConflictError(
            'El horario seleccionado ya no está disponible.'
        )

    appointment = Appointment.objects.create(
        branch_id=branch_id,
        client=client,
        staff_id=staff_id,
        service=service,
        start_datetime=start_datetime,
        end_datetime=end_datetime,
        price=price,
        notes=notes,
        status=status,
    )

    if create_reminder:
        reminder_time = start_datetime - timedelta(hours=24)
        if reminder_time > timezone.now():
            AppointmentReminder.objects.create(
                appointment=appointment,
                reminder_type='whatsapp',
                scheduled_at=reminder_time,
            )

    return appointment


@transaction.atomic
def reschedule_appointment_atomic(*, appointment, new_start_datetime):
    """
    Reagenda una cita existente garantizando no-conflicto.

    Cambia start_datetime/end_datetime usando duración del servicio actual
    (o el snapshot si el servicio fue eliminado) y verifica conflictos
    con lock. La cita misma se excluye del check.
    """
    if appointment.service is not None:
        duration = appointment.service.total_duration
    elif appointment.service_duration_snapshot:
        duration = appointment.service_duration_snapshot
    else:
        raise AppointmentConflictError(
            'No se puede reagendar: no hay duración registrada para esta cita.'
        )
    new_end_datetime = new_start_datetime + timedelta(minutes=duration)

    if _has_conflict(
        staff_id=appointment.staff_id,
        start_datetime=new_start_datetime,
        end_datetime=new_end_datetime,
        exclude_id=appointment.pk,
    ):
        raise AppointmentConflictError(
            'El nuevo horario ya no está disponible.'
        )

    appointment.start_datetime = new_start_datetime
    appointment.end_datetime = new_end_datetime
    appointment.save(update_fields=['start_datetime', 'end_datetime', 'updated_at'])
    return appointment


@transaction.atomic
def process_waitlist_for_appointment(appointment) -> WaitlistEntry | None:
    """
    Cuando una cita se cancela, busca al primer cliente en waitlist que
    encaje con su slot, lo marca como `notified`, genera un claim_token
    válido por WAITLIST_CLAIM_TTL, y retorna el entry.

    Retorna None si no hay nadie en espera matcheable.

    Diseño:
    - FIFO: el primero en anotarse (created_at asc) tiene prioridad.
    - select_for_update para evitar que dos cancelaciones simultáneas
      notifiquen al mismo cliente.
    - El envío de WhatsApp queda fuera de la transacción (lo dispara
      el caller después del commit).
    """
    # Candidates: entries en waiting que matchean criterios básicos
    appt_date = appointment.start_datetime.astimezone(
        timezone.get_current_timezone()
    ).date()

    candidates = (
        WaitlistEntry.objects.select_for_update()
        .filter(
            branch_id=appointment.branch_id,
            service_id=appointment.service_id,
            preferred_date=appt_date,
            status='waiting',
        )
        # Si la cita era con un staff específico, las entries con staff
        # null o ese mismo staff matchean. Las entries con OTRO staff no.
        .filter(models.Q(staff__isnull=True) | models.Q(staff_id=appointment.staff_id))
        .order_by('created_at')
    )

    for entry in candidates:
        # Doble check de time range en Python (más fácil que en SQL)
        if not entry.matches_appointment_window(appointment):
            continue
        # Match: notificar
        entry.status = 'notified'
        entry.claim_token = WaitlistEntry.generate_claim_token()
        entry.claim_token_expires_at = timezone.now() + WAITLIST_CLAIM_TTL
        entry.notified_at = timezone.now()
        entry.save(update_fields=[
            'status', 'claim_token', 'claim_token_expires_at',
            'notified_at', 'updated_at',
        ])
        logger.info(
            "Waitlist notificación: entry=%s appointment_freed=%s token=%s...",
            entry.pk, appointment.pk, entry.claim_token[:8],
        )
        return entry

    return None
