"""
Tests del Sprint 1 en scheduling: SpecialDate bloqueando reservas.
"""
import uuid
from datetime import date, time, timedelta
from decimal import Decimal

from django.test import TestCase
from django.utils import timezone

from apps.core.models import Business, Branch
from apps.accounts.models import User, StaffMember
from apps.services.models import Service, StaffService
from apps.subscriptions.models import StaffSubscription
from .models import BranchSchedule, WorkSchedule, SpecialDate
from .services import AvailabilityService


def _setup():
    suffix = uuid.uuid4().hex[:8]
    business = Business.objects.create(name=f'Test {suffix}', slug=f'test-{suffix}')
    branch = Branch.objects.create(business=business, name='Centro', slug=f'centro-{suffix}')

    # Horario regular lunes-viernes 9-19
    for dow in range(0, 5):
        BranchSchedule.objects.create(
            branch=branch,
            day_of_week=dow,
            opening_time=time(9, 0),
            closing_time=time(19, 0),
            is_open=True,
        )

    user = User.objects.create_user(phone_number=f'+5190000{suffix[:4]}', role='staff')
    staff = StaffMember.objects.create(
        user=user, first_name='Ana', last_name_paterno='P',
        current_business=business,
        document_type='dni', document_number=f'8{suffix[:7]}',
    )
    staff.branches.add(branch)
    StaffSubscription.objects.create(
        staff=staff, business=business, is_active=True, is_billable=True,
        trial_ends_at=timezone.now() + timedelta(days=365),
    )

    # Horario de trabajo lunes-viernes 9-19
    for dow in range(0, 5):
        WorkSchedule.objects.create(
            staff=staff, branch=branch, day_of_week=dow,
            start_time=time(9, 0), end_time=time(19, 0), is_working=True,
        )

    service = Service.objects.create(
        branch=branch, name='Corte', duration_minutes=30, price=Decimal('50.00'),
    )
    StaffService.objects.create(staff=staff, service=service, is_active=True)

    return {'business': business, 'branch': branch, 'staff': staff, 'service': service}


def _next_weekday():
    """Retorna el próximo lunes (para garantizar horario activo)."""
    today = timezone.now().date()
    days_until_monday = (7 - today.weekday()) % 7
    if days_until_monday == 0:
        days_until_monday = 7
    return today + timedelta(days=days_until_monday)


class SpecialDateBlocksReservationsTests(TestCase):
    def setUp(self):
        self.ctx = _setup()
        self.target_date = _next_weekday()
        self.service_ = AvailabilityService(self.ctx['branch'])

    def test_open_normally_without_special_date(self):
        slots = self.service_.get_available_slots(
            self.ctx['service'], self.ctx['staff'], self.target_date
        )
        self.assertGreater(len(slots), 0, 'día normal debe tener slots')

    def test_closed_special_date_returns_no_slots(self):
        SpecialDate.objects.create(
            branch=self.ctx['branch'],
            date=self.target_date,
            date_type='closed',
            name='Inventario',
        )
        slots = self.service_.get_available_slots(
            self.ctx['service'], self.ctx['staff'], self.target_date
        )
        self.assertEqual(slots, [], 'cerrado por SpecialDate: 0 slots')

    def test_holiday_blocks_reservations(self):
        SpecialDate.objects.create(
            branch=self.ctx['branch'],
            date=self.target_date,
            date_type='holiday',
            name='Día del trabajo',
        )
        slots = self.service_.get_available_slots(
            self.ctx['service'], self.ctx['staff'], self.target_date
        )
        self.assertEqual(slots, [], 'feriado debe bloquear (fix Sprint 1)')

    def test_special_hours_uses_custom_times(self):
        SpecialDate.objects.create(
            branch=self.ctx['branch'],
            date=self.target_date,
            date_type='special_hours',
            opening_time=time(14, 0),
            closing_time=time(17, 0),
            name='Horario reducido',
        )
        slots = self.service_.get_available_slots(
            self.ctx['service'], self.ctx['staff'], self.target_date
        )
        # Debe haber slots, pero menos que en horario normal
        self.assertGreater(len(slots), 0)
        # Todos los slots deben caer dentro de 14:00–16:30 (último de 30 min antes de 17:00)
        for slot in slots:
            h = slot['datetime'].astimezone(timezone.get_current_timezone()).hour
            self.assertGreaterEqual(h, 14, f'slot a las {h}h fuera de horario especial')
            self.assertLess(h, 17, f'slot a las {h}h pasa cierre')

    def test_special_hours_without_times_treats_as_closed(self):
        # Si especifican special_hours pero sin horas, no devolver slots inválidos
        SpecialDate.objects.create(
            branch=self.ctx['branch'],
            date=self.target_date,
            date_type='special_hours',
            name='Mal configurado',
            opening_time=None,
            closing_time=None,
        )
        slots = self.service_.get_available_slots(
            self.ctx['service'], self.ctx['staff'], self.target_date
        )
        self.assertEqual(slots, [], 'special_hours sin times → tratar como cerrado')

    def test_is_branch_open_returns_false_for_holiday(self):
        SpecialDate.objects.create(
            branch=self.ctx['branch'],
            date=self.target_date,
            date_type='holiday',
            name='Test',
        )
        is_open, _, _ = self.service_.is_branch_open(self.target_date)
        self.assertFalse(is_open)

    def test_is_branch_open_returns_false_for_closed(self):
        SpecialDate.objects.create(
            branch=self.ctx['branch'],
            date=self.target_date,
            date_type='closed',
            name='Test',
        )
        is_open, _, _ = self.service_.is_branch_open(self.target_date)
        self.assertFalse(is_open)
