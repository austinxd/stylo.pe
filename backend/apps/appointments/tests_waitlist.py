"""
Tests del módulo de lista de espera (waitlist):

- POST /waitlist/join/         Anotarse
- GET  /waitlist/status/       Consultar entries por phone
- POST /waitlist/cancel/       Salir de la lista
- Signal: al cancelar una cita, notifica al primer matcheable
"""
import uuid
from datetime import timedelta
from decimal import Decimal

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import Client, StaffMember, User
from apps.core.models import Business, Branch
from apps.services.models import Service, StaffService
from apps.subscriptions.models import StaffSubscription
from .models import Appointment, WaitlistEntry
from .services import (
    create_appointment_atomic,
    process_waitlist_for_appointment,
    claim_waitlist_slot,
    expire_old_waitlist_notifications,
    WaitlistClaimError,
    WAITLIST_CLAIM_TTL,
)


def _setup_tenant():
    suffix = uuid.uuid4().hex[:8]
    business = Business.objects.create(name=f'Biz {suffix}', slug=f'biz-{suffix}')
    branch = Branch.objects.create(business=business, name='Sede', slug=f'sede-{suffix}')

    staff_user = User.objects.create_user(
        phone_number=f'+519{suffix[:9]}', role='staff',
    )
    staff = StaffMember.objects.create(
        user=staff_user, first_name='Stylist', last_name_paterno='Test',
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

    # Phone con sólo dígitos (el suffix hex puede tener letras → no es válido E.164)
    digits = str(abs(hash(suffix)))[:9].ljust(9, '0')
    client = Client.objects.create(
        document_type='dni', document_number=f'1{suffix[:7]}',
        phone_number=f'+519{digits}',
        first_name='Cliente', last_name_paterno='Test',
    )

    return {
        'business': business, 'branch': branch, 'staff': staff,
        'service': service, 'client': client,
    }


class WaitlistJoinEndpointTests(TestCase):
    def setUp(self):
        self.ctx = _setup_tenant()
        self.client_api = APIClient()
        self.url = '/api/v1/appointments/waitlist/join/'
        self.future_date = (timezone.now() + timedelta(days=2)).date()

    def _payload(self, **overrides):
        base = {
            'branch_id': self.ctx['branch'].id,
            'service_id': self.ctx['service'].id,
            'preferred_date': self.future_date.isoformat(),
            'phone_number': '+51987654321',
            'first_name': 'Ana',
        }
        base.update(overrides)
        return base

    def test_join_returns_201(self):
        response = self.client_api.post(self.url, self._payload(), format='json')
        self.assertEqual(response.status_code, 201, response.content)
        self.assertEqual(WaitlistEntry.objects.count(), 1)
        entry = WaitlistEntry.objects.first()
        self.assertEqual(entry.first_name, 'Ana')
        self.assertEqual(entry.status, 'waiting')

    def test_join_with_existing_client_associates_automatically(self):
        # Crear con phone que ya existe en Client
        existing_phone = self.ctx['client'].phone_number
        response = self.client_api.post(
            self.url, self._payload(phone_number=existing_phone), format='json',
        )
        self.assertEqual(response.status_code, 201)
        entry = WaitlistEntry.objects.first()
        self.assertEqual(entry.client_id, self.ctx['client'].id)

    def test_join_duplicate_returns_409(self):
        self.client_api.post(self.url, self._payload(), format='json')
        response = self.client_api.post(self.url, self._payload(), format='json')
        self.assertEqual(response.status_code, 409)

    def test_join_past_date_returns_400(self):
        past = (timezone.now() - timedelta(days=1)).date()
        response = self.client_api.post(
            self.url, self._payload(preferred_date=past.isoformat()), format='json',
        )
        self.assertEqual(response.status_code, 400)

    def test_join_invalid_phone_returns_400(self):
        response = self.client_api.post(
            self.url, self._payload(phone_number='no-phone'), format='json',
        )
        self.assertEqual(response.status_code, 400)

    def test_join_invalid_service_returns_400(self):
        response = self.client_api.post(
            self.url, self._payload(service_id=99999), format='json',
        )
        self.assertEqual(response.status_code, 400)

    def test_join_with_specific_staff(self):
        response = self.client_api.post(
            self.url,
            self._payload(staff_id=self.ctx['staff'].id),
            format='json',
        )
        self.assertEqual(response.status_code, 201)
        entry = WaitlistEntry.objects.first()
        self.assertEqual(entry.staff_id, self.ctx['staff'].id)

    def test_join_with_time_range(self):
        response = self.client_api.post(
            self.url,
            self._payload(
                preferred_time_start='09:00',
                preferred_time_end='12:00',
            ),
            format='json',
        )
        self.assertEqual(response.status_code, 201)

    def test_join_incomplete_time_range_returns_400(self):
        # Sólo start, sin end
        response = self.client_api.post(
            self.url,
            self._payload(preferred_time_start='09:00'),
            format='json',
        )
        self.assertEqual(response.status_code, 400)

    def test_join_inverted_time_range_returns_400(self):
        response = self.client_api.post(
            self.url,
            self._payload(
                preferred_time_start='12:00',
                preferred_time_end='09:00',
            ),
            format='json',
        )
        self.assertEqual(response.status_code, 400)


class WaitlistStatusEndpointTests(TestCase):
    def setUp(self):
        self.ctx = _setup_tenant()
        self.client_api = APIClient()
        self.future_date = (timezone.now() + timedelta(days=2)).date()

        self.entry = WaitlistEntry.objects.create(
            branch=self.ctx['branch'],
            service=self.ctx['service'],
            phone_number='+51987654321',
            first_name='Ana',
            preferred_date=self.future_date,
        )

    def test_status_returns_user_entries(self):
        response = self.client_api.get(
            '/api/v1/appointments/waitlist/status/',
            {'phone': '+51987654321'},
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]['id'], self.entry.id)

    def test_status_no_phone_returns_400(self):
        response = self.client_api.get('/api/v1/appointments/waitlist/status/')
        self.assertEqual(response.status_code, 400)

    def test_status_excludes_cancelled_and_expired(self):
        self.entry.status = 'cancelled'
        self.entry.save()
        response = self.client_api.get(
            '/api/v1/appointments/waitlist/status/',
            {'phone': '+51987654321'},
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 0)


class WaitlistCancelEndpointTests(TestCase):
    def setUp(self):
        self.ctx = _setup_tenant()
        self.client_api = APIClient()
        self.future_date = (timezone.now() + timedelta(days=2)).date()
        self.entry = WaitlistEntry.objects.create(
            branch=self.ctx['branch'],
            service=self.ctx['service'],
            phone_number='+51987654321',
            first_name='Ana',
            preferred_date=self.future_date,
        )

    def test_cancel_with_correct_phone(self):
        response = self.client_api.post(
            '/api/v1/appointments/waitlist/cancel/',
            {'entry_id': self.entry.id, 'phone_number': '+51987654321'},
            format='json',
        )
        self.assertEqual(response.status_code, 200)
        self.entry.refresh_from_db()
        self.assertEqual(self.entry.status, 'cancelled')

    def test_cancel_with_wrong_phone_returns_404(self):
        response = self.client_api.post(
            '/api/v1/appointments/waitlist/cancel/',
            {'entry_id': self.entry.id, 'phone_number': '+51111111111'},
            format='json',
        )
        self.assertEqual(response.status_code, 404)

    def test_cancel_already_cancelled_returns_400(self):
        self.entry.status = 'cancelled'
        self.entry.save()
        response = self.client_api.post(
            '/api/v1/appointments/waitlist/cancel/',
            {'entry_id': self.entry.id, 'phone_number': '+51987654321'},
            format='json',
        )
        self.assertEqual(response.status_code, 400)


class WaitlistNotifyOnCancellationTests(TestCase):
    """
    Cuando una cita se cancela, debe notificar al primer waitlist
    matcheable y generar claim_token.
    """

    def setUp(self):
        self.ctx = _setup_tenant()
        self.start = timezone.now() + timedelta(days=2)
        self.appointment = create_appointment_atomic(
            branch_id=self.ctx['branch'].id,
            client=self.ctx['client'],
            staff_id=self.ctx['staff'].id,
            service=self.ctx['service'],
            start_datetime=self.start,
            price=Decimal('50.00'),
            create_reminder=False,
        )
        self.appt_date = self.start.astimezone(timezone.get_current_timezone()).date()

    def test_cancelled_appointment_notifies_first_waitlist_entry(self):
        # Tres clientes en waitlist para esa fecha/servicio/sucursal
        e1 = WaitlistEntry.objects.create(
            branch=self.ctx['branch'], service=self.ctx['service'],
            phone_number='+51900000001', first_name='Primero',
            preferred_date=self.appt_date,
        )
        e2 = WaitlistEntry.objects.create(
            branch=self.ctx['branch'], service=self.ctx['service'],
            phone_number='+51900000002', first_name='Segundo',
            preferred_date=self.appt_date,
        )

        # Cancelar la cita
        self.appointment.cancel(cancelled_by='client')

        e1.refresh_from_db()
        e2.refresh_from_db()
        # FIFO: el primero gana
        self.assertEqual(e1.status, 'notified')
        self.assertTrue(e1.claim_token)
        self.assertIsNotNone(e1.notified_at)
        # El segundo sigue en espera
        self.assertEqual(e2.status, 'waiting')

    def test_no_match_when_different_branch(self):
        other_branch = Branch.objects.create(
            business=self.ctx['business'], name='Otra',
            slug=f'otra-{uuid.uuid4().hex[:6]}',
        )
        WaitlistEntry.objects.create(
            branch=other_branch, service=self.ctx['service'],
            phone_number='+51900000001', first_name='Otro',
            preferred_date=self.appt_date,
        )
        result = process_waitlist_for_appointment(self.appointment)
        self.assertIsNone(result)

    def test_no_match_when_staff_doesnt_coincide(self):
        # Crear otro staff que sí tiene asignado
        suffix = uuid.uuid4().hex[:6]
        other_user = User.objects.create_user(
            phone_number=f'+5188888{suffix}', role='staff',
        )
        other_staff = StaffMember.objects.create(
            user=other_user, first_name='Otro', last_name_paterno='Stylist',
            current_business=self.ctx['business'],
            document_type='dni', document_number=f'7{suffix}11',
        )
        other_staff.branches.add(self.ctx['branch'])

        # Entry pide específicamente el OTRO staff
        WaitlistEntry.objects.create(
            branch=self.ctx['branch'], service=self.ctx['service'],
            staff=other_staff,
            phone_number='+51900000001', first_name='Picky',
            preferred_date=self.appt_date,
        )
        result = process_waitlist_for_appointment(self.appointment)
        # No matchea porque pide otro staff
        self.assertIsNone(result)

    def test_match_when_staff_is_null(self):
        # Entry sin staff específico (acepta cualquiera)
        entry = WaitlistEntry.objects.create(
            branch=self.ctx['branch'], service=self.ctx['service'],
            staff=None,
            phone_number='+51900000001', first_name='Flexible',
            preferred_date=self.appt_date,
        )
        result = process_waitlist_for_appointment(self.appointment)
        self.assertIsNotNone(result)
        self.assertEqual(result.pk, entry.pk)

    def test_time_range_filter(self):
        # Cita es a las 14h (lo que sea); entry pide sólo mañanas
        morning_only = WaitlistEntry.objects.create(
            branch=self.ctx['branch'], service=self.ctx['service'],
            phone_number='+51900000001', first_name='Mañana',
            preferred_date=self.appt_date,
            preferred_time_start='06:00',
            preferred_time_end='09:00',
        )
        # Otra entry sin restricción horaria
        anytime = WaitlistEntry.objects.create(
            branch=self.ctx['branch'], service=self.ctx['service'],
            phone_number='+51900000002', first_name='Anytime',
            preferred_date=self.appt_date,
        )
        result = process_waitlist_for_appointment(self.appointment)
        morning_only.refresh_from_db()
        anytime.refresh_from_db()

        # La de mañana NO debe haber sido notificada (a menos que el
        # appointment caiga en su rango; lo controlamos abajo)
        appt_hour = self.appointment.start_datetime.astimezone(
            timezone.get_current_timezone()
        ).hour
        if 6 <= appt_hour <= 9:
            self.assertEqual(result.pk, morning_only.pk)
        else:
            # El anytime se notifica
            self.assertEqual(result.pk, anytime.pk)
            self.assertEqual(morning_only.status, 'waiting')

    def test_no_notification_when_appointment_already_past(self):
        """Citas pasadas no deben disparar waitlist (no tiene sentido)."""
        # Mover la cita al pasado (bypass model validation)
        Appointment.objects.filter(pk=self.appointment.pk).update(
            start_datetime=timezone.now() - timedelta(hours=2),
            end_datetime=timezone.now() - timedelta(hours=1, minutes=30),
        )
        self.appointment.refresh_from_db()

        WaitlistEntry.objects.create(
            branch=self.ctx['branch'], service=self.ctx['service'],
            phone_number='+51900000001', first_name='X',
            preferred_date=self.appt_date,
        )
        self.appointment.cancel(cancelled_by='system')
        # Como la cita estaba en el pasado, no debe haberse activado el waitlist
        entry = WaitlistEntry.objects.first()
        self.assertEqual(entry.status, 'waiting')


class WaitlistClaimTests(TestCase):
    """Tests para reclamar un slot liberado usando claim_token."""

    def setUp(self):
        self.ctx = _setup_tenant()
        self.client_api = APIClient()
        self.future_date = (timezone.now() + timedelta(days=2)).date()
        self.entry = WaitlistEntry.objects.create(
            branch=self.ctx['branch'],
            service=self.ctx['service'],
            phone_number='+51987654321',
            first_name='Ana',
            preferred_date=self.future_date,
            status='notified',
            claim_token='abc123_test_token',
            claim_token_expires_at=timezone.now() + timedelta(minutes=30),
            notified_at=timezone.now(),
        )

    def test_get_claim_shows_entry(self):
        response = self.client_api.get(
            f'/api/v1/appointments/waitlist/claim/{self.entry.claim_token}/'
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['entry']['id'], self.entry.id)

    def test_get_claim_invalid_token_returns_404(self):
        response = self.client_api.get(
            '/api/v1/appointments/waitlist/claim/no-existe/'
        )
        self.assertEqual(response.status_code, 404)

    def test_get_claim_expired_returns_400(self):
        self.entry.claim_token_expires_at = timezone.now() - timedelta(minutes=1)
        self.entry.save()
        response = self.client_api.get(
            f'/api/v1/appointments/waitlist/claim/{self.entry.claim_token}/'
        )
        self.assertEqual(response.status_code, 400)

    def test_post_claim_marks_as_claimed(self):
        response = self.client_api.post(
            f'/api/v1/appointments/waitlist/claim/{self.entry.claim_token}/'
        )
        self.assertEqual(response.status_code, 200)
        self.entry.refresh_from_db()
        self.assertEqual(self.entry.status, 'claimed')
        self.assertIsNotNone(self.entry.claimed_at)

    def test_post_claim_expired_returns_400_and_marks_expired(self):
        self.entry.claim_token_expires_at = timezone.now() - timedelta(minutes=1)
        self.entry.save()
        response = self.client_api.post(
            f'/api/v1/appointments/waitlist/claim/{self.entry.claim_token}/'
        )
        self.assertEqual(response.status_code, 400)
        self.entry.refresh_from_db()
        self.assertEqual(self.entry.status, 'expired')

    def test_post_claim_already_claimed_returns_400(self):
        self.entry.status = 'claimed'
        self.entry.save()
        response = self.client_api.post(
            f'/api/v1/appointments/waitlist/claim/{self.entry.claim_token}/'
        )
        self.assertEqual(response.status_code, 400)

    def test_claim_function_raises_for_invalid_token(self):
        with self.assertRaises(WaitlistClaimError):
            claim_waitlist_slot(token='no-existe')


class WaitlistClaimCreatesAppointmentTests(TestCase):
    """
    Cuando el waitlist está vinculado a un slot específico
    (notified_for_*), reclamar debe crear la cita en una sola operación.
    """

    def setUp(self):
        self.ctx = _setup_tenant()
        self.client_api = APIClient()
        self.future_start = timezone.now() + timedelta(days=2)
        self.future_date = self.future_start.astimezone(
            timezone.get_current_timezone()
        ).date()

        # Entry notificada con slot exacto
        self.entry = WaitlistEntry.objects.create(
            branch=self.ctx['branch'],
            service=self.ctx['service'],
            phone_number='+51987654321',
            first_name='Ana',
            preferred_date=self.future_date,
            status='notified',
            claim_token='tkn-with-slot',
            claim_token_expires_at=timezone.now() + timedelta(minutes=30),
            notified_at=timezone.now(),
            notified_for_staff=self.ctx['staff'],
            notified_for_start_datetime=self.future_start,
            notified_for_end_datetime=self.future_start + timedelta(minutes=30),
        )

    def test_claim_creates_appointment(self):
        response = self.client_api.post(
            '/api/v1/appointments/waitlist/claim/tkn-with-slot/'
        )
        self.assertEqual(response.status_code, 200, response.content)
        self.assertIn('appointment', response.data)
        self.assertEqual(response.data['appointment']['status'], 'confirmed')

        # Verificar en DB
        self.entry.refresh_from_db()
        self.assertEqual(self.entry.status, 'claimed')

        appointment = Appointment.objects.get(
            pk=response.data['appointment']['id']
        )
        self.assertEqual(appointment.staff_id, self.ctx['staff'].id)
        self.assertEqual(appointment.service_id, self.ctx['service'].id)

    def test_claim_conflict_marks_entry_expired(self):
        """Si entre notify y claim alguien ocupó el slot, devolver error."""
        # Crear cita conflictiva en el mismo slot
        create_appointment_atomic(
            branch_id=self.ctx['branch'].id,
            client=self.ctx['client'],
            staff_id=self.ctx['staff'].id,
            service=self.ctx['service'],
            start_datetime=self.future_start,
            price=Decimal('50.00'),
            create_reminder=False,
        )

        response = self.client_api.post(
            '/api/v1/appointments/waitlist/claim/tkn-with-slot/'
        )
        self.assertEqual(response.status_code, 400)
        self.entry.refresh_from_db()
        # Como el slot se ocupó, marcamos como expired para liberar la cola
        self.assertEqual(self.entry.status, 'expired')

    def test_claim_creates_new_client_when_unknown(self):
        """Si el phone del waitlist no corresponde a un Client, se crea uno."""
        # Phone diferente al de _setup_tenant
        self.entry.phone_number = '+51900111222'
        self.entry.first_name = 'NuevoCliente'
        self.entry.save()

        response = self.client_api.post(
            '/api/v1/appointments/waitlist/claim/tkn-with-slot/'
        )
        self.assertEqual(response.status_code, 200)

        from apps.accounts.models import Client
        created = Client.objects.filter(phone_number='+51900111222').first()
        self.assertIsNotNone(created)
        self.assertEqual(created.first_name, 'NuevoCliente')


class WaitlistEntryStoresSlotOnNotificationTests(TestCase):
    """
    Verifica que process_waitlist_for_appointment guarde
    notified_for_staff/start/end al notificar al cliente.
    """

    def setUp(self):
        self.ctx = _setup_tenant()
        self.start = timezone.now() + timedelta(days=2)
        self.appointment = create_appointment_atomic(
            branch_id=self.ctx['branch'].id,
            client=self.ctx['client'],
            staff_id=self.ctx['staff'].id,
            service=self.ctx['service'],
            start_datetime=self.start,
            price=Decimal('50.00'),
            create_reminder=False,
        )
        self.appt_date = self.start.astimezone(timezone.get_current_timezone()).date()

    def test_notification_records_freed_slot(self):
        entry = WaitlistEntry.objects.create(
            branch=self.ctx['branch'], service=self.ctx['service'],
            phone_number='+51900000001', first_name='X',
            preferred_date=self.appt_date,
        )
        # Cancelar dispara el signal
        self.appointment.cancel(cancelled_by='client')
        entry.refresh_from_db()

        self.assertEqual(entry.status, 'notified')
        self.assertEqual(entry.notified_for_staff_id, self.ctx['staff'].id)
        self.assertEqual(entry.notified_for_start_datetime, self.appointment.start_datetime)
        self.assertEqual(entry.notified_for_end_datetime, self.appointment.end_datetime)


class WaitlistExpirationTests(TestCase):
    """
    Tests del sweep que expira entries 'notified' y promueve al siguiente.
    """

    def setUp(self):
        self.ctx = _setup_tenant()
        self.future_date = (timezone.now() + timedelta(days=2)).date()

    def test_expires_notification_past_ttl(self):
        entry = WaitlistEntry.objects.create(
            branch=self.ctx['branch'],
            service=self.ctx['service'],
            phone_number='+51987654321',
            first_name='Ana',
            preferred_date=self.future_date,
            status='notified',
            claim_token='tkn',
            claim_token_expires_at=timezone.now() - timedelta(minutes=1),
        )
        expired, promoted = expire_old_waitlist_notifications()
        self.assertEqual(expired, 1)
        entry.refresh_from_db()
        self.assertEqual(entry.status, 'expired')

    def test_promotes_next_in_line(self):
        # Primer entry: notificado y a punto de expirar
        first = WaitlistEntry.objects.create(
            branch=self.ctx['branch'],
            service=self.ctx['service'],
            phone_number='+51111111111',
            first_name='Primero',
            preferred_date=self.future_date,
            status='notified',
            claim_token='tkn-first',
            claim_token_expires_at=timezone.now() - timedelta(minutes=1),
        )
        # Segundo: en espera
        second = WaitlistEntry.objects.create(
            branch=self.ctx['branch'],
            service=self.ctx['service'],
            phone_number='+51222222222',
            first_name='Segundo',
            preferred_date=self.future_date,
            status='waiting',
        )

        expired, promoted = expire_old_waitlist_notifications()
        self.assertEqual(expired, 1)
        self.assertEqual(promoted, 1)

        first.refresh_from_db()
        second.refresh_from_db()
        self.assertEqual(first.status, 'expired')
        self.assertEqual(second.status, 'notified')
        self.assertTrue(second.claim_token)

    def test_doesnt_expire_vigent_notifications(self):
        WaitlistEntry.objects.create(
            branch=self.ctx['branch'],
            service=self.ctx['service'],
            phone_number='+51987654321',
            first_name='Vigente',
            preferred_date=self.future_date,
            status='notified',
            claim_token='tkn',
            claim_token_expires_at=timezone.now() + timedelta(minutes=15),
        )
        expired, promoted = expire_old_waitlist_notifications()
        self.assertEqual(expired, 0)
        self.assertEqual(promoted, 0)

    def test_no_promotion_when_no_one_waiting(self):
        entry = WaitlistEntry.objects.create(
            branch=self.ctx['branch'],
            service=self.ctx['service'],
            phone_number='+51987654321',
            first_name='Solo',
            preferred_date=self.future_date,
            status='notified',
            claim_token='tkn',
            claim_token_expires_at=timezone.now() - timedelta(minutes=1),
        )
        expired, promoted = expire_old_waitlist_notifications()
        self.assertEqual(expired, 1)
        self.assertEqual(promoted, 0)
