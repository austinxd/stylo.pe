"""
Comando para crear StaffSubscription faltantes y arreglar current_business.
"""
from django.core.management.base import BaseCommand
from apps.accounts.models import StaffMember
from apps.subscriptions.models import StaffSubscription


class Command(BaseCommand):
    help = 'Crea StaffSubscription para profesionales que no tienen una y arregla current_business'

    def handle(self, *args, **options):
        staff_to_fix = []

        for staff in StaffMember.objects.filter(is_active=True):
            # Obtener el business de las sucursales del staff
            first_branch = staff.branches.first()
            if not first_branch:
                self.stdout.write(
                    self.style.WARNING(f'Staff {staff.id} ({staff.full_name}) no tiene sucursales asignadas')
                )
                continue

            business = first_branch.business

            # Verificar si falta current_business
            needs_current_business = staff.current_business is None

            # Verificar si ya tiene suscripción
            existing = StaffSubscription.objects.filter(
                business=business,
                staff=staff
            ).first()

            needs_subscription = existing is None

            if needs_current_business or needs_subscription:
                staff_to_fix.append({
                    'staff': staff,
                    'business': business,
                    'needs_current_business': needs_current_business,
                    'needs_subscription': needs_subscription
                })

        if not staff_to_fix:
            self.stdout.write(self.style.SUCCESS('Todos los staff están correctamente configurados'))
            return

        self.stdout.write(f'Encontrados {len(staff_to_fix)} staff que necesitan arreglo:')
        for item in staff_to_fix:
            issues = []
            if item['needs_current_business']:
                issues.append('current_business')
            if item['needs_subscription']:
                issues.append('subscription')
            self.stdout.write(f"  - {item['staff'].id}: {item['staff'].full_name} - Falta: {', '.join(issues)}")

        # Arreglar los staff
        fixed_business = 0
        fixed_subscription = 0

        for item in staff_to_fix:
            staff = item['staff']
            business = item['business']

            # Arreglar current_business
            if item['needs_current_business']:
                staff.current_business = business
                staff.save(update_fields=['current_business'])
                fixed_business += 1
                self.stdout.write(
                    self.style.SUCCESS(f'Asignado current_business a {staff.full_name}')
                )

            # Crear suscripción
            if item['needs_subscription']:
                subscription, created = StaffSubscription.objects.get_or_create(
                    business=business,
                    staff=staff,
                    defaults={'is_active': True}
                )
                if created:
                    fixed_subscription += 1
                    self.stdout.write(
                        self.style.SUCCESS(
                            f'Creada suscripción para {staff.full_name} - Trial hasta {subscription.trial_ends_at}'
                        )
                    )

        self.stdout.write(self.style.SUCCESS(
            f'Total: {fixed_business} current_business asignados, {fixed_subscription} suscripciones creadas'
        ))
