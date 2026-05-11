"""
Servicios de negocio para citas.

Provee `create_appointment_atomic` para crear citas evitando race conditions
en double-booking, usando select_for_update sobre el rango de conflicto.
"""
from datetime import timedelta

from django.db import transaction
from django.utils import timezone

from .models import Appointment, AppointmentReminder


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
