"""
Comando para crear StaffSubscription faltantes para staff existentes.
"""
from django.core.management.base import BaseCommand
from apps.accounts.models import StaffMember
from apps.subscriptions.models import StaffSubscription


class Command(BaseCommand):
    help = 'Crea StaffSubscription para profesionales que no tienen una'

    def handle(self, *args, **options):
        staff_without_subscription = []

        for staff in StaffMember.objects.filter(is_active=True):
            # Obtener el business de las sucursales del staff
            first_branch = staff.branches.first()
            if not first_branch:
                self.stdout.write(
                    self.style.WARNING(f'Staff {staff.id} ({staff.full_name}) no tiene sucursales asignadas')
                )
                continue

            business = first_branch.business

            # Verificar si ya tiene suscripción
            existing = StaffSubscription.objects.filter(
                business=business,
                staff=staff
            ).first()

            if not existing:
                staff_without_subscription.append((staff, business))

        if not staff_without_subscription:
            self.stdout.write(self.style.SUCCESS('Todos los staff ya tienen suscripción'))
            return

        self.stdout.write(f'Encontrados {len(staff_without_subscription)} staff sin suscripción:')
        for staff, business in staff_without_subscription:
            self.stdout.write(f'  - {staff.id}: {staff.full_name} @ {business.name}')

        # Crear las suscripciones
        created_count = 0
        for staff, business in staff_without_subscription:
            subscription, created = StaffSubscription.objects.get_or_create(
                business=business,
                staff=staff,
                defaults={'is_active': True}
            )
            if created:
                created_count += 1
                self.stdout.write(
                    self.style.SUCCESS(
                        f'Creada suscripción para {staff.full_name} - Trial hasta {subscription.trial_ends_at}'
                    )
                )

        self.stdout.write(self.style.SUCCESS(f'Total: {created_count} suscripciones creadas'))
