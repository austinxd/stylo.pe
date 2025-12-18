"""
Views para gestión de suscripciones.
"""
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView
from django.shortcuts import get_object_or_404

from .services import SubscriptionService, BillingService, CulqiError
from .models import BusinessSubscription, StaffSubscription, Invoice, PricingPlan, PaymentMethod
from .serializers import (
    SubscriptionSummarySerializer,
    InvoiceSerializer,
    InvoiceDetailSerializer,
    PricingPlanSerializer,
    PaymentMethodSerializer,
    PaymentMethodCreateSerializer
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

    @action(detail=False, methods=['get', 'post'])
    def payment_methods(self, request):
        """
        GET: Lista los métodos de pago del negocio.
        POST: Agrega un nuevo método de pago.
        """
        business = self.get_business(request)
        if not business:
            return Response(
                {'error': 'No tienes un negocio asociado'},
                status=status.HTTP_403_FORBIDDEN
            )

        if request.method == 'GET':
            methods = PaymentMethod.objects.filter(
                business=business,
                is_active=True
            ).order_by('-is_default', '-created_at')
            serializer = PaymentMethodSerializer(methods, many=True)
            return Response(serializer.data)

        # POST - Agregar método de pago
        serializer = PaymentMethodCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        billing_service = BillingService()
        try:
            payment_method, _ = billing_service.add_payment_method(
                business=business,
                card_token=serializer.validated_data['card_token'],
                set_as_default=serializer.validated_data['set_as_default']
            )
            return Response(
                PaymentMethodSerializer(payment_method).data,
                status=status.HTTP_201_CREATED
            )
        except CulqiError as e:
            return Response(
                {'error': e.message, 'code': e.code},
                status=status.HTTP_400_BAD_REQUEST
            )

    @action(detail=False, methods=['delete', 'post'], url_path='payment-methods/(?P<method_id>[^/.]+)/(?P<method_action>[^/.]+)?')
    def payment_method_actions(self, request, method_id=None, method_action=None):
        """
        DELETE /payment-methods/{id}/: Elimina un método de pago.
        POST /payment-methods/{id}/set-default/: Establece como método por defecto.
        """
        business = self.get_business(request)
        if not business:
            return Response(
                {'error': 'No tienes un negocio asociado'},
                status=status.HTTP_403_FORBIDDEN
            )

        payment_method = get_object_or_404(
            PaymentMethod,
            pk=method_id,
            business=business,
            is_active=True
        )

        if request.method == 'DELETE':
            billing_service = BillingService()
            billing_service.delete_payment_method(payment_method)
            return Response(status=status.HTTP_204_NO_CONTENT)

        if method_action == 'set-default':
            billing_service = BillingService()
            billing_service.set_default_payment_method(payment_method)
            return Response(PaymentMethodSerializer(payment_method).data)

        return Response(
            {'error': 'Acción no válida'},
            status=status.HTTP_400_BAD_REQUEST
        )

    @action(detail=False, methods=['get'], url_path='invoices/(?P<invoice_id>[^/.]+)')
    def invoice_detail(self, request, invoice_id=None):
        """
        GET /invoices/{id}/: Obtiene el detalle de una factura con line items.
        """
        business = self.get_business(request)
        if not business:
            return Response(
                {'error': 'No tienes un negocio asociado'},
                status=status.HTTP_403_FORBIDDEN
            )

        invoice = get_object_or_404(Invoice, pk=invoice_id, business=business)
        serializer = InvoiceDetailSerializer(invoice)
        return Response(serializer.data)

    @action(detail=False, methods=['post'], url_path='invoices/(?P<invoice_id>[^/.]+)/pay')
    def pay_invoice(self, request, invoice_id=None):
        """
        POST /invoices/{id}/pay/: Procesa el pago de una factura.
        Opcionalmente recibe payment_method_id para usar un método específico.
        """
        business = self.get_business(request)
        if not business:
            return Response(
                {'error': 'No tienes un negocio asociado'},
                status=status.HTTP_403_FORBIDDEN
            )

        invoice = get_object_or_404(Invoice, pk=invoice_id, business=business)

        if invoice.status == 'paid':
            return Response(
                {'error': 'Esta factura ya fue pagada'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Obtener método de pago (opcional)
        payment_method = None
        payment_method_id = request.data.get('payment_method_id')
        if payment_method_id:
            payment_method = get_object_or_404(
                PaymentMethod,
                pk=payment_method_id,
                business=business,
                is_active=True
            )

        billing_service = BillingService()
        success, payment = billing_service.process_invoice_payment(
            invoice=invoice,
            payment_method=payment_method
        )

        if success:
            return Response({
                'success': True,
                'message': 'Pago procesado exitosamente',
                'invoice': InvoiceDetailSerializer(invoice).data
            })
        else:
            return Response({
                'success': False,
                'error': payment.error_message or 'Error al procesar el pago',
                'payment_status': payment.status
            }, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=False, methods=['post'], url_path='staff/(?P<staff_sub_id>[^/.]+)/extend-trial')
    def extend_staff_trial(self, request, staff_sub_id=None):
        """
        POST /staff/{id}/extend-trial/: Extiende el trial de un profesional.
        Body: { "days": 7 }  (opcional, default 14 días)

        Útil para testing o para dar más tiempo sin necesidad de pago.
        """
        from datetime import timedelta
        from django.utils import timezone

        business = self.get_business(request)
        if not business:
            return Response(
                {'error': 'No tienes un negocio asociado'},
                status=status.HTTP_403_FORBIDDEN
            )

        staff_sub = get_object_or_404(
            StaffSubscription,
            pk=staff_sub_id,
            business=business
        )

        days = request.data.get('days', 14)
        try:
            days = int(days)
            if days < 1 or days > 365:
                raise ValueError()
        except (ValueError, TypeError):
            return Response(
                {'error': 'Los días deben ser un número entre 1 y 365'},
                status=status.HTTP_400_BAD_REQUEST
            )

        now = timezone.now()

        # Si el trial ya expiró, extender desde ahora
        if staff_sub.trial_ends_at and staff_sub.trial_ends_at < now:
            staff_sub.trial_ends_at = now + timedelta(days=days)
        else:
            # Si aún está en trial, sumar días
            staff_sub.trial_ends_at = (staff_sub.trial_ends_at or now) + timedelta(days=days)

        staff_sub.is_billable = False  # Volver a trial
        staff_sub.save()

        return Response({
            'success': True,
            'message': f'Trial extendido {days} días',
            'staff_subscription': {
                'id': staff_sub.id,
                'staff_name': staff_sub.staff.full_name,
                'trial_ends_at': staff_sub.trial_ends_at.isoformat(),
                'trial_days_remaining': staff_sub.trial_days_remaining,
                'is_billable': staff_sub.is_billable
            }
        })

    @action(detail=False, methods=['post'], url_path='staff/(?P<staff_sub_id>[^/.]+)/activate')
    def activate_staff(self, request, staff_sub_id=None):
        """
        POST /staff/{id}/activate/: Activa un profesional.

        Modelo MES VENCIDO (postpago):
        - No cobra inmediatamente
        - Solo marca is_billable=True y billable_since=hoy
        - La factura se genera el 1ero del mes siguiente
        - Requiere que el negocio tenga un método de pago configurado
        """
        from datetime import timedelta
        from django.utils import timezone

        business = self.get_business(request)
        if not business:
            return Response(
                {'error': 'No tienes un negocio asociado'},
                status=status.HTTP_403_FORBIDDEN
            )

        # Verificar que tiene método de pago (tarjeta o cortesía)
        has_payment_method = PaymentMethod.objects.filter(
            business=business,
            is_active=True
        ).exists()

        if not has_payment_method:
            return Response(
                {'error': 'Debes configurar un método de pago antes de activar profesionales. Agrega una tarjeta o contacta a soporte.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        staff_sub = get_object_or_404(
            StaffSubscription,
            pk=staff_sub_id,
            business=business
        )

        # Si ya está activo y billable, no hacer nada
        if staff_sub.is_active and staff_sub.is_billable:
            return Response({
                'success': True,
                'message': f'{staff_sub.staff.full_name} ya está activo',
                'staff_subscription': {
                    'id': staff_sub.id,
                    'staff_name': staff_sub.staff.full_name,
                    'is_active': staff_sub.is_active,
                    'is_billable': staff_sub.is_billable,
                    'billable_since': str(staff_sub.billable_since) if staff_sub.billable_since else None
                }
            })

        now = timezone.now()
        today = now.date()

        # Activar el profesional
        staff_sub.is_active = True
        staff_sub.is_billable = True
        staff_sub.billable_since = today
        staff_sub.deactivated_at = None  # Limpiar si estaba desactivado
        staff_sub.trial_ends_at = now + timedelta(days=365)  # Extender trial
        staff_sub.save()

        # Actualizar suscripción del negocio
        try:
            business_sub = business.subscription
            if business_sub.status in ['trial', 'past_due', 'suspended']:
                business_sub.status = 'active'
                business_sub.save()
        except BusinessSubscription.DoesNotExist:
            pass

        return Response({
            'success': True,
            'message': f'{staff_sub.staff.full_name} activado. Se facturará a fin de mes.',
            'staff_subscription': {
                'id': staff_sub.id,
                'staff_name': staff_sub.staff.full_name,
                'is_active': staff_sub.is_active,
                'is_billable': staff_sub.is_billable,
                'billable_since': str(staff_sub.billable_since)
            }
        })

    @action(detail=False, methods=['post'], url_path='activate-all')
    def activate_all_staff(self, request):
        """
        POST /activate-all/: Activa todos los profesionales con trial vencido.

        Modelo MES VENCIDO (postpago):
        - No cobra inmediatamente
        - Solo marca is_billable=True y billable_since=hoy
        - La factura se genera el 1ero del mes siguiente
        - Requiere que el negocio tenga un método de pago configurado
        """
        from datetime import timedelta
        from django.utils import timezone

        business = self.get_business(request)
        if not business:
            return Response(
                {'error': 'No tienes un negocio asociado'},
                status=status.HTTP_403_FORBIDDEN
            )

        # Verificar que tiene método de pago (tarjeta o cortesía)
        has_payment_method = PaymentMethod.objects.filter(
            business=business,
            is_active=True
        ).exists()

        if not has_payment_method:
            return Response(
                {'error': 'Debes configurar un método de pago antes de activar profesionales. Agrega una tarjeta o contacta a soporte.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        now = timezone.now()
        today = now.date()
        count = 0

        # Solo activar los que tienen trial vencido y no están billable
        staff_subs = StaffSubscription.objects.filter(
            business=business,
            is_billable=False,
            trial_ends_at__lte=now
        )

        for staff_sub in staff_subs:
            staff_sub.is_active = True
            staff_sub.is_billable = True
            staff_sub.billable_since = today
            staff_sub.deactivated_at = None
            staff_sub.trial_ends_at = now + timedelta(days=365)
            staff_sub.save()
            count += 1

        if count == 0:
            return Response({
                'success': True,
                'message': 'No hay profesionales pendientes de activar',
                'activated_count': 0
            })

        # Actualizar suscripción del negocio
        try:
            business_sub = business.subscription
            business_sub.status = 'active'
            business_sub.save()
        except BusinessSubscription.DoesNotExist:
            pass

        return Response({
            'success': True,
            'message': f'{count} profesionales activados. Se facturarán a fin de mes.',
            'activated_count': count
        })

    @action(detail=False, methods=['post'], url_path='staff/(?P<staff_sub_id>[^/.]+)/deactivate')
    def deactivate_staff(self, request, staff_sub_id=None):
        """
        POST /staff/{id}/deactivate/: Desactiva un profesional.

        Modelo MES VENCIDO (postpago):
        - Marca deactivated_at=hoy, is_active=False
        - La factura del próximo mes solo cobrará los días activos
        - El profesional no podrá recibir citas mientras esté desactivado
        """
        from django.utils import timezone

        business = self.get_business(request)
        if not business:
            return Response(
                {'error': 'No tienes un negocio asociado'},
                status=status.HTTP_403_FORBIDDEN
            )

        staff_sub = get_object_or_404(
            StaffSubscription,
            pk=staff_sub_id,
            business=business
        )

        # Si ya está desactivado, no hacer nada
        if not staff_sub.is_active:
            return Response({
                'success': True,
                'message': f'{staff_sub.staff.full_name} ya está desactivado',
                'staff_subscription': {
                    'id': staff_sub.id,
                    'staff_name': staff_sub.staff.full_name,
                    'is_active': staff_sub.is_active,
                    'is_billable': staff_sub.is_billable,
                    'deactivated_at': str(staff_sub.deactivated_at) if staff_sub.deactivated_at else None
                }
            })

        today = timezone.now().date()

        # Desactivar el profesional
        staff_sub.is_active = False
        staff_sub.deactivated_at = today
        staff_sub.save()

        # También desactivar el StaffMember para que no reciba citas
        staff_member = staff_sub.staff
        staff_member.is_active = False
        staff_member.save()

        return Response({
            'success': True,
            'message': f'{staff_sub.staff.full_name} desactivado. Solo se facturarán los días activos del mes.',
            'staff_subscription': {
                'id': staff_sub.id,
                'staff_name': staff_sub.staff.full_name,
                'is_active': staff_sub.is_active,
                'is_billable': staff_sub.is_billable,
                'deactivated_at': str(staff_sub.deactivated_at)
            }
        })
