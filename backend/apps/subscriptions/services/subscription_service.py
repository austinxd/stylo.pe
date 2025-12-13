"""
Servicio de suscripciones.
Gestiona la lógica de negocio de suscripciones, trials y facturación.
"""
from decimal import Decimal
from datetime import timedelta
import calendar
from django.utils import timezone
from django.db import transaction

from apps.core.models import Business
from apps.accounts.models import StaffMember
from ..models import PricingPlan, BusinessSubscription, StaffSubscription, Invoice


class SubscriptionService:
    """Servicio para gestionar suscripciones."""

    @staticmethod
    def get_or_create_business_subscription(business: Business) -> BusinessSubscription:
        """Obtiene o crea la suscripción de un negocio."""
        subscription, created = BusinessSubscription.objects.get_or_create(
            business=business,
            defaults={'status': 'trial'}
        )
        return subscription

    @staticmethod
    def register_staff_to_subscription(staff: StaffMember, business: Business) -> StaffSubscription:
        """
        Registra un profesional en la suscripción del negocio.
        Le asigna su período de prueba individual.
        """
        # Asegurar que existe la suscripción del negocio
        business_sub = SubscriptionService.get_or_create_business_subscription(business)

        # Obtener días de trial del plan activo
        plan = PricingPlan.get_active_plan()
        trial_days = plan.trial_days if plan else 14

        # Crear o actualizar la suscripción del staff
        staff_sub, created = StaffSubscription.objects.update_or_create(
            business=business,
            staff=staff,
            defaults={
                'trial_ends_at': timezone.now() + timedelta(days=trial_days),
                'is_active': True,
                'is_billable': False
            }
        )

        # Si es el primer staff, establecer trial_ends_at del negocio
        if not business_sub.trial_ends_at:
            business_sub.trial_ends_at = staff_sub.trial_ends_at
            business_sub.save()

        return staff_sub

    @staticmethod
    def deactivate_staff_subscription(staff: StaffMember, business: Business):
        """Desactiva la suscripción de un profesional (cuando lo quitan del equipo)."""
        try:
            staff_sub = StaffSubscription.objects.get(business=business, staff=staff)
            staff_sub.is_active = False
            staff_sub.save()
        except StaffSubscription.DoesNotExist:
            pass

    @staticmethod
    def can_receive_bookings(business: Business) -> tuple[bool, str]:
        """
        Verifica si un negocio puede recibir reservas.
        Retorna (puede_recibir, mensaje_error).
        """
        try:
            subscription = business.subscription
        except BusinessSubscription.DoesNotExist:
            # Si no tiene suscripción, crear una en trial
            subscription = SubscriptionService.get_or_create_business_subscription(business)

        # Actualizar estado si es necesario
        subscription.check_and_update_status()

        if subscription.status in ['trial', 'active']:
            return True, ''
        elif subscription.status == 'past_due':
            return False, 'Tu suscripción tiene un pago pendiente. Por favor actualiza tu método de pago para seguir recibiendo reservas.'
        elif subscription.status == 'suspended':
            return False, 'Tu suscripción ha sido suspendida por falta de pago. Contacta a soporte para reactivarla.'
        elif subscription.status == 'cancelled':
            return False, 'Tu suscripción ha sido cancelada. Contacta a soporte para reactivarla.'
        else:
            return False, 'Estado de suscripción desconocido.'

    @staticmethod
    def check_all_trials():
        """
        Revisa todos los trials y actualiza los que han expirado.
        Debe ejecutarse diariamente via cron/celery.
        """
        now = timezone.now()

        # Actualizar staff subscriptions que expiraron
        expired_trials = StaffSubscription.objects.filter(
            is_billable=False,
            is_active=True,
            trial_ends_at__lte=now
        )

        for staff_sub in expired_trials:
            staff_sub.is_billable = True
            staff_sub.billable_since = now.date()
            staff_sub.save()

        # Actualizar business subscriptions
        for business_sub in BusinessSubscription.objects.filter(status='trial'):
            business_sub.check_and_update_status()

    @staticmethod
    @transaction.atomic
    def generate_monthly_invoices():
        """
        Genera las facturas mensuales para todos los negocios.
        Debe ejecutarse el primer día de cada mes.
        """
        plan = PricingPlan.get_active_plan()
        if not plan:
            return []

        today = timezone.now().date()
        # Período: mes anterior
        if today.month == 1:
            period_start = today.replace(year=today.year - 1, month=12, day=1)
        else:
            period_start = today.replace(month=today.month - 1, day=1)

        days_in_period = calendar.monthrange(period_start.year, period_start.month)[1]
        period_end = period_start.replace(day=days_in_period)

        invoices_created = []

        for business_sub in BusinessSubscription.objects.filter(status__in=['active', 'past_due']):
            # Contar staff billable
            billable_count = business_sub.billable_staff_count
            if billable_count == 0:
                continue

            # Calcular total
            subtotal = plan.price_per_staff * billable_count
            total = subtotal  # Aquí se podrían agregar impuestos

            # Crear factura
            invoice = Invoice.objects.create(
                business=business_sub.business,
                period_start=period_start,
                period_end=period_end,
                staff_count=billable_count,
                price_per_staff=plan.price_per_staff,
                subtotal=subtotal,
                total=total,
                currency=plan.currency,
                due_date=today + timedelta(days=7),  # 7 días para pagar
                status='pending'
            )
            invoices_created.append(invoice)

            # Actualizar próxima fecha de facturación
            next_month = today.month + 1
            next_year = today.year
            if next_month > 12:
                next_month = 1
                next_year += 1
            business_sub.next_billing_date = today.replace(year=next_year, month=next_month, day=1)
            business_sub.save()

        return invoices_created

    @staticmethod
    @transaction.atomic
    def generate_prorated_invoice(business: Business) -> Invoice | None:
        """
        Genera una factura prorrateada cuando terminan los trials.
        Se llama cuando el primer staff de un negocio termina su trial.
        """
        plan = PricingPlan.get_active_plan()
        if not plan:
            return None

        try:
            business_sub = business.subscription
        except BusinessSubscription.DoesNotExist:
            return None

        # Contar staff que recién se volvieron billable
        billable_count = business_sub.billable_staff_count
        if billable_count == 0:
            return None

        today = timezone.now().date()

        # Calcular días restantes del mes
        days_in_month = calendar.monthrange(today.year, today.month)[1]
        days_remaining = days_in_month - today.day + 1

        # Período prorrateado
        period_start = today
        period_end = today.replace(day=days_in_month)

        # Calcular monto prorrateado
        daily_rate = plan.price_per_staff / Decimal(days_in_month)
        subtotal = (daily_rate * days_remaining * billable_count).quantize(Decimal('0.01'))
        total = subtotal

        # Crear factura prorrateada
        invoice = Invoice.objects.create(
            business=business,
            period_start=period_start,
            period_end=period_end,
            staff_count=billable_count,
            price_per_staff=plan.price_per_staff,
            subtotal=subtotal,
            is_prorated=True,
            prorated_days=days_remaining,
            total=total,
            currency=plan.currency,
            due_date=today + timedelta(days=7),
            status='pending'
        )

        # Actualizar estado de la suscripción
        business_sub.status = 'past_due'
        business_sub.next_billing_date = period_end + timedelta(days=1)
        business_sub.save()

        return invoice

    @staticmethod
    def get_subscription_summary(business: Business) -> dict:
        """Obtiene un resumen de la suscripción del negocio."""
        try:
            subscription = business.subscription
        except BusinessSubscription.DoesNotExist:
            subscription = SubscriptionService.get_or_create_business_subscription(business)

        plan = PricingPlan.get_active_plan()

        # Obtener staff subscriptions
        staff_subs = StaffSubscription.objects.filter(
            business=business,
            is_active=True
        ).select_related('staff')

        staff_details = []
        for ss in staff_subs:
            # Obtener URL de foto si existe
            staff_photo = None
            if ss.staff.photo:
                staff_photo = ss.staff.photo.url

            staff_details.append({
                'id': ss.id,
                'staff': ss.staff.id,
                'staff_name': ss.staff.full_name,
                'staff_photo': staff_photo,
                'added_at': ss.added_at.isoformat() if ss.added_at else None,
                'trial_ends_at': ss.trial_ends_at.isoformat() if ss.trial_ends_at else None,
                'trial_days_remaining': ss.trial_days_remaining,
                'is_billable': ss.is_billable,
                'billable_since': ss.billable_since.isoformat() if ss.billable_since else None,
                'is_active': ss.is_active,
            })

        # Facturas pendientes
        pending_invoices = Invoice.objects.filter(
            business=business,
            status='pending'
        ).order_by('-created_at')

        return {
            'status': subscription.status,
            'status_display': subscription.get_status_display(),
            'can_receive_bookings': subscription.is_active,
            'active_staff_count': subscription.active_staff_count,
            'billable_staff_count': subscription.billable_staff_count,
            'monthly_cost': str(subscription.calculate_monthly_cost()),
            'next_billing_date': subscription.next_billing_date,
            'last_payment_date': subscription.last_payment_date,
            'last_payment_amount': str(subscription.last_payment_amount) if subscription.last_payment_amount else None,
            'plan': {
                'name': plan.name if plan else None,
                'price_per_staff': str(plan.price_per_staff) if plan else None,
                'trial_days': plan.trial_days if plan else None,
                'currency': plan.currency if plan else None,
            } if plan else None,
            'staff': staff_details,
            'pending_invoices': [
                {
                    'id': inv.id,
                    'period': f"{inv.period_start} - {inv.period_end}",
                    'total': str(inv.total),
                    'due_date': inv.due_date,
                    'is_prorated': inv.is_prorated,
                }
                for inv in pending_invoices
            ],
        }
