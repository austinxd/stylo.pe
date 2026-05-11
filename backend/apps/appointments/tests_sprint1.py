"""
Tests para los fixes del Sprint 1 en appointments.

Cubre:
- Race condition: create_appointment_atomic detecta conflictos
- Service snapshot: borrar Service preserva snapshot
- Cancel reminders: signal limpia reminders al transicionar a estado terminal
"""
import uuid
from datetime import timedelta
from decimal import Decimal

from django.test import TestCase
from django.utils import timezone

from apps.core.models import Business, Branch
from apps.accounts.models import User, Client, StaffMember
from apps.services.models import Service, StaffService
from apps.subscriptions.models import StaffSubscription
from .models import Appointment, AppointmentReminder  # noqa: F401
from .services import (
    create_appointment_atomic,
    reschedule_appointment_atomic,
    AppointmentConflictError,
)


def _setup_business_with_staff():
    """Crea un negocio con sucursal + staff + servicio activos."""
    suffix = uuid.uuid4().hex[:8]
    business = Business.objects.create(name=f'Test {suffix}', slug=f'test-{suffix}')
    branch = Branch.objects.create(
        business=business, name='Centro', slug=f'centro-{suffix}'
    )

    user = User.objects.create_user(
        phone_number=f'+5190000{suffix[:4]}',
        role='staff',
    )
    staff = StaffMember.objects.create(
        user=user,
        first_name='Ana',
        last_name_paterno='Pérez',
        current_business=business,
        document_type='dni',
        document_number=f'8{suffix[:7]}',
    )
    staff.branches.add(branch)

    # Suscripción billable
    StaffSubscription.objects.create(
        staff=staff,
        business=business,
        is_active=True,
        is_billable=True,
        trial_ends_at=timezone.now() + timedelta(days=365),
    )

    service = Service.objects.create(
        branch=branch,
        name='Corte',
        duration_minutes=30,
        price=Decimal('50.00'),
    )
    StaffService.objects.create(staff=staff, service=service, is_active=True)

    client = Client.objects.create(
        document_type='dni',
        document_number=f'1{suffix[:7]}',
        phone_number=f'+51999{suffix[:6]}',
        first_name='Cliente',
        last_name_paterno='Test',
    )

    return {
        'business': business,
        'branch': branch,
        'staff': staff,
        'service': service,
        'client': client,
    }


class CreateAppointmentAtomicTests(TestCase):
    def setUp(self):
        self.ctx = _setup_business_with_staff()
        self.start = timezone.now() + timedelta(days=2)

    def test_creates_appointment_successfully(self):
        ap = create_appointment_atomic(
            branch_id=self.ctx['branch'].id,
            client=self.ctx['client'],
            staff_id=self.ctx['staff'].id,
            service=self.ctx['service'],
            start_datetime=self.start,
            price=Decimal('50.00'),
            create_reminder=False,
        )
        self.assertIsNotNone(ap.id)
        self.assertEqual(ap.status, 'confirmed')
        # Snapshot capturado
        self.assertEqual(ap.service_name_snapshot, 'Corte')
        self.assertEqual(ap.service_duration_snapshot, 30)

    def test_rejects_exact_overlap(self):
        create_appointment_atomic(
            branch_id=self.ctx['branch'].id,
            client=self.ctx['client'],
            staff_id=self.ctx['staff'].id,
            service=self.ctx['service'],
            start_datetime=self.start,
            price=Decimal('50.00'),
            create_reminder=False,
        )
        with self.assertRaises(AppointmentConflictError):
            create_appointment_atomic(
                branch_id=self.ctx['branch'].id,
                client=self.ctx['client'],
                staff_id=self.ctx['staff'].id,
                service=self.ctx['service'],
                start_datetime=self.start,
                price=Decimal('50.00'),
                create_reminder=False,
            )

    def test_rejects_partial_overlap(self):
        # Cita A: 14:00–14:30
        create_appointment_atomic(
            branch_id=self.ctx['branch'].id,
            client=self.ctx['client'],
            staff_id=self.ctx['staff'].id,
            service=self.ctx['service'],
            start_datetime=self.start,
            price=Decimal('50.00'),
            create_reminder=False,
        )
        # Cita B: 14:15–14:45 → cruza la mitad de A
        with self.assertRaises(AppointmentConflictError):
            create_appointment_atomic(
                branch_id=self.ctx['branch'].id,
                client=self.ctx['client'],
                staff_id=self.ctx['staff'].id,
                service=self.ctx['service'],
                start_datetime=self.start + timedelta(minutes=15),
                price=Decimal('50.00'),
                create_reminder=False,
            )

    def test_back_to_back_is_allowed(self):
        # Cita A: 14:00–14:30
        create_appointment_atomic(
            branch_id=self.ctx['branch'].id,
            client=self.ctx['client'],
            staff_id=self.ctx['staff'].id,
            service=self.ctx['service'],
            start_datetime=self.start,
            price=Decimal('50.00'),
            create_reminder=False,
        )
        # Cita B: 14:30–15:00 → empieza cuando termina A, no es conflicto
        ap2 = create_appointment_atomic(
            branch_id=self.ctx['branch'].id,
            client=self.ctx['client'],
            staff_id=self.ctx['staff'].id,
            service=self.ctx['service'],
            start_datetime=self.start + timedelta(minutes=30),
            price=Decimal('50.00'),
            create_reminder=False,
        )
        self.assertIsNotNone(ap2.id)

    def test_cancelled_appointment_doesnt_block_slot(self):
        # Cita A creada y cancelada
        ap_a = create_appointment_atomic(
            branch_id=self.ctx['branch'].id,
            client=self.ctx['client'],
            staff_id=self.ctx['staff'].id,
            service=self.ctx['service'],
            start_datetime=self.start,
            price=Decimal('50.00'),
            create_reminder=False,
        )
        ap_a.cancel(cancelled_by='client')

        # Cita B en el mismo horario debe poder crearse
        ap_b = create_appointment_atomic(
            branch_id=self.ctx['branch'].id,
            client=self.ctx['client'],
            staff_id=self.ctx['staff'].id,
            service=self.ctx['service'],
            start_datetime=self.start,
            price=Decimal('50.00'),
            create_reminder=False,
        )
        self.assertNotEqual(ap_a.id, ap_b.id)

    def test_different_staff_no_conflict(self):
        ctx2 = _setup_business_with_staff()  # otro staff
        create_appointment_atomic(
            branch_id=self.ctx['branch'].id,
            client=self.ctx['client'],
            staff_id=self.ctx['staff'].id,
            service=self.ctx['service'],
            start_datetime=self.start,
            price=Decimal('50.00'),
            create_reminder=False,
        )
        # Otro staff en el mismo horario: OK
        ap2 = create_appointment_atomic(
            branch_id=ctx2['branch'].id,
            client=ctx2['client'],
            staff_id=ctx2['staff'].id,
            service=ctx2['service'],
            start_datetime=self.start,
            price=Decimal('50.00'),
            create_reminder=False,
        )
        self.assertIsNotNone(ap2.id)

    def test_creates_reminder_24h_before(self):
        future = timezone.now() + timedelta(days=3)
        ap = create_appointment_atomic(
            branch_id=self.ctx['branch'].id,
            client=self.ctx['client'],
            staff_id=self.ctx['staff'].id,
            service=self.ctx['service'],
            start_datetime=future,
            price=Decimal('50.00'),
            create_reminder=True,
        )
        reminder = ap.reminders.first()
        self.assertIsNotNone(reminder)
        # ~24h antes (con tolerancia de segundos)
        delta = future - reminder.scheduled_at
        self.assertAlmostEqual(delta.total_seconds(), 24 * 3600, delta=5)

    def test_no_reminder_if_appointment_too_soon(self):
        # Cita a 1 hora: 24h antes ya pasó → no reminder
        soon = timezone.now() + timedelta(hours=1)
        ap = create_appointment_atomic(
            branch_id=self.ctx['branch'].id,
            client=self.ctx['client'],
            staff_id=self.ctx['staff'].id,
            service=self.ctx['service'],
            start_datetime=soon,
            price=Decimal('50.00'),
            create_reminder=True,
        )
        self.assertEqual(ap.reminders.count(), 0)


class ServiceSnapshotTests(TestCase):
    def setUp(self):
        self.ctx = _setup_business_with_staff()

    def test_snapshot_persists_after_service_deleted(self):
        ap = create_appointment_atomic(
            branch_id=self.ctx['branch'].id,
            client=self.ctx['client'],
            staff_id=self.ctx['staff'].id,
            service=self.ctx['service'],
            start_datetime=timezone.now() + timedelta(days=1),
            price=Decimal('50.00'),
            create_reminder=False,
        )
        ap_id = ap.id
        # Borrar el servicio
        self.ctx['service'].delete()

        # La cita sigue existiendo
        ap_reloaded = Appointment.objects.get(pk=ap_id)
        self.assertIsNone(ap_reloaded.service_id)  # SET_NULL aplicado
        self.assertEqual(ap_reloaded.service_name_snapshot, 'Corte')
        self.assertEqual(ap_reloaded.service_duration_snapshot, 30)
        self.assertEqual(ap_reloaded.service_display_name, 'Corte')

    def test_service_display_name_uses_current_when_available(self):
        ap = create_appointment_atomic(
            branch_id=self.ctx['branch'].id,
            client=self.ctx['client'],
            staff_id=self.ctx['staff'].id,
            service=self.ctx['service'],
            start_datetime=timezone.now() + timedelta(days=1),
            price=Decimal('50.00'),
            create_reminder=False,
        )
        # Renombrar Service después de crear la cita
        self.ctx['service'].name = 'Corte Premium'
        self.ctx['service'].save()
        ap.refresh_from_db()
        # display name usa el actual (snapshot está para cuando se borre)
        self.assertEqual(ap.service_display_name, 'Corte Premium')

    def test_service_display_name_fallback_when_no_snapshot_and_no_service(self):
        ap = Appointment(
            branch=self.ctx['branch'],
            client=self.ctx['client'],
            staff=self.ctx['staff'],
            service=None,
            start_datetime=timezone.now() + timedelta(days=1),
            end_datetime=timezone.now() + timedelta(days=1, minutes=30),
            price=Decimal('50.00'),
        )
        # Sin servicio ni snapshot
        self.assertEqual(ap.service_display_name, 'Servicio eliminado')


class CancelClearsRemindersTests(TestCase):
    def setUp(self):
        self.ctx = _setup_business_with_staff()
        self.ap = create_appointment_atomic(
            branch_id=self.ctx['branch'].id,
            client=self.ctx['client'],
            staff_id=self.ctx['staff'].id,
            service=self.ctx['service'],
            start_datetime=timezone.now() + timedelta(days=3),
            price=Decimal('50.00'),
            create_reminder=True,
        )
        # Confirmar que sí hay reminder pendiente
        self.assertEqual(self.ap.reminders.filter(status='pending').count(), 1)

    def test_cancel_method_clears_pending_reminders(self):
        self.ap.cancel(cancelled_by='client')
        self.assertEqual(self.ap.reminders.filter(status='pending').count(), 0)
        self.assertEqual(self.ap.reminders.filter(status='cancelled').count(), 1)

    def test_status_change_to_cancelled_via_save_clears_reminders(self):
        # Cambiar via .save() (como hace el dashboard update_status)
        self.ap.status = 'cancelled'
        self.ap.save()
        self.assertEqual(self.ap.reminders.filter(status='pending').count(), 0)

    def test_status_change_to_no_show_clears_reminders(self):
        self.ap.status = 'no_show'
        self.ap.save()
        self.assertEqual(self.ap.reminders.filter(status='pending').count(), 0)

    def test_status_change_to_completed_clears_reminders(self):
        self.ap.status = 'completed'
        self.ap.save()
        self.assertEqual(self.ap.reminders.filter(status='pending').count(), 0)

    def test_already_sent_reminders_are_not_touched(self):
        reminder = self.ap.reminders.first()
        reminder.status = 'sent'
        reminder.save()
        self.ap.cancel(cancelled_by='client')
        reminder.refresh_from_db()
        self.assertEqual(reminder.status, 'sent')  # no se sobreescribe


class RescheduleTests(TestCase):
    def setUp(self):
        self.ctx = _setup_business_with_staff()
        self.start = timezone.now() + timedelta(days=2)
        self.ap = create_appointment_atomic(
            branch_id=self.ctx['branch'].id,
            client=self.ctx['client'],
            staff_id=self.ctx['staff'].id,
            service=self.ctx['service'],
            start_datetime=self.start,
            price=Decimal('50.00'),
            create_reminder=False,
        )

    def test_reschedule_to_free_slot(self):
        new_start = self.start + timedelta(hours=2)
        ap = reschedule_appointment_atomic(
            appointment=self.ap,
            new_start_datetime=new_start,
        )
        self.assertEqual(ap.start_datetime, new_start)

    def test_reschedule_to_conflict_fails(self):
        # Crear otra cita en otro horario
        other_start = self.start + timedelta(hours=2)
        create_appointment_atomic(
            branch_id=self.ctx['branch'].id,
            client=self.ctx['client'],
            staff_id=self.ctx['staff'].id,
            service=self.ctx['service'],
            start_datetime=other_start,
            price=Decimal('50.00'),
            create_reminder=False,
        )
        with self.assertRaises(AppointmentConflictError):
            reschedule_appointment_atomic(
                appointment=self.ap,
                new_start_datetime=other_start,
            )

    def test_reschedule_uses_snapshot_when_service_deleted(self):
        # Borrar service después de crear
        self.ctx['service'].delete()
        self.ap.refresh_from_db()
        new_start = self.start + timedelta(hours=3)
        ap = reschedule_appointment_atomic(
            appointment=self.ap,
            new_start_datetime=new_start,
        )
        # Duración viene del snapshot (30 min)
        self.assertEqual(
            (ap.end_datetime - ap.start_datetime).total_seconds(), 30 * 60
        )
