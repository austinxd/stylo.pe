"""
Comando para generar facturas mensuales.

Ejecutar el 1ero de cada mes:
    python manage.py generate_invoices

Opciones:
    --dry-run    Solo mostrar qué facturas se generarían, sin crearlas
    --business   ID de negocio específico (para testing)
"""
from django.core.management.base import BaseCommand
from apps.subscriptions.services import BillingService
from apps.subscriptions.models import BusinessSubscription


class Command(BaseCommand):
    help = 'Genera facturas mensuales para todos los negocios activos'

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Solo mostrar qué facturas se generarían, sin crearlas',
        )
        parser.add_argument(
            '--business',
            type=int,
            help='ID de negocio específico (para testing)',
        )

    def handle(self, *args, **options):
        dry_run = options['dry_run']
        business_id = options.get('business')

        self.stdout.write(self.style.NOTICE('Iniciando generación de facturas...'))

        if dry_run:
            self.stdout.write(self.style.WARNING('MODO DRY-RUN: No se crearán facturas'))

        billing_service = BillingService()

        # Filtrar negocios
        if business_id:
            subscriptions = BusinessSubscription.objects.filter(
                business_id=business_id
            ).select_related('business')
        else:
            subscriptions = BusinessSubscription.objects.filter(
                status__in=['active', 'past_due', 'trial']
            ).select_related('business')

        invoices_generated = 0
        invoices_skipped = 0

        for subscription in subscriptions:
            business = subscription.business
            self.stdout.write(f'  Procesando: {business.name}...')

            if dry_run:
                # Solo verificar si generaría factura
                from apps.subscriptions.models import StaffSubscription
                from django.utils import timezone
                from django.db.models import Q
                import calendar

                today = timezone.now().date()
                if today.month == 1:
                    period_start = today.replace(year=today.year - 1, month=12, day=1)
                else:
                    period_start = today.replace(month=today.month - 1, day=1)

                days_in_period = calendar.monthrange(period_start.year, period_start.month)[1]
                period_end = period_start.replace(day=days_in_period)

                staff_count = StaffSubscription.objects.filter(
                    business=business,
                    is_billable=True
                ).filter(
                    Q(billable_since__lte=period_end) &
                    (Q(deactivated_at__isnull=True) | Q(deactivated_at__gte=period_start))
                ).count()

                if staff_count > 0:
                    self.stdout.write(self.style.SUCCESS(
                        f'    → Generaría factura: {staff_count} profesionales, período {period_start} - {period_end}'
                    ))
                    invoices_generated += 1
                else:
                    self.stdout.write(f'    → Sin profesionales billable en el período')
                    invoices_skipped += 1
            else:
                try:
                    invoice = billing_service.generate_monthly_invoice(business)
                    if invoice:
                        self.stdout.write(self.style.SUCCESS(
                            f'    → Factura #{invoice.id} generada: S/ {invoice.total}'
                        ))
                        invoices_generated += 1
                    else:
                        self.stdout.write(f'    → Sin factura (no hay uso o ya existe)')
                        invoices_skipped += 1
                except Exception as e:
                    self.stdout.write(self.style.ERROR(f'    → Error: {e}'))

        self.stdout.write('')
        self.stdout.write(self.style.SUCCESS(f'Facturas generadas: {invoices_generated}'))
        self.stdout.write(f'Negocios sin factura: {invoices_skipped}')

        if dry_run:
            self.stdout.write(self.style.WARNING('(Modo dry-run - ninguna factura fue creada)'))
