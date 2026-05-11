"""
Tests del endpoint de reagendamiento de citas en el dashboard.

POST /api/v1/appointments/dashboard/{id}/reschedule/
"""
import uuid
from datetime import timedelta
from decimal import Decimal

from django.test import TestCase
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import Client, StaffMember, User
from apps.core.models import Business, Branch
from apps.services.models import Service, StaffService
from apps.subscriptions.models import StaffSubscription
from .models import Appointment, AppointmentReminder
from .services import create_appointment_atomic


def _setup_tenant():
    """Crea negocio + sucursal + staff + servicio + cliente + owner user."""
    suffix = uuid.uuid4().hex[:8]
    business = Business.objects.create(name=f'Biz {suffix}', slug=f'biz-{suffix}')

    owner = User.objects.create_user(
        phone_number=f'+5190000{suffix[:4]}', role='business_owner',
    )
    owner.owned_businesses.add(business)

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
        branch=branch, name='Corte', duration_minutes=30, price=Decimal('50.00'),
    )
    StaffService.objects.create(staff=staff, service=service, is_active=True)

    client = Client.objects.create(
        document_type='dni', document_number=f'1{suffix[:7]}',
        phone_number=f'+5199{suffix[:8]}',
        first_name='C', last_name_paterno='L',
    )

    return {
        'owner': owner, 'business': business, 'branch': branch,
        'staff': staff, 'service': service, 'client': client,
    }


class RescheduleEndpointTests(TestCase):
    def setUp(self):
        self.ctx = _setup_tenant()
        self.client_api = APIClient()
        self.client_api.force_authenticate(user=self.ctx['owner'])

        self.original_start = timezone.now() + timedelta(days=2)
        self.appointment = create_appointment_atomic(
            branch_id=self.ctx['branch'].id,
            client=self.ctx['client'],
            staff_id=self.ctx['staff'].id,
            service=self.ctx['service'],
            start_datetime=self.original_start,
            price=Decimal('50.00'),
            create_reminder=False,
        )
        self.url = f'/api/v1/appointments/dashboard/{self.appointment.id}/reschedule/'

    def test_reschedule_to_free_slot_returns_200(self):
        new_start = self.original_start + timedelta(hours=3)
        response = self.client_api.post(
            self.url,
            {'start_datetime': new_start.isoformat()},
            format='json',
        )
        self.assertEqual(response.status_code, 200, response.content)

        self.appointment.refresh_from_db()
        self.assertEqual(self.appointment.start_datetime, new_start)
        # end_datetime se recalcula con la duración del servicio
        self.assertEqual(
            (self.appointment.end_datetime - self.appointment.start_datetime).total_seconds(),
            30 * 60,
        )

    def test_reschedule_to_past_date_returns_400(self):
        past = timezone.now() - timedelta(days=1)
        response = self.client_api.post(
            self.url,
            {'start_datetime': past.isoformat()},
            format='json',
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn('pasada', response.data['error'])

    def test_reschedule_to_conflict_returns_409(self):
        # Crear otra cita en otro horario
        conflict_start = self.original_start + timedelta(hours=2)
        create_appointment_atomic(
            branch_id=self.ctx['branch'].id,
            client=self.ctx['client'],
            staff_id=self.ctx['staff'].id,
            service=self.ctx['service'],
            start_datetime=conflict_start,
            price=Decimal('50.00'),
            create_reminder=False,
        )

        response = self.client_api.post(
            self.url,
            {'start_datetime': conflict_start.isoformat()},
            format='json',
        )
        self.assertEqual(response.status_code, 409)

    def test_reschedule_cancelled_appointment_returns_400(self):
        self.appointment.cancel(cancelled_by='client')
        response = self.client_api.post(
            self.url,
            {'start_datetime': (self.original_start + timedelta(hours=3)).isoformat()},
            format='json',
        )
        self.assertEqual(response.status_code, 400)

    def test_reschedule_completed_appointment_returns_400(self):
        self.appointment.status = 'completed'
        self.appointment.save()
        response = self.client_api.post(
            self.url,
            {'start_datetime': (self.original_start + timedelta(hours=3)).isoformat()},
            format='json',
        )
        self.assertEqual(response.status_code, 400)

    def test_reschedule_no_show_appointment_returns_400(self):
        self.appointment.status = 'no_show'
        self.appointment.save()
        response = self.client_api.post(
            self.url,
            {'start_datetime': (self.original_start + timedelta(hours=3)).isoformat()},
            format='json',
        )
        self.assertEqual(response.status_code, 400)

    def test_reschedule_without_start_datetime_returns_400(self):
        response = self.client_api.post(self.url, {}, format='json')
        self.assertEqual(response.status_code, 400)
        self.assertIn('requerido', response.data['error'])

    def test_reschedule_with_invalid_format_returns_400(self):
        response = self.client_api.post(
            self.url,
            {'start_datetime': 'not-a-date'},
            format='json',
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn('inválido', response.data['error'])

    def test_unauthenticated_returns_401(self):
        unauth = APIClient()
        response = unauth.post(
            self.url,
            {'start_datetime': (self.original_start + timedelta(hours=3)).isoformat()},
            format='json',
        )
        self.assertEqual(response.status_code, 401)

    def test_other_owner_cannot_reschedule_returns_404(self):
        """Otro owner no puede ver/reagendar citas de otro negocio (anti-IDOR)."""
        other = _setup_tenant()
        other_client = APIClient()
        other_client.force_authenticate(user=other['owner'])

        response = other_client.post(
            self.url,
            {'start_datetime': (self.original_start + timedelta(hours=3)).isoformat()},
            format='json',
        )
        # 404 porque el queryset está scoped y el ID es invisible para él
        self.assertEqual(response.status_code, 404)

    def test_reschedule_updates_response_payload(self):
        new_start = self.original_start + timedelta(hours=4)
        response = self.client_api.post(
            self.url,
            {'start_datetime': new_start.isoformat()},
            format='json',
        )
        self.assertEqual(response.status_code, 200)
        # Response es AppointmentSerializer
        self.assertEqual(response.data['id'], self.appointment.id)
        self.assertIn('start_datetime', response.data)
