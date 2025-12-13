"""
Signals para gestionar suscripciones automáticamente.
"""
from django.db.models.signals import post_save, pre_save
from django.dispatch import receiver

from apps.accounts.models import StaffMember
from .services import SubscriptionService


@receiver(post_save, sender=StaffMember)
def register_staff_subscription(sender, instance, created, **kwargs):
    """
    Registra automáticamente un profesional en la suscripción
    cuando es agregado a un negocio.
    """
    # Solo si tiene un negocio asignado y está activo
    if instance.current_business and instance.employment_status == 'active':
        SubscriptionService.register_staff_to_subscription(
            staff=instance,
            business=instance.current_business
        )


@receiver(pre_save, sender=StaffMember)
def check_staff_status_change(sender, instance, **kwargs):
    """
    Detecta cambios en el estado del profesional para
    actualizar su suscripción.
    """
    if not instance.pk:
        return  # Es nuevo, se manejará en post_save

    try:
        old_instance = StaffMember.objects.get(pk=instance.pk)
    except StaffMember.DoesNotExist:
        return

    # Si cambió de activo a otro estado, desactivar suscripción
    if old_instance.employment_status == 'active' and instance.employment_status != 'active':
        if old_instance.current_business:
            SubscriptionService.deactivate_staff_subscription(
                staff=instance,
                business=old_instance.current_business
            )

    # Si cambió de negocio
    if old_instance.current_business != instance.current_business:
        # Desactivar en el negocio anterior
        if old_instance.current_business:
            SubscriptionService.deactivate_staff_subscription(
                staff=instance,
                business=old_instance.current_business
            )
        # La activación en el nuevo negocio se hará en post_save
