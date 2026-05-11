"""
Tests de scoping multi-tenant.

Crítico para seguridad: garantiza que un business_owner de A
no pueda ver/modificar recursos de B.
"""
import uuid
from datetime import timedelta
from decimal import Decimal

from django.test import TestCase
from django.utils import timezone

from apps.core.models import Business, Branch
from apps.accounts.models import User, Client, StaffMember
from apps.services.models import Service, StaffService
from apps.appointments.models import Appointment
from apps.subscriptions.models import StaffSubscription

from .scoping import (
    business_ids_for,
    branch_ids_for,
    scope_branches,
    scope_staff,
    scope_services,
    scope_appointments,
    primary_business_for,
)


def _create_tenant(owner_phone):
    """Crea (owner_user, business, branch, staff, service) aislados."""
    suffix = uuid.uuid4().hex[:8]
    business = Business.objects.create(name=f'Biz {suffix}', slug=f'biz-{suffix}')

    owner = User.objects.create_user(
        phone_number=owner_phone, role='business_owner',
    )
    business.owner = owner
    business.save()
    # asociar manualmente via related (depende del modelo)
    owner.owned_businesses.add(business) if hasattr(owner.owned_businesses, 'add') else None

    branch = Branch.objects.create(business=business, name='Sede', slug=f'sede-{suffix}')

    staff_user = User.objects.create_user(
        phone_number=f'+519{suffix[:9]}', role='staff',
    )
    staff = StaffMember.objects.create(
        user=staff_user, first_name='S', last_name_paterno='M',
        current_business=business,
        document_type='dni', document_number=f'9{suffix[:7]}',
    )
    staff.branches.add(branch)
    StaffSubscription.objects.create(
        staff=staff, business=business, is_active=True, is_billable=True,
        trial_ends_at=timezone.now() + timedelta(days=365),
    )

    service = Service.objects.create(
        branch=branch, name='Servicio', duration_minutes=30, price=Decimal('50.00'),
    )
    StaffService.objects.create(staff=staff, service=service, is_active=True)

    client = Client.objects.create(
        document_type='dni', document_number=f'1{suffix[:7]}',
        phone_number=f'+5199{suffix[:8]}',
        first_name='C', last_name_paterno='L',
    )
    appointment = Appointment.objects.create(
        branch=branch, client=client, staff=staff, service=service,
        start_datetime=timezone.now() + timedelta(days=1),
        end_datetime=timezone.now() + timedelta(days=1, minutes=30),
        price=Decimal('50.00'),
    )

    return {
        'owner': owner, 'business': business, 'branch': branch,
        'staff': staff, 'service': service,
        'client': client, 'appointment': appointment,
    }


class TenantScopingTests(TestCase):
    """
    Crea dos tenants A y B y verifica que el owner de A no ve nada de B.
    """

    def setUp(self):
        self.a = _create_tenant('+51900000001')
        self.b = _create_tenant('+51900000002')
        self.super_admin = User.objects.create_user(
            email='admin@test.com', role='super_admin', password='admin',
        )

    # === business_ids_for ===
    def test_super_admin_sees_all_businesses(self):
        ids = business_ids_for(self.super_admin)
        self.assertIsNone(ids, 'super_admin: sin restricción (None)')

    def test_owner_sees_only_own_businesses(self):
        ids = business_ids_for(self.a['owner'])
        self.assertEqual(ids, [self.a['business'].id])
        self.assertNotIn(self.b['business'].id, ids)

    def test_random_user_sees_nothing(self):
        random_user = User.objects.create_user(
            phone_number='+51900000099', role='client',
        )
        self.assertEqual(business_ids_for(random_user), [])

    # === scope_branches ===
    def test_owner_scope_branches_excludes_other(self):
        qs = scope_branches(Branch.objects.all(), self.a['owner'])
        ids = list(qs.values_list('id', flat=True))
        self.assertIn(self.a['branch'].id, ids)
        self.assertNotIn(self.b['branch'].id, ids)

    def test_super_admin_scope_branches_all(self):
        qs = scope_branches(Branch.objects.all(), self.super_admin)
        ids = set(qs.values_list('id', flat=True))
        self.assertIn(self.a['branch'].id, ids)
        self.assertIn(self.b['branch'].id, ids)

    # === scope_staff ===
    def test_owner_scope_staff_excludes_other(self):
        qs = scope_staff(StaffMember.objects.all(), self.a['owner'])
        ids = list(qs.values_list('id', flat=True))
        self.assertIn(self.a['staff'].id, ids)
        self.assertNotIn(self.b['staff'].id, ids)

    def test_staff_user_only_sees_self(self):
        staff_user = self.a['staff'].user
        qs = scope_staff(StaffMember.objects.all(), staff_user)
        ids = list(qs.values_list('id', flat=True))
        self.assertEqual(ids, [self.a['staff'].id])

    # === scope_services ===
    def test_owner_scope_services_excludes_other(self):
        qs = scope_services(Service.objects.all(), self.a['owner'])
        ids = list(qs.values_list('id', flat=True))
        self.assertIn(self.a['service'].id, ids)
        self.assertNotIn(self.b['service'].id, ids)

    # === scope_appointments ===
    def test_owner_scope_appointments_excludes_other(self):
        qs = scope_appointments(Appointment.objects.all(), self.a['owner'])
        ids = list(qs.values_list('id', flat=True))
        self.assertIn(self.a['appointment'].id, ids)
        self.assertNotIn(self.b['appointment'].id, ids, 'IDOR check: owner A no debe ver citas de B')

    def test_staff_user_only_sees_own_appointments(self):
        # La cita de A está asignada al staff de A
        qs = scope_appointments(Appointment.objects.all(), self.a['staff'].user)
        ids = list(qs.values_list('id', flat=True))
        self.assertEqual(ids, [self.a['appointment'].id])

    def test_super_admin_sees_all_appointments(self):
        qs = scope_appointments(Appointment.objects.all(), self.super_admin)
        ids = set(qs.values_list('id', flat=True))
        self.assertIn(self.a['appointment'].id, ids)
        self.assertIn(self.b['appointment'].id, ids)

    # === primary_business_for ===
    def test_primary_business_for_owner(self):
        b = primary_business_for(self.a['owner'])
        self.assertEqual(b.id, self.a['business'].id)

    def test_primary_business_for_staff(self):
        b = primary_business_for(self.a['staff'].user)
        self.assertEqual(b.id, self.a['business'].id)

    def test_primary_business_for_random_user_is_none(self):
        random_user = User.objects.create_user(
            phone_number='+51900000098', role='client',
        )
        self.assertIsNone(primary_business_for(random_user))
