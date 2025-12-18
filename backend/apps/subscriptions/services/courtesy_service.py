"""
Servicio para gestionar acceso cortesía de negocios.

El acceso cortesía permite a un negocio "pagar" facturas sin una tarjeta real.
Se crea un método de pago virtual "Cortesía Stylo" que pueden usar para pagar.
"""
from datetime import timedelta
from django.utils import timezone

from apps.core.models import Business
from ..models import BusinessSubscription, PaymentMethod


class CourtesyService:
    """Servicio para gestionar acceso cortesía."""

    @staticmethod
    def enable_courtesy(business: Business, days: int = None, reason: str = '') -> BusinessSubscription:
        """
        Habilita el acceso cortesía para un negocio.

        Args:
            business: El negocio
            days: Cantidad de días de cortesía (None = sin límite)
            reason: Motivo de la cortesía

        Returns:
            La suscripción actualizada
        """
        # Obtener o crear suscripción
        subscription, _ = BusinessSubscription.objects.get_or_create(
            business=business,
            defaults={'status': 'active'}
        )

        # Actualizar campos de cortesía
        subscription.has_courtesy_access = True
        if days:
            subscription.courtesy_until = timezone.now().date() + timedelta(days=days)
        else:
            subscription.courtesy_until = None
        subscription.courtesy_reason = reason

        # Si estaba suspendida o past_due, activarla
        if subscription.status in ['suspended', 'past_due']:
            subscription.status = 'active'

        subscription.save()

        # Crear método de pago cortesía
        CourtesyService._ensure_courtesy_payment_method(business)

        return subscription

    @staticmethod
    def disable_courtesy(business: Business) -> BusinessSubscription:
        """
        Desactiva el acceso cortesía para un negocio.

        Args:
            business: El negocio

        Returns:
            La suscripción actualizada
        """
        try:
            subscription = business.subscription
        except BusinessSubscription.DoesNotExist:
            return None

        subscription.has_courtesy_access = False
        subscription.courtesy_until = None
        subscription.save()

        # Eliminar método de pago cortesía
        CourtesyService._remove_courtesy_payment_method(business)

        return subscription

    @staticmethod
    def _ensure_courtesy_payment_method(business: Business) -> PaymentMethod:
        """
        Asegura que exista un método de pago cortesía para el negocio.
        Si ya existe, lo retorna. Si no, lo crea.
        """
        # Buscar si ya existe
        courtesy_method = PaymentMethod.objects.filter(
            business=business,
            method_type='courtesy',
            is_active=True
        ).first()

        if courtesy_method:
            return courtesy_method

        # Crear nuevo método de pago cortesía
        courtesy_method = PaymentMethod.objects.create(
            business=business,
            method_type='courtesy',
            brand='courtesy',
            card_type='',
            last_four='',
            holder_name='Cortesía Stylo',
            is_default=True,  # Siempre es el default cuando está activo
            is_active=True
        )

        return courtesy_method

    @staticmethod
    def _remove_courtesy_payment_method(business: Business):
        """
        Elimina (desactiva) el método de pago cortesía de un negocio.
        """
        PaymentMethod.objects.filter(
            business=business,
            method_type='courtesy'
        ).update(is_active=False, is_default=False)

        # Si había otro método de pago, hacerlo default
        other_method = PaymentMethod.objects.filter(
            business=business,
            method_type='card',
            is_active=True
        ).first()
        if other_method:
            other_method.is_default = True
            other_method.save()

    @staticmethod
    def get_courtesy_payment_method(business: Business) -> PaymentMethod:
        """
        Obtiene el método de pago cortesía activo del negocio.

        Returns:
            El PaymentMethod de cortesía o None si no existe/no está activo
        """
        try:
            subscription = business.subscription
            if not subscription.is_courtesy_active:
                return None
        except BusinessSubscription.DoesNotExist:
            return None

        return PaymentMethod.objects.filter(
            business=business,
            method_type='courtesy',
            is_active=True
        ).first()

    @staticmethod
    def can_pay_with_courtesy(business: Business) -> bool:
        """
        Verifica si el negocio puede pagar con cortesía.
        """
        try:
            return business.subscription.is_courtesy_active
        except BusinessSubscription.DoesNotExist:
            return False
