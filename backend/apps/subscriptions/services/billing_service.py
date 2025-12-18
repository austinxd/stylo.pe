"""
Servicio de facturación.
Gestiona la generación de facturas, procesamiento de pagos y métodos de pago.
"""
import logging
import calendar
from decimal import Decimal, ROUND_HALF_UP
from datetime import timedelta
from typing import Optional, Tuple

from django.utils import timezone
from django.db import transaction
from django.db.models import Q

from apps.core.models import Business
from apps.accounts.models import StaffMember
from ..models import (
    PricingPlan,
    BusinessSubscription,
    StaffSubscription,
    Invoice,
    InvoiceLineItem,
    PaymentMethod,
    Payment
)
from .culqi_service import CulqiService, CulqiError


logger = logging.getLogger(__name__)


class BillingService:
    """
    Servicio para gestionar facturación y pagos.

    Responsabilidades:
    - Generar facturas mensuales con prorrateo
    - Procesar pagos con Culqi
    - Gestionar métodos de pago
    - Manejar reintentos de pago
    """

    def __init__(self):
        self.culqi = CulqiService()

    # ==================== PAYMENT METHODS ====================

    @transaction.atomic
    def add_payment_method(
        self,
        business: Business,
        card_token: str,
        set_as_default: bool = True
    ) -> Tuple[PaymentMethod, dict]:
        """
        Agrega un método de pago (tarjeta) a un negocio.

        Flujo:
        1. Crear/obtener Customer en Culqi
        2. Crear Card en Culqi
        3. Guardar PaymentMethod en DB

        Args:
            business: Negocio
            card_token: Token de tarjeta generado por Culqi.js
            set_as_default: Si debe ser el método por defecto

        Returns:
            Tuple de (PaymentMethod creado, respuesta de Culqi)
        """
        # 1. Obtener o crear Customer en Culqi
        owner = business.owner
        customer_data = self.culqi.create_or_get_customer(
            email=business.email or owner.email,
            first_name=owner.first_name or business.name,
            last_name=owner.last_name or "",
            phone=business.phone,
            metadata={"business_id": str(business.id)}
        )
        culqi_customer_id = customer_data["id"]

        # 2. Crear Card en Culqi
        card_data = self.culqi.create_card(
            customer_id=culqi_customer_id,
            token_id=card_token,
            metadata={"business_id": str(business.id)}
        )

        # 3. Extraer datos de la tarjeta
        card_info = card_data.get("source", card_data)
        iin = card_info.get("iin", {})

        # Si es default, desmarcar otros
        if set_as_default:
            PaymentMethod.objects.filter(
                business=business,
                is_default=True
            ).update(is_default=False)

        # 4. Crear PaymentMethod en DB
        payment_method = PaymentMethod.objects.create(
            business=business,
            culqi_customer_id=culqi_customer_id,
            culqi_card_id=card_data["id"],
            card_type=iin.get("card_type", "credit").lower(),
            brand=iin.get("card_brand", "unknown").lower(),
            last_four=card_info.get("last_four", "****"),
            holder_name=card_info.get("card_holder_name", ""),
            expiration_month=card_info.get("expiration_month", 0),
            expiration_year=card_info.get("expiration_year", 0),
            is_default=set_as_default
        )

        logger.info(f"Payment method added for business {business.id}: {payment_method.card_display}")

        return payment_method, card_data

    def delete_payment_method(self, payment_method: PaymentMethod) -> bool:
        """
        Elimina un método de pago.

        Args:
            payment_method: Método de pago a eliminar

        Returns:
            True si se eliminó correctamente
        """
        try:
            # Eliminar en Culqi
            self.culqi.delete_card(payment_method.culqi_card_id)
        except CulqiError as e:
            logger.warning(f"Could not delete card in Culqi: {e.message}")
            # Continuar con la eliminación local

        # Si era default, buscar otro para marcar como default
        business = payment_method.business
        was_default = payment_method.is_default

        # Eliminar en DB
        payment_method.is_active = False
        payment_method.save()

        if was_default:
            # Marcar otro como default si existe
            other = PaymentMethod.objects.filter(
                business=business,
                is_active=True
            ).first()
            if other:
                other.is_default = True
                other.save()

        logger.info(f"Payment method deactivated: {payment_method.id}")
        return True

    def set_default_payment_method(self, payment_method: PaymentMethod) -> None:
        """Establece un método de pago como el default."""
        PaymentMethod.objects.filter(
            business=payment_method.business,
            is_default=True
        ).update(is_default=False)

        payment_method.is_default = True
        payment_method.save()

    # ==================== INVOICE GENERATION ====================

    @transaction.atomic
    def generate_monthly_invoice(self, business: Business, for_date: 'date' = None) -> Optional[Invoice]:
        """
        Genera la factura mensual para un negocio (MES VENCIDO).

        Calcula el uso del mes anterior con prorrateo individual por profesional.
        Usa el método calculate_active_days de StaffSubscription que considera:
        - billable_since: fecha desde que empezó a ser facturable
        - deactivated_at: fecha en que fue desactivado (si aplica)

        Args:
            business: Negocio
            for_date: Fecha de referencia (default: hoy, factura del mes anterior)

        Returns:
            Invoice creada o None si no hay nada que facturar
        """
        plan = PricingPlan.get_active_plan()
        if not plan:
            logger.error("No active pricing plan found")
            return None

        # Determinar período de facturación (mes anterior)
        today = for_date or timezone.now().date()
        if today.month == 1:
            period_start = today.replace(year=today.year - 1, month=12, day=1)
        else:
            period_start = today.replace(month=today.month - 1, day=1)

        days_in_period = calendar.monthrange(period_start.year, period_start.month)[1]
        period_end = period_start.replace(day=days_in_period)

        # Verificar que no exista factura para este período
        existing = Invoice.objects.filter(
            business=business,
            period_start=period_start,
            period_end=period_end
        ).exists()

        if existing:
            logger.warning(f"Invoice already exists for {business.id} period {period_start}")
            return None

        # Obtener todos los StaffSubscription que fueron billable en algún momento del período
        # Incluye: activos actuales Y desactivados durante el período
        staff_subs = StaffSubscription.objects.filter(
            business=business,
            is_billable=True
        ).filter(
            # billable_since debe ser <= fin del período
            Q(billable_since__lte=period_end) &
            # Y no debe haber sido desactivado antes del inicio del período
            (Q(deactivated_at__isnull=True) | Q(deactivated_at__gte=period_start))
        ).select_related('staff')

        if not staff_subs:
            logger.info(f"No billable staff for {business.id}")
            return None

        # Calcular tarifa diaria
        monthly_rate = plan.price_per_staff
        daily_rate = (monthly_rate / Decimal(days_in_period)).quantize(
            Decimal('0.0001'), rounding=ROUND_HALF_UP
        )

        # Crear factura
        invoice = Invoice.objects.create(
            business=business,
            period_start=period_start,
            period_end=period_end,
            staff_count=0,  # Se actualiza después
            price_per_staff=monthly_rate,
            subtotal=Decimal('0'),
            total=Decimal('0'),
            currency=plan.currency,
            due_date=today + timedelta(days=7),
            status='pending'
        )

        # Crear line items por cada profesional
        total_amount = Decimal('0')
        staff_count = 0

        for staff_sub in staff_subs:
            # Usar el método calculate_active_days que considera billable_since y deactivated_at
            days_active = staff_sub.calculate_active_days(period_start, period_end)

            # Si no estuvo activo ningún día, no incluir
            if days_active == 0:
                continue

            # Calcular fechas de línea para mostrar en la factura
            line_start = max(staff_sub.billable_since or period_start, period_start)
            if staff_sub.deactivated_at:
                line_end = min(staff_sub.deactivated_at, period_end)
            else:
                line_end = period_end

            # Subtotal del line item
            subtotal = (daily_rate * days_active).quantize(
                Decimal('0.01'), rounding=ROUND_HALF_UP
            )

            # Crear line item
            InvoiceLineItem.objects.create(
                invoice=invoice,
                staff=staff_sub.staff,
                staff_name=staff_sub.staff.full_name,
                period_start=line_start,
                period_end=line_end,
                days_in_period=days_in_period,
                days_active=days_active,
                monthly_rate=monthly_rate,
                daily_rate=daily_rate,
                subtotal=subtotal,
                description=f"Suscripción profesional: {staff_sub.staff.full_name}"
            )

            total_amount += subtotal
            staff_count += 1

        # Si no hay line items, eliminar la factura
        if staff_count == 0:
            invoice.delete()
            return None

        # Actualizar totales
        invoice.staff_count = staff_count
        invoice.subtotal = total_amount
        invoice.total = total_amount  # Aquí se podrían agregar impuestos
        invoice.save()

        logger.info(f"Invoice {invoice.id} generated for {business.id}: {invoice.total} {invoice.currency}")

        return invoice

    # ==================== PAYMENT PROCESSING ====================

    def process_invoice_payment(
        self,
        invoice: Invoice,
        payment_method: PaymentMethod = None
    ) -> Tuple[bool, Payment]:
        """
        Procesa el pago de una factura.

        Args:
            invoice: Factura a pagar
            payment_method: Método de pago (default: el default del negocio)

        Returns:
            Tuple de (éxito, Payment)
        """
        business = invoice.business

        # Obtener método de pago
        if not payment_method:
            payment_method = PaymentMethod.objects.filter(
                business=business,
                is_active=True,
                is_default=True
            ).first()

        if not payment_method:
            logger.warning(f"No payment method for business {business.id}")
            # Crear Payment fallido
            payment = Payment.objects.create(
                invoice=invoice,
                amount=invoice.total,
                amount_cents=CulqiService.amount_to_cents(invoice.total),
                status='failed',
                error_message="No hay método de pago configurado"
            )
            return False, payment

        # Si es método de pago cortesía, procesar sin Culqi
        if payment_method.method_type == 'courtesy':
            return self._process_courtesy_payment(invoice, payment_method)

        # Verificar intentos máximos
        if invoice.payment_attempts >= invoice.max_payment_attempts:
            logger.warning(f"Max payment attempts reached for invoice {invoice.id}")
            payment = Payment.objects.create(
                invoice=invoice,
                payment_method=payment_method,
                amount=invoice.total,
                amount_cents=CulqiService.amount_to_cents(invoice.total),
                status='failed',
                error_message="Máximo de intentos alcanzado"
            )
            invoice.status = 'failed'
            invoice.save()
            return False, payment

        # Crear registro de Payment
        amount_cents = CulqiService.amount_to_cents(invoice.total)
        payment = Payment.objects.create(
            invoice=invoice,
            payment_method=payment_method,
            amount=invoice.total,
            amount_cents=amount_cents,
            status='pending'
        )

        # Incrementar contador de intentos
        invoice.payment_attempts += 1
        invoice.save()

        try:
            # Procesar pago con Culqi
            period = f"{invoice.period_start.strftime('%Y-%m')}"
            charge_data = self.culqi.process_subscription_payment(
                card_id=payment_method.culqi_card_id,
                amount=invoice.total,
                email=business.email or business.owner.email,
                business_name=business.name,
                invoice_id=invoice.id,
                period=period
            )

            # Actualizar Payment con respuesta exitosa
            payment.culqi_charge_id = charge_data["id"]
            payment.status = 'succeeded'
            payment.culqi_response_code = charge_data.get("outcome", {}).get("code", "")
            payment.culqi_full_response = charge_data
            payment.processed_at = timezone.now()
            payment.save()

            # Actualizar Invoice
            invoice.status = 'paid'
            invoice.paid_at = timezone.now()
            invoice.payment_method_used = payment_method
            invoice.save()

            # Actualizar BusinessSubscription
            self._update_subscription_after_payment(business, invoice)

            logger.info(f"Payment successful for invoice {invoice.id}: {charge_data['id']}")
            return True, payment

        except CulqiError as e:
            # Actualizar Payment con error
            payment.status = 'failed'
            payment.error_message = e.message
            payment.culqi_response_code = e.code or ''
            payment.culqi_full_response = e.response
            payment.processed_at = timezone.now()
            payment.save()

            # Actualizar estado de factura si alcanzó máximo de intentos
            if invoice.payment_attempts >= invoice.max_payment_attempts:
                invoice.status = 'failed'
                invoice.save()
                self._handle_payment_failure(business)

            logger.error(f"Payment failed for invoice {invoice.id}: {e.message}")
            return False, payment

    def _process_courtesy_payment(
        self,
        invoice: Invoice,
        payment_method: PaymentMethod
    ) -> Tuple[bool, Payment]:
        """
        Procesa un pago con método cortesía (sin cobro real).

        El pago se registra como exitoso sin llamar a Culqi.
        """
        business = invoice.business

        # Verificar que el negocio tenga cortesía activa
        try:
            subscription = business.subscription
            if not subscription.is_courtesy_active:
                logger.warning(f"Courtesy not active for business {business.id}")
                payment = Payment.objects.create(
                    invoice=invoice,
                    payment_method=payment_method,
                    amount=invoice.total,
                    amount_cents=int(invoice.total * 100),
                    status='failed',
                    error_message="El acceso cortesía no está activo"
                )
                return False, payment
        except BusinessSubscription.DoesNotExist:
            payment = Payment.objects.create(
                invoice=invoice,
                payment_method=payment_method,
                amount=invoice.total,
                amount_cents=int(invoice.total * 100),
                status='failed',
                error_message="No existe suscripción para este negocio"
            )
            return False, payment

        # Crear Payment exitoso
        payment = Payment.objects.create(
            invoice=invoice,
            payment_method=payment_method,
            amount=invoice.total,
            amount_cents=int(invoice.total * 100),
            status='succeeded',
            culqi_charge_id=f"courtesy_{invoice.id}_{timezone.now().strftime('%Y%m%d%H%M%S')}",
            culqi_response_code='courtesy',
            culqi_full_response={
                'type': 'courtesy',
                'reason': subscription.courtesy_reason or 'Acceso cortesía',
                'courtesy_until': str(subscription.courtesy_until) if subscription.courtesy_until else None
            },
            processed_at=timezone.now(),
            is_automatic=False
        )

        # Actualizar Invoice
        invoice.status = 'paid'
        invoice.paid_at = timezone.now()
        invoice.payment_method_used = payment_method
        invoice.notes = (invoice.notes or '') + f'\nPagado con cortesía: {subscription.courtesy_reason or "Sin motivo especificado"}'
        invoice.save()

        # Actualizar BusinessSubscription
        self._update_subscription_after_payment(business, invoice)

        logger.info(f"Courtesy payment successful for invoice {invoice.id}")
        return True, payment

    def retry_failed_payment(self, invoice: Invoice) -> Tuple[bool, Payment]:
        """
        Reintenta el pago de una factura fallida.

        Returns:
            Tuple de (éxito, Payment)
        """
        if invoice.status == 'paid':
            raise ValueError("La factura ya está pagada")

        # Resetear intentos si se está reintentando manualmente
        invoice.payment_attempts = 0
        invoice.status = 'pending'
        invoice.save()

        return self.process_invoice_payment(invoice)

    def _update_subscription_after_payment(self, business: Business, invoice: Invoice):
        """Actualiza la suscripción después de un pago exitoso."""
        try:
            subscription = business.subscription
            subscription.status = 'active'
            subscription.last_payment_date = timezone.now().date()
            subscription.last_payment_amount = invoice.total

            # Calcular próxima fecha de facturación
            next_month = invoice.period_end.month + 1
            next_year = invoice.period_end.year
            if next_month > 12:
                next_month = 1
                next_year += 1
            subscription.next_billing_date = invoice.period_end.replace(
                year=next_year,
                month=next_month,
                day=1
            )
            subscription.save()
        except BusinessSubscription.DoesNotExist:
            pass

    def _handle_payment_failure(self, business: Business):
        """Maneja el fallo de pago (suspender suscripción)."""
        try:
            subscription = business.subscription
            subscription.status = 'past_due'
            subscription.save()
        except BusinessSubscription.DoesNotExist:
            pass

    # ==================== BULK OPERATIONS ====================

    def generate_all_monthly_invoices(self, for_date: 'date' = None) -> list:
        """
        Genera facturas mensuales para todos los negocios activos.

        Args:
            for_date: Fecha de referencia

        Returns:
            Lista de facturas generadas
        """
        invoices = []

        # Obtener negocios con suscripciones activas o past_due
        subscriptions = BusinessSubscription.objects.filter(
            status__in=['active', 'past_due', 'trial']
        ).select_related('business')

        for subscription in subscriptions:
            try:
                invoice = self.generate_monthly_invoice(
                    subscription.business,
                    for_date
                )
                if invoice:
                    invoices.append(invoice)
            except Exception as e:
                logger.error(f"Error generating invoice for {subscription.business.id}: {e}")

        logger.info(f"Generated {len(invoices)} invoices")
        return invoices

    def process_all_pending_invoices(self) -> dict:
        """
        Procesa el pago de todas las facturas pendientes.

        Returns:
            dict con contadores de éxito/fallo
        """
        results = {'success': 0, 'failed': 0}

        pending_invoices = Invoice.objects.filter(
            status='pending',
            due_date__lte=timezone.now().date()
        ).select_related('business')

        for invoice in pending_invoices:
            success, _ = self.process_invoice_payment(invoice)
            if success:
                results['success'] += 1
            else:
                results['failed'] += 1

        logger.info(f"Processed invoices: {results}")
        return results

    # ==================== QUERIES ====================

    def get_business_invoices(self, business: Business, limit: int = 12) -> list:
        """Obtiene las últimas facturas de un negocio."""
        return Invoice.objects.filter(
            business=business
        ).order_by('-created_at')[:limit]

    def get_pending_amount(self, business: Business) -> Decimal:
        """Obtiene el monto total pendiente de pago."""
        result = Invoice.objects.filter(
            business=business,
            status__in=['pending', 'failed']
        ).values_list('total', flat=True)
        return sum(result, Decimal('0'))

    def get_payment_methods(self, business: Business) -> list:
        """Obtiene los métodos de pago activos de un negocio."""
        return PaymentMethod.objects.filter(
            business=business,
            is_active=True
        ).order_by('-is_default', '-created_at')
