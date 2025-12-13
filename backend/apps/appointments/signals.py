"""
Señales para el módulo de citas.
Genera tokens de reseña cuando una cita se marca como completada.
"""
from django.db.models.signals import pre_save
from django.dispatch import receiver

from .models import Appointment
from apps.core.models import ReviewToken


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
