"""
Views para gestión de suscripciones.
"""
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated

from .services import SubscriptionService
from .models import BusinessSubscription, StaffSubscription, Invoice, PricingPlan
from .serializers import (
    SubscriptionSummarySerializer,
    InvoiceSerializer,
    PricingPlanSerializer
)


class SubscriptionViewSet(viewsets.ViewSet):
    """
    API para gestión de suscripciones del negocio.
    Solo accesible por dueños de negocio.
    """
    permission_classes = [IsAuthenticated]

    def get_business(self, request):
        """Obtiene el negocio del usuario autenticado."""
        user = request.user
        if user.role == 'business_owner':
            return user.owned_businesses.first()
        elif user.role == 'branch_manager' and hasattr(user, 'staff_profile'):
            return user.staff_profile.current_business
        return None

    @action(detail=False, methods=['get'])
    def summary(self, request):
        """
        Obtiene el resumen de la suscripción del negocio.
        Incluye: estado, staff, costos, facturas pendientes.
        """
        business = self.get_business(request)
        if not business:
            return Response(
                {'error': 'No tienes un negocio asociado'},
                status=status.HTTP_403_FORBIDDEN
            )

        summary = SubscriptionService.get_subscription_summary(business)
        return Response(summary)

    @action(detail=False, methods=['get'])
    def invoices(self, request):
        """Lista todas las facturas del negocio."""
        business = self.get_business(request)
        if not business:
            return Response(
                {'error': 'No tienes un negocio asociado'},
                status=status.HTTP_403_FORBIDDEN
            )

        invoices = Invoice.objects.filter(business=business).order_by('-created_at')
        serializer = InvoiceSerializer(invoices, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=['get'])
    def pricing(self, request):
        """Obtiene el plan de precios actual."""
        plan = PricingPlan.get_active_plan()
        if not plan:
            return Response({'error': 'No hay plan de precios configurado'}, status=404)

        serializer = PricingPlanSerializer(plan)
        return Response(serializer.data)

    @action(detail=False, methods=['get'])
    def alerts(self, request):
        """
        Obtiene alertas y recordatorios de suscripción.
        - Pago pendiente
        - Trials por vencer
        - Suscripción suspendida
        """
        business = self.get_business(request)
        if not business:
            return Response({'alerts': []})

        alerts = []

        try:
            subscription = business.subscription
        except BusinessSubscription.DoesNotExist:
            subscription = SubscriptionService.get_or_create_business_subscription(business)

        # Alerta de pago pendiente
        if subscription.status == 'past_due':
            pending_invoices = Invoice.objects.filter(
                business=business,
                status='pending'
            )
            total_pending = sum(inv.total for inv in pending_invoices)
            alerts.append({
                'type': 'payment_due',
                'severity': 'warning',
                'title': 'Pago pendiente',
                'message': f'Tienes S/ {total_pending} en facturas pendientes. Realiza el pago para seguir recibiendo reservas.',
                'action': 'pay',
                'action_label': 'Pagar ahora'
            })

        # Alerta de suscripción suspendida
        if subscription.status == 'suspended':
            alerts.append({
                'type': 'suspended',
                'severity': 'error',
                'title': 'Suscripción suspendida',
                'message': 'Tu suscripción ha sido suspendida por falta de pago. No puedes recibir nuevas reservas.',
                'action': 'pay',
                'action_label': 'Reactivar suscripción'
            })

        # Alertas de trials por vencer (próximos 3 días)
        from django.utils import timezone
        from datetime import timedelta

        expiring_trials = StaffSubscription.objects.filter(
            business=business,
            is_active=True,
            is_billable=False,
            trial_ends_at__lte=timezone.now() + timedelta(days=3),
            trial_ends_at__gt=timezone.now()
        ).select_related('staff')

        for trial in expiring_trials:
            days = trial.trial_days_remaining
            alerts.append({
                'type': 'trial_expiring',
                'severity': 'info',
                'title': f'Trial de {trial.staff.first_name} por vencer',
                'message': f'El período de prueba de {trial.staff.full_name} vence en {days} día{"s" if days != 1 else ""}.',
                'staff_id': trial.staff.id
            })

        # Info de próxima facturación
        if subscription.next_billing_date and subscription.status == 'active':
            plan = PricingPlan.get_active_plan()
            if plan:
                monthly_cost = subscription.calculate_monthly_cost()
                alerts.append({
                    'type': 'upcoming_billing',
                    'severity': 'info',
                    'title': 'Próxima facturación',
                    'message': f'El {subscription.next_billing_date.strftime("%d/%m/%Y")} se facturarán S/ {monthly_cost} por {subscription.billable_staff_count} profesional{"es" if subscription.billable_staff_count != 1 else ""}.',
                })

        return Response({'alerts': alerts})
