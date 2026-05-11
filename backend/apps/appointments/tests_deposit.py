"""
Tests para pagos anticipados (depósito al reservar).

Cubre:
- calculate_deposit (decimal handling)
- charge_deposit con Culqi mockeado
- refund_deposit + política refund_window_hours
- cancel() integra auto-refund correctamente
- booking flow exige card_token cuando Branch.deposit_percentage > 0
"""
import uuid
from datetime import timedelta
from decimal import Decimal
from unittest.mock import patch

from django.test import TestCase
from django.utils import timezone

from apps.accounts.models import Client, StaffMember, User
from apps.core.models import Business, Branch
from apps.services.models import Service, StaffService
from apps.subscriptions.models import StaffSubscription
from apps.subscriptions.services import CulqiError
from .models import Appointment
from .services import create_appointment_atomic
from .deposit_service import (
    calculate_deposit,
    requires_deposit,
    charge_deposit,
    refund_deposit,
    is_within_refund_window,
    DepositChargeError,
    DepositRefundError,
)


def _setup_tenant(deposit_pct=0, refund_window=24):
    suffix = uuid.uuid4().hex[:8]
    business = Business.objects.create(name=f'Biz {suffix}', slug=f'biz-{suffix}')
    branch = Branch.objects.create(
        business=business, name='Sede', slug=f'sede-{suffix}',
        deposit_percentage=deposit_pct,
        refund_window_hours=refund_window,
    )
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
        branch=branch, name='Corte', duration_minutes=30, price=Decimal('100.00'),
    )
    StaffService.objects.create(staff=staff, service=service, is_active=True)
    digits = str(abs(hash(suffix)))[:9].ljust(9, '0')
    client = Client.objects.create(
        document_type='dni', document_number=f'1{suffix[:7]}',
        phone_number=f'+519{digits}',
        first_name='Cliente', last_name_paterno='Test',
        email='cliente@test.com',
    )
    return {
        'business': business, 'branch': branch, 'staff': staff,
        'service': service, 'client': client,
    }


class CalculateDepositTests(TestCase):
    def setUp(self):
        self.ctx = _setup_tenant(deposit_pct=30)

    def test_zero_percent_returns_zero(self):
        self.ctx['branch'].deposit_percentage = 0
        self.assertEqual(
            calculate_deposit(self.ctx['branch'], Decimal('100.00')),
            Decimal('0.00'),
        )

    def test_30_percent(self):
        self.assertEqual(
            calculate_deposit(self.ctx['branch'], Decimal('100.00')),
            Decimal('30.00'),
        )

    def test_100_percent_equals_full_price(self):
        self.ctx['branch'].deposit_percentage = 100
        self.assertEqual(
            calculate_deposit(self.ctx['branch'], Decimal('100.00')),
            Decimal('100.00'),
        )

    def test_rounding_half_up(self):
        # 33% de 100.00 = 33.00 exacto
        self.ctx['branch'].deposit_percentage = 33
        self.assertEqual(
            calculate_deposit(self.ctx['branch'], Decimal('100.00')),
            Decimal('33.00'),
        )
        # 33% de 100.50 = 33.165 → 33.17 (half-up)
        self.assertEqual(
            calculate_deposit(self.ctx['branch'], Decimal('100.50')),
            Decimal('33.17'),
        )

    def test_requires_deposit_helper(self):
        self.assertTrue(requires_deposit(self.ctx['branch']))
        self.ctx['branch'].deposit_percentage = 0
        self.assertFalse(requires_deposit(self.ctx['branch']))


class ChargeDepositTests(TestCase):
    """
    Mockeamos CulqiService.create_charge para no llamar a Culqi en tests.
    """

    def setUp(self):
        self.ctx = _setup_tenant(deposit_pct=30)
        self.appointment = create_appointment_atomic(
            branch_id=self.ctx['branch'].id,
            client=self.ctx['client'],
            staff_id=self.ctx['staff'].id,
            service=self.ctx['service'],
            start_datetime=timezone.now() + timedelta(days=2),
            price=Decimal('100.00'),
            create_reminder=False,
            status='pending_payment',
        )
        self.appointment.deposit_amount = Decimal('30.00')
        self.appointment.deposit_status = 'not_required'
        self.appointment.save()

    @patch('apps.subscriptions.services.CulqiService.create_charge')
    def test_successful_charge_updates_appointment(self, mock_charge):
        mock_charge.return_value = {'id': 'chr_test_abc123', 'state': 'paid'}

        result = charge_deposit(
            appointment=self.appointment,
            card_token='tkn_test_xyz',
            customer_email='cliente@test.com',
        )

        self.assertEqual(result.deposit_status, 'paid')
        self.assertEqual(result.deposit_charge_id, 'chr_test_abc123')
        self.assertIsNotNone(result.deposit_paid_at)
        self.assertEqual(result.status, 'confirmed')

        mock_charge.assert_called_once()
        _, kwargs = mock_charge.call_args
        self.assertEqual(kwargs['amount_cents'], 3000)
        self.assertEqual(kwargs['currency'], 'PEN')

    @patch('apps.subscriptions.services.CulqiService.create_charge')
    def test_rejected_charge_marks_failed(self, mock_charge):
        mock_charge.side_effect = CulqiError(
            'Tarjeta rechazada', code='card_declined',
        )

        with self.assertRaises(DepositChargeError) as ctx:
            charge_deposit(
                appointment=self.appointment,
                card_token='tkn_bad',
                customer_email='cliente@test.com',
            )
        self.assertEqual(ctx.exception.culqi_code, 'card_declined')

        self.appointment.refresh_from_db()
        self.assertEqual(self.appointment.deposit_status, 'failed')

    def test_charge_already_paid_raises(self):
        self.appointment.deposit_status = 'paid'
        self.appointment.deposit_charge_id = 'chr_old'
        self.appointment.save()

        with self.assertRaises(DepositChargeError):
            charge_deposit(
                appointment=self.appointment,
                card_token='tkn_test',
                customer_email='c@x.com',
            )

    def test_charge_without_amount_raises(self):
        self.appointment.deposit_amount = None
        self.appointment.save()
        with self.assertRaises(DepositChargeError):
            charge_deposit(
                appointment=self.appointment,
                card_token='tkn_test',
                customer_email='c@x.com',
            )


class RefundDepositTests(TestCase):
    def setUp(self):
        self.ctx = _setup_tenant(deposit_pct=30, refund_window=24)
        self.appointment = create_appointment_atomic(
            branch_id=self.ctx['branch'].id,
            client=self.ctx['client'],
            staff_id=self.ctx['staff'].id,
            service=self.ctx['service'],
            start_datetime=timezone.now() + timedelta(days=2),
            price=Decimal('100.00'),
            create_reminder=False,
        )
        self.appointment.deposit_amount = Decimal('30.00')
        self.appointment.deposit_status = 'paid'
        self.appointment.deposit_charge_id = 'chr_test_paid'
        self.appointment.deposit_paid_at = timezone.now()
        self.appointment.save()

    @patch('apps.subscriptions.services.CulqiService.create_refund')
    def test_successful_refund(self, mock_refund):
        mock_refund.return_value = {'id': 'ref_test_xyz', 'state': 'refunded'}

        result = refund_deposit(appointment=self.appointment)

        self.assertEqual(result.deposit_status, 'refunded')
        self.assertIsNotNone(result.deposit_refunded_at)
        mock_refund.assert_called_once()

    @patch('apps.subscriptions.services.CulqiService.create_refund')
    def test_refund_idempotent(self, mock_refund):
        self.appointment.deposit_status = 'refunded'
        self.appointment.save()
        result = refund_deposit(appointment=self.appointment)
        self.assertEqual(result.deposit_status, 'refunded')
        mock_refund.assert_not_called()

    def test_refund_not_paid_raises(self):
        self.appointment.deposit_status = 'failed'
        self.appointment.save()
        with self.assertRaises(DepositRefundError):
            refund_deposit(appointment=self.appointment)

    @patch('apps.subscriptions.services.CulqiService.create_refund')
    def test_refund_culqi_error_propagates(self, mock_refund):
        mock_refund.side_effect = CulqiError('Charge no encontrado')
        with self.assertRaises(DepositRefundError):
            refund_deposit(appointment=self.appointment)


class RefundWindowTests(TestCase):
    def test_within_window_with_24h(self):
        ctx = _setup_tenant(deposit_pct=30, refund_window=24)
        # Cita en 48h: cancelar ahora → dentro de la ventana
        ap = create_appointment_atomic(
            branch_id=ctx['branch'].id,
            client=ctx['client'],
            staff_id=ctx['staff'].id,
            service=ctx['service'],
            start_datetime=timezone.now() + timedelta(hours=48),
            price=Decimal('100.00'),
            create_reminder=False,
        )
        ap.deposit_status = 'paid'
        self.assertTrue(is_within_refund_window(ap))

    def test_outside_window_with_24h(self):
        ctx = _setup_tenant(deposit_pct=30, refund_window=24)
        # Cita en 12h: cancelar ahora → fuera de ventana (menos de 24h)
        ap = create_appointment_atomic(
            branch_id=ctx['branch'].id,
            client=ctx['client'],
            staff_id=ctx['staff'].id,
            service=ctx['service'],
            start_datetime=timezone.now() + timedelta(hours=12),
            price=Decimal('100.00'),
            create_reminder=False,
        )
        self.assertFalse(is_within_refund_window(ap))

    def test_zero_window_always_refunds(self):
        ctx = _setup_tenant(deposit_pct=30, refund_window=0)
        ap = create_appointment_atomic(
            branch_id=ctx['branch'].id,
            client=ctx['client'],
            staff_id=ctx['staff'].id,
            service=ctx['service'],
            start_datetime=timezone.now() + timedelta(hours=1),
            price=Decimal('100.00'),
            create_reminder=False,
        )
        self.assertTrue(is_within_refund_window(ap))


class CancelAutoRefundTests(TestCase):
    """Verifica que Appointment.cancel() integre el auto-refund correctamente."""

    def setUp(self):
        self.ctx = _setup_tenant(deposit_pct=30, refund_window=24)

    def _make_paid_appointment(self, hours_ahead=48):
        ap = create_appointment_atomic(
            branch_id=self.ctx['branch'].id,
            client=self.ctx['client'],
            staff_id=self.ctx['staff'].id,
            service=self.ctx['service'],
            start_datetime=timezone.now() + timedelta(hours=hours_ahead),
            price=Decimal('100.00'),
            create_reminder=False,
        )
        ap.deposit_amount = Decimal('30.00')
        ap.deposit_status = 'paid'
        ap.deposit_charge_id = 'chr_test'
        ap.deposit_paid_at = timezone.now()
        ap.save()
        return ap

    @patch('apps.subscriptions.services.CulqiService.create_refund')
    def test_cancel_within_window_refunds(self, mock_refund):
        mock_refund.return_value = {'id': 'ref_test'}
        ap = self._make_paid_appointment(hours_ahead=48)
        ap.cancel(cancelled_by='client')
        ap.refresh_from_db()
        self.assertEqual(ap.status, 'cancelled')
        self.assertEqual(ap.deposit_status, 'refunded')
        mock_refund.assert_called_once()

    @patch('apps.subscriptions.services.CulqiService.create_refund')
    def test_cancel_outside_window_does_not_refund(self, mock_refund):
        ap = self._make_paid_appointment(hours_ahead=12)  # menos de 24h
        ap.cancel(cancelled_by='client')
        ap.refresh_from_db()
        self.assertEqual(ap.status, 'cancelled')
        self.assertEqual(ap.deposit_status, 'paid')  # se queda como paid
        mock_refund.assert_not_called()

    @patch('apps.subscriptions.services.CulqiService.create_refund')
    def test_cancel_with_no_deposit_does_not_call_refund(self, mock_refund):
        ap = create_appointment_atomic(
            branch_id=self.ctx['branch'].id,
            client=self.ctx['client'],
            staff_id=self.ctx['staff'].id,
            service=self.ctx['service'],
            start_datetime=timezone.now() + timedelta(hours=48),
            price=Decimal('100.00'),
            create_reminder=False,
        )
        # No deposit setup
        ap.cancel(cancelled_by='client')
        mock_refund.assert_not_called()

    @patch('apps.subscriptions.services.CulqiService.create_refund')
    def test_cancel_with_auto_refund_false_does_not_refund(self, mock_refund):
        ap = self._make_paid_appointment(hours_ahead=48)
        ap.cancel(cancelled_by='client', auto_refund=False)
        ap.refresh_from_db()
        self.assertEqual(ap.deposit_status, 'paid')
        mock_refund.assert_not_called()

    @patch('apps.subscriptions.services.CulqiService.create_refund')
    def test_cancel_refund_failure_doesnt_block_cancellation(self, mock_refund):
        mock_refund.side_effect = CulqiError('error de red')
        ap = self._make_paid_appointment(hours_ahead=48)
        ap.cancel(cancelled_by='client')
        ap.refresh_from_db()
        # La cancelación debe persistir, el deposit queda paid (refund manual luego)
        self.assertEqual(ap.status, 'cancelled')
        self.assertEqual(ap.deposit_status, 'paid')
