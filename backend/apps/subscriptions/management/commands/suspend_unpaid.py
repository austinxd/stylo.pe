"""
Comando para suspender suscripciones con facturas vencidas.

Ejecutar diariamente:
    python manage.py suspend_unpaid

Opciones:
    --dry-run       Solo mostrar qué suscripciones se suspenderían
    --grace-days    Días de gracia después del vencimiento (default: 7)
"""
from datetime import timedelta

from django.core.management.base import BaseCommand
from django.utils import timezone
from apps.subscriptions.models import Invoice, BusinessSubscription


class Command(BaseCommand):
    help = 'Suspende suscripciones con facturas vencidas por más de X días'

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Solo mostrar qué suscripciones se suspenderían',
        )
        parser.add_argument(
            '--grace-days',
            type=int,
            default=7,
            help='Días de gracia después del vencimiento (default: 7)',
        )

    def handle(self, *args, **options):
        dry_run = options['dry_run']
        grace_days = options['grace_days']
        today = timezone.now().date()
        cutoff_date = today - timedelta(days=grace_days)

        self.stdout.write(self.style.NOTICE(f'Verificando suscripciones con facturas vencidas hace más de {grace_days} días...'))

        if dry_run:
            self.stdout.write(self.style.WARNING('MODO DRY-RUN: No se suspenderán suscripciones'))

        # Facturas vencidas por más de grace_days
        overdue_invoices = Invoice.objects.filter(
            status__in=['pending', 'failed'],
            due_date__lt=cutoff_date
        ).select_related('business')

        # Obtener negocios únicos
        business_ids = set(inv.business_id for inv in overdue_invoices)

        if not business_ids:
            self.stdout.write('No hay suscripciones para suspender')
            return

        self.stdout.write(f'Negocios con facturas vencidas: {len(business_ids)}')

        suspended_count = 0

        for business_id in business_ids:
            try:
                subscription = BusinessSubscription.objects.get(business_id=business_id)

                if subscription.status in ['suspended', 'cancelled']:
                    self.stdout.write(f'  {subscription.business.name}: Ya está {subscription.status}')
                    continue

                # Verificar si tiene cortesía activa
                if subscription.is_courtesy_active:
                    self.stdout.write(f'  {subscription.business.name}: Tiene cortesía activa, no se suspende')
                    continue

                self.stdout.write(f'  {subscription.business.name}: {subscription.status} → suspended')

                if not dry_run:
                    subscription.status = 'suspended'
                    subscription.save()
                    suspended_count += 1
                else:
                    suspended_count += 1

            except BusinessSubscription.DoesNotExist:
                self.stdout.write(self.style.WARNING(f'  Business {business_id}: Sin suscripción'))

        self.stdout.write('')
        self.stdout.write(self.style.SUCCESS(f'Suscripciones suspendidas: {suspended_count}'))

        if dry_run:
            self.stdout.write(self.style.WARNING('(Modo dry-run - ninguna suspensión aplicada)'))
