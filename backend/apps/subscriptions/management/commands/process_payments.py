"""
Comando para procesar pagos de facturas pendientes.

Ejecutar diariamente:
    python manage.py process_payments

Opciones:
    --dry-run    Solo mostrar qué facturas se procesarían
"""
from django.core.management.base import BaseCommand
from django.utils import timezone
from apps.subscriptions.services import BillingService
from apps.subscriptions.models import Invoice


class Command(BaseCommand):
    help = 'Procesa el pago automático de facturas pendientes con due_date vencido'

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Solo mostrar qué facturas se procesarían, sin cobrar',
        )

    def handle(self, *args, **options):
        dry_run = options['dry_run']
        today = timezone.now().date()

        self.stdout.write(self.style.NOTICE('Procesando pagos pendientes...'))

        if dry_run:
            self.stdout.write(self.style.WARNING('MODO DRY-RUN: No se procesarán pagos'))

        # Obtener facturas pendientes con fecha de vencimiento pasada o igual a hoy
        pending_invoices = Invoice.objects.filter(
            status='pending',
            due_date__lte=today
        ).select_related('business')

        if not pending_invoices.exists():
            self.stdout.write('No hay facturas pendientes de procesar')
            return

        self.stdout.write(f'Facturas a procesar: {pending_invoices.count()}')

        billing_service = BillingService()
        success_count = 0
        failed_count = 0

        for invoice in pending_invoices:
            self.stdout.write(f'  Factura #{invoice.id} - {invoice.business.name} - S/ {invoice.total}')

            if dry_run:
                # Verificar si tiene método de pago
                from apps.subscriptions.models import PaymentMethod
                has_payment = PaymentMethod.objects.filter(
                    business=invoice.business,
                    is_active=True,
                    is_default=True
                ).exists()

                if has_payment:
                    self.stdout.write(self.style.SUCCESS('    → Se procesaría el pago'))
                else:
                    self.stdout.write(self.style.WARNING('    → Sin método de pago configurado'))
            else:
                try:
                    success, payment = billing_service.process_invoice_payment(invoice)
                    if success:
                        self.stdout.write(self.style.SUCCESS(f'    → Pago exitoso'))
                        success_count += 1
                    else:
                        self.stdout.write(self.style.ERROR(
                            f'    → Pago fallido: {payment.error_message}'
                        ))
                        failed_count += 1
                except Exception as e:
                    self.stdout.write(self.style.ERROR(f'    → Error: {e}'))
                    failed_count += 1

        self.stdout.write('')
        if not dry_run:
            self.stdout.write(self.style.SUCCESS(f'Pagos exitosos: {success_count}'))
            self.stdout.write(self.style.ERROR(f'Pagos fallidos: {failed_count}'))
