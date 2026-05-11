"""
Señales para el módulo de citas.
Genera tokens de reseña cuando una cita se marca como completada.
"""
from django.db.models.signals import pre_save, post_save
from django.dispatch import receiver
from django.utils import timezone

from .models import Appointment, AppointmentReminder
from apps.core.models import ReviewToken


TERMINAL_STATUSES = ('cancelled', 'no_show', 'completed')


@receiver(pre_save, sender=Appointment)
def create_review_token_on_completion(sender, instance, **kwargs):
    """
    Cuando una cita cambia a estado 'completed':
    1. Crea un token de reseña único
    2. (Futuro) Envía mensaje por WhatsApp con el enlace

    Solo se ejecuta cuando el estado cambia DE otro estado A 'completed'.
    """
    # Solo procesar si es una actualización (no creación)
    if not instance.pk:
        return

    # Obtener el estado anterior
    try:
        old_instance = Appointment.objects.get(pk=instance.pk)
    except Appointment.DoesNotExist:
        return

    # Verificar si el estado cambió a 'completed'
    if old_instance.status != 'completed' and instance.status == 'completed':
        # Verificar que no exista ya un token para esta cita
        if not hasattr(instance, 'review_token') or not ReviewToken.objects.filter(appointment_id=instance.pk).exists():
            # Crear el token de reseña
            review_token = ReviewToken.create_for_appointment(instance)

            # TODO: Enviar WhatsApp con el enlace de reseña
            # La URL sería algo como: https://stylo.com/review/{token}
            # send_review_whatsapp(instance.client, review_token.token)

            print(f"[REVIEW TOKEN] Creado para cita #{instance.pk}: {review_token.token}")

    # Si la cita transiciona a un estado terminal, marcar reminders pendientes
    # como cancelados para que la task de Celery no los envíe.
    if (
        old_instance.status not in TERMINAL_STATUSES
        and instance.status in TERMINAL_STATUSES
    ):
        # Guardar referencia para procesar en post_save (cuando el cambio ya está commiteado)
        instance._cancel_pending_reminders = True

    # Si transiciona específicamente a 'cancelled' y la cita era futura,
    # disparar procesamiento de waitlist en post_save.
    if (
        old_instance.status != 'cancelled'
        and instance.status == 'cancelled'
        and instance.start_datetime > timezone.now()
    ):
        instance._notify_waitlist = True


@receiver(post_save, sender=Appointment)
def cancel_pending_reminders(sender, instance, created, **kwargs):
    """
    Cancela los recordatorios pendientes cuando una cita transiciona
    a un estado terminal (cancelled, no_show, completed).
    """
    if created:
        return
    if getattr(instance, '_cancel_pending_reminders', False):
        AppointmentReminder.objects.filter(
            appointment=instance,
            status='pending',
        ).update(status='cancelled')
        instance._cancel_pending_reminders = False


@receiver(post_save, sender=Appointment)
def notify_waitlist_on_cancellation(sender, instance, created, **kwargs):
    """
    Cuando una cita se cancela, busca al primer cliente en waitlist
    matcheable y le envía notificación con claim_token.

    Sólo dispara en transición A 'cancelled' (no cuando se crea ya
    cancelada o cuando se actualiza otro campo).
    """
    if created:
        return
    if not getattr(instance, '_notify_waitlist', False):
        return

    # Procesar dentro de la propia transacción del save() padre. Si el
    # caller llamó con transaction.atomic, la query select_for_update
    # del helper se ejecuta en ese mismo contexto.
    from .services import process_waitlist_for_appointment

    try:
        entry = process_waitlist_for_appointment(instance)
    except Exception as e:
        # No bloquear el flujo de cancelación si el waitlist falla.
        # Esto sucede en transition pre_save -> post_save: ya está
        # cancelada, el waitlist es un nice-to-have.
        import logging
        logging.getLogger(__name__).exception(
            'Error procesando waitlist tras cancelación de cita %s: %s',
            instance.pk, e,
        )
        entry = None

    instance._notify_waitlist = False

    # Dejar el entry disponible para que el caller envíe WhatsApp
    if entry:
        instance._waitlist_notified_entry = entry
