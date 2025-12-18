"""
Tareas Celery para el módulo de suscripciones.

Tareas programadas:
- check_expired_trials: Diario, convierte trials expirados a billable
- generate_monthly_invoices: Mensual (día 1), genera facturas del mes anterior
- process_pending_payments: Diario, procesa facturas pendientes de pago
- send_payment_reminders: Diario, envía recordatorios de pago
"""
import logging
from celery import shared_task
from django.utils import timezone

from .services import SubscriptionService, BillingService
from .models import Invoice, BusinessSubscription


logger = logging.getLogger(__name__)


@shared_task(name='subscriptions.check_expired_trials')
def check_expired_trials():
    """
    Revisa y actualiza los trials expirados.

    Debe ejecutarse diariamente (ej: 00:05 AM).

    Acciones:
    - Marca como billable los staff con trial expirado
    - Actualiza estado de suscripciones de negocio
    """
    logger.info("Starting check_expired_trials task")

    try:
        SubscriptionService.check_all_trials()
        logger.info("check_expired_trials completed successfully")
        return {'status': 'success'}
    except Exception as e:
        logger.error(f"check_expired_trials failed: {e}")
        return {'status': 'error', 'message': str(e)}


@shared_task(name='subscriptions.generate_monthly_invoices')
def generate_monthly_invoices():
    """
    Genera las facturas mensuales para todos los negocios.

    Debe ejecutarse el día 1 de cada mes (ej: 01:00 AM).

    Genera facturas por el uso del mes anterior con prorrateo
    individual por cada profesional.
    """
    logger.info("Starting generate_monthly_invoices task")

    try:
        billing_service = BillingService()
        invoices = billing_service.generate_all_monthly_invoices()

        result = {
            'status': 'success',
            'invoices_generated': len(invoices),
            'invoice_ids': [inv.id for inv in invoices]
        }

        logger.info(f"generate_monthly_invoices completed: {len(invoices)} invoices")
        return result

    except Exception as e:
        logger.error(f"generate_monthly_invoices failed: {e}")
        return {'status': 'error', 'message': str(e)}


@shared_task(name='subscriptions.process_pending_payments')
def process_pending_payments():
    """
    Procesa el cobro de facturas pendientes.

    Debe ejecutarse diariamente (ej: 09:00 AM).

    Procesa facturas con due_date <= hoy que tengan método de pago.
    """
    logger.info("Starting process_pending_payments task")

    try:
        billing_service = BillingService()
        results = billing_service.process_all_pending_invoices()

        logger.info(f"process_pending_payments completed: {results}")
        return {
            'status': 'success',
            **results
        }

    except Exception as e:
        logger.error(f"process_pending_payments failed: {e}")
        return {'status': 'error', 'message': str(e)}


@shared_task(name='subscriptions.send_payment_reminders')
def send_payment_reminders():
    """
    Envía recordatorios de pago para facturas próximas a vencer.

    Debe ejecutarse diariamente (ej: 10:00 AM).

    Envía recordatorios:
    - 3 días antes del vencimiento
    - El día del vencimiento
    - 1 día después (factura vencida)
    """
    logger.info("Starting send_payment_reminders task")

    from datetime import timedelta

    today = timezone.now().date()
    reminders_sent = 0

    try:
        # Facturas que vencen en 3 días
        due_in_3_days = today + timedelta(days=3)
        invoices_3d = Invoice.objects.filter(
            status='pending',
            due_date=due_in_3_days
        ).select_related('business')

        for invoice in invoices_3d:
            # TODO: Enviar recordatorio por email/WhatsApp
            logger.info(f"Reminder (3 days): Invoice {invoice.id} for {invoice.business.name}")
            reminders_sent += 1

        # Facturas que vencen hoy
        invoices_today = Invoice.objects.filter(
            status='pending',
            due_date=today
        ).select_related('business')

        for invoice in invoices_today:
            # TODO: Enviar recordatorio urgente
            logger.info(f"Reminder (today): Invoice {invoice.id} for {invoice.business.name}")
            reminders_sent += 1

        # Facturas vencidas ayer
        yesterday = today - timedelta(days=1)
        invoices_overdue = Invoice.objects.filter(
            status='pending',
            due_date=yesterday
        ).select_related('business')

        for invoice in invoices_overdue:
            # TODO: Enviar aviso de factura vencida
            logger.info(f"Reminder (overdue): Invoice {invoice.id} for {invoice.business.name}")
            reminders_sent += 1

        logger.info(f"send_payment_reminders completed: {reminders_sent} reminders")
        return {
            'status': 'success',
            'reminders_sent': reminders_sent
        }

    except Exception as e:
        logger.error(f"send_payment_reminders failed: {e}")
        return {'status': 'error', 'message': str(e)}


@shared_task(name='subscriptions.process_single_invoice')
def process_single_invoice(invoice_id: int):
    """
    Procesa el pago de una factura específica.

    Útil para reintentos manuales o webhooks.

    Args:
        invoice_id: ID de la factura a procesar
    """
    logger.info(f"Processing single invoice: {invoice_id}")

    try:
        invoice = Invoice.objects.get(pk=invoice_id)

        if invoice.status == 'paid':
            return {'status': 'skipped', 'message': 'Invoice already paid'}

        billing_service = BillingService()
        success, payment = billing_service.process_invoice_payment(invoice)

        return {
            'status': 'success' if success else 'failed',
            'payment_id': payment.id,
            'payment_status': payment.status
        }

    except Invoice.DoesNotExist:
        logger.error(f"Invoice {invoice_id} not found")
        return {'status': 'error', 'message': 'Invoice not found'}
    except Exception as e:
        logger.error(f"process_single_invoice failed: {e}")
        return {'status': 'error', 'message': str(e)}


@shared_task(name='subscriptions.suspend_unpaid_subscriptions')
def suspend_unpaid_subscriptions():
    """
    Suspende suscripciones con facturas vencidas por más de 7 días.

    Debe ejecutarse diariamente (ej: 23:00).

    Suspende el negocio impidiendo que reciba nuevas reservas.
    """
    logger.info("Starting suspend_unpaid_subscriptions task")

    from datetime import timedelta

    today = timezone.now().date()
    grace_period = timedelta(days=7)
    suspended_count = 0

    try:
        # Facturas vencidas por más de 7 días
        overdue_invoices = Invoice.objects.filter(
            status__in=['pending', 'failed'],
            due_date__lt=today - grace_period
        ).select_related('business')

        business_ids = set(inv.business_id for inv in overdue_invoices)

        for business_id in business_ids:
            try:
                subscription = BusinessSubscription.objects.get(
                    business_id=business_id
                )
                if subscription.status not in ['suspended', 'cancelled']:
                    subscription.status = 'suspended'
                    subscription.save()
                    suspended_count += 1
                    logger.info(f"Suspended subscription for business {business_id}")
            except BusinessSubscription.DoesNotExist:
                pass

        logger.info(f"suspend_unpaid_subscriptions completed: {suspended_count} suspended")
        return {
            'status': 'success',
            'suspended_count': suspended_count
        }

    except Exception as e:
        logger.error(f"suspend_unpaid_subscriptions failed: {e}")
        return {'status': 'error', 'message': str(e)}


# ==================== CELERY BEAT SCHEDULE ====================
# Agregar al settings.py:
#
# CELERY_BEAT_SCHEDULE = {
#     'check-expired-trials': {
#         'task': 'subscriptions.check_expired_trials',
#         'schedule': crontab(hour=0, minute=5),  # 00:05 AM diario
#     },
#     'generate-monthly-invoices': {
#         'task': 'subscriptions.generate_monthly_invoices',
#         'schedule': crontab(hour=1, minute=0, day_of_month=1),  # 01:00 AM día 1
#     },
#     'process-pending-payments': {
#         'task': 'subscriptions.process_pending_payments',
#         'schedule': crontab(hour=9, minute=0),  # 09:00 AM diario
#     },
#     'send-payment-reminders': {
#         'task': 'subscriptions.send_payment_reminders',
#         'schedule': crontab(hour=10, minute=0),  # 10:00 AM diario
#     },
#     'suspend-unpaid-subscriptions': {
#         'task': 'subscriptions.suspend_unpaid_subscriptions',
#         'schedule': crontab(hour=23, minute=0),  # 11:00 PM diario
#     },
# }
