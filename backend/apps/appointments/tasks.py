"""
Tareas Celery para citas.
"""
from celery import shared_task
from django.utils import timezone
from datetime import timedelta
import logging

logger = logging.getLogger(__name__)


@shared_task
def send_appointment_reminders():
    """
    Envía recordatorios de citas programados.
    Ejecutar cada 5 minutos.
    """
    from .models import AppointmentReminder
    from apps.accounts.services import WhatsAppService

    now = timezone.now()
    # Buscar recordatorios pendientes que deben enviarse
    reminders = AppointmentReminder.objects.filter(
        status='pending',
        scheduled_at__lte=now,
        appointment__status__in=['pending', 'confirmed']
    ).select_related(
        'appointment',
        'appointment__client',
        'appointment__client__user',
        'appointment__service',
        'appointment__branch'
    )

    whatsapp = WhatsAppService()

    for reminder in reminders:
        try:
            appointment = reminder.appointment
            client = appointment.client

            if reminder.reminder_type == 'whatsapp':
                result = whatsapp.send_appointment_reminder(
                    phone_number=client.user.phone_number,
                    client_name=client.first_name,
                    service_name=appointment.service.name,
                    datetime_str=appointment.start_datetime.strftime('%d/%m/%Y %H:%M'),
                    branch_name=appointment.branch.name
                )

                if result['success']:
                    reminder.status = 'sent'
                    reminder.sent_at = now
                else:
                    reminder.status = 'failed'
                    reminder.error_message = result.get('error', 'Error desconocido')

                reminder.save()
                logger.info(
                    f"Recordatorio {'enviado' if result['success'] else 'fallido'} "
                    f"para cita {appointment.id}"
                )

        except Exception as e:
            logger.error(f"Error enviando recordatorio {reminder.id}: {e}")
            reminder.status = 'failed'
            reminder.error_message = str(e)
            reminder.save()


@shared_task
def send_appointment_confirmation(appointment_id: int):
    """
    Envía confirmación de cita por WhatsApp.
    """
    from .models import Appointment
    from apps.accounts.services import WhatsAppService

    try:
        appointment = Appointment.objects.select_related(
            'client', 'client__user', 'staff', 'service', 'branch'
        ).get(pk=appointment_id)

        whatsapp = WhatsAppService()
        result = whatsapp.send_appointment_confirmation(
            phone_number=appointment.client.user.phone_number,
            client_name=appointment.client.first_name,
            service_name=appointment.service.name,
            staff_name=appointment.staff.full_name,
            datetime_str=appointment.start_datetime.strftime('%d/%m/%Y %H:%M'),
            branch_name=appointment.branch.name
        )

        logger.info(
            f"Confirmación {'enviada' if result['success'] else 'fallida'} "
            f"para cita {appointment_id}"
        )

    except Appointment.DoesNotExist:
        logger.error(f"Cita {appointment_id} no encontrada")
    except Exception as e:
        logger.error(f"Error enviando confirmación para cita {appointment_id}: {e}")


@shared_task
def mark_no_show_appointments():
    """
    Marca como 'no_show' las citas que pasaron sin ser atendidas.
    Ejecutar cada hora.
    """
    from .models import Appointment

    cutoff = timezone.now() - timedelta(hours=1)

    updated = Appointment.objects.filter(
        status__in=['pending', 'confirmed'],
        end_datetime__lt=cutoff
    ).update(status='no_show')

    if updated:
        logger.info(f"Marcadas {updated} citas como no_show")


@shared_task
def cleanup_old_login_sessions():
    """
    Limpia sesiones de login antiguas.
    Ejecutar diariamente.
    """
    from apps.accounts.models import LoginSession

    cutoff = timezone.now() - timedelta(days=7)
    deleted, _ = LoginSession.objects.filter(created_at__lt=cutoff).delete()

    if deleted:
        logger.info(f"Eliminadas {deleted} sesiones de login antiguas")
