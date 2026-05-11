"""
Servicio de pagos anticipados (depósito al reservar).

Provee:
- calculate_deposit: cuánto cobrar según Branch.deposit_percentage
- charge_deposit: cobra via Culqi y actualiza el Appointment
- refund_deposit: reembolsa si la cancelación lo permite

Diseño:
- El cobro va por Culqi.create_charge (ya existente en subscriptions).
- El frontend tokeniza la tarjeta con Culqi.js y envía un token de un solo uso.
- Si el cobro falla, levantamos DepositChargeError y el booking no se confirma.
- El charge ID se guarda en Appointment.deposit_charge_id para poder
  reembolsar después.
"""
from __future__ import annotations

import logging
from datetime import timedelta
from decimal import Decimal, ROUND_HALF_UP
from typing import TYPE_CHECKING

from django.db import transaction
from django.utils import timezone

if TYPE_CHECKING:
    from apps.core.models import Branch
    from .models import Appointment

logger = logging.getLogger(__name__)


class DepositChargeError(Exception):
    """Cobro de depósito falló."""
    def __init__(self, message: str, culqi_code: str | None = None):
        super().__init__(message)
        self.culqi_code = culqi_code


class DepositRefundError(Exception):
    """Reembolso de depósito falló."""


def calculate_deposit(branch: 'Branch', price: Decimal) -> Decimal:
    """
    Calcula el monto del depósito según el % de la sucursal.

    Retorna Decimal con 2 decimales. Si la sucursal no exige depósito,
    retorna Decimal('0.00').
    """
    pct = int(branch.deposit_percentage or 0)
    if pct <= 0:
        return Decimal('0.00')
    if pct >= 100:
        return Decimal(price).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
    return (Decimal(price) * Decimal(pct) / Decimal(100)).quantize(
        Decimal('0.01'), rounding=ROUND_HALF_UP,
    )


def requires_deposit(branch: 'Branch') -> bool:
    """True si la sucursal requiere depósito al reservar."""
    return int(branch.deposit_percentage or 0) > 0


def charge_deposit(
    *,
    appointment: 'Appointment',
    card_token: str,
    customer_email: str,
) -> 'Appointment':
    """
    Cobra el depósito de una cita usando un token de Culqi.

    Args:
        appointment: cita con deposit_amount precalculado y deposit_status
                     != 'paid'. El estado de la cita debería ser
                     'pending_payment'.
        card_token: token de un solo uso obtenido en el frontend con
                    Culqi.js (tkn_test_xxx o tkn_live_xxx).
        customer_email: email para Culqi. Si el cliente no tiene email
                        usar uno placeholder ya que Culqi lo exige.

    Levanta DepositChargeError si Culqi rechaza. En ese caso el estado
    queda 'failed' y la cita NO se confirma.

    Actualiza el Appointment en éxito:
      - deposit_status = 'paid'
      - deposit_charge_id = charge.id
      - deposit_paid_at = ahora
      - status = 'confirmed' (transición desde pending_payment)

    El marcado 'failed' se hace en una transacción separada para que
    persista incluso cuando se levante la excepción (anti-rollback).
    """
    from apps.subscriptions.services import CulqiService, CulqiError

    if not appointment.deposit_amount or appointment.deposit_amount <= 0:
        raise DepositChargeError(
            'Esta cita no tiene depósito configurado.'
        )
    if appointment.deposit_status == 'paid':
        raise DepositChargeError(
            'Esta cita ya tiene el depósito pagado.'
        )

    culqi = CulqiService()
    amount_cents = culqi.amount_to_cents(appointment.deposit_amount)

    description = (
        f'Depósito reserva #{appointment.pk} - '
        f'{appointment.service_display_name}'
    )

    def _mark_failed():
        # Transacción independiente: el caller puede estar dentro de
        # transaction.atomic(); usamos update() para evitar reload races.
        from .models import Appointment as _Ap
        with transaction.atomic():
            _Ap.objects.filter(pk=appointment.pk).update(
                deposit_status='failed', updated_at=timezone.now(),
            )

    try:
        charge = culqi.create_charge(
            amount_cents=amount_cents,
            currency='PEN',
            email=customer_email,
            source_id=card_token,
            description=description,
            capture=True,
            metadata={
                'appointment_id': str(appointment.pk),
                'kind': 'deposit',
                'branch_id': str(appointment.branch_id),
            },
        )
    except CulqiError as e:
        logger.warning(
            'Culqi rechazó depósito appt=%s code=%s msg=%s',
            appointment.pk, e.code, e.message if hasattr(e, 'message') else str(e),
        )
        _mark_failed()
        raise DepositChargeError(
            getattr(e, 'message', None) or 'Pago rechazado.',
            culqi_code=getattr(e, 'code', None),
        )

    charge_id = charge.get('id', '')
    if not charge_id:
        _mark_failed()
        raise DepositChargeError('Respuesta de Culqi inválida (sin id).')

    with transaction.atomic():
        appointment.deposit_status = 'paid'
        appointment.deposit_charge_id = charge_id
        appointment.deposit_paid_at = timezone.now()
        appointment.status = 'confirmed'
        appointment.save(update_fields=[
            'deposit_status', 'deposit_charge_id', 'deposit_paid_at',
            'status', 'updated_at',
        ])

    logger.info(
        'Depósito cobrado appt=%s charge=%s amount=%s',
        appointment.pk, charge_id, appointment.deposit_amount,
    )
    return appointment


@transaction.atomic
def refund_deposit(*, appointment: 'Appointment', reason: str = 'solicitud_comprador') -> 'Appointment':
    """
    Reembolsa el depósito de una cita pagada.

    Llamado por el flujo de cancelación cuando el cliente cancela dentro
    de la ventana de reembolso (Branch.refund_window_hours).

    Idempotente: si ya está refunded, no hace nada.
    """
    from apps.subscriptions.services import CulqiService, CulqiError

    if appointment.deposit_status == 'refunded':
        return appointment
    if appointment.deposit_status != 'paid':
        raise DepositRefundError(
            f'No se puede reembolsar un depósito en estado "{appointment.deposit_status}".'
        )
    if not appointment.deposit_charge_id:
        raise DepositRefundError(
            'No hay charge_id registrado para reembolsar.'
        )
    if not appointment.deposit_amount:
        raise DepositRefundError(
            'No hay deposit_amount registrado.'
        )

    culqi = CulqiService()
    amount_cents = culqi.amount_to_cents(appointment.deposit_amount)

    try:
        culqi.create_refund(
            charge_id=appointment.deposit_charge_id,
            amount_cents=amount_cents,
            reason=reason,
        )
    except CulqiError as e:
        logger.error(
            'Culqi rechazó reembolso appt=%s code=%s msg=%s',
            appointment.pk, getattr(e, 'code', '?'), str(e),
        )
        raise DepositRefundError(
            getattr(e, 'message', None) or 'No se pudo procesar el reembolso.'
        )

    appointment.deposit_status = 'refunded'
    appointment.deposit_refunded_at = timezone.now()
    appointment.save(update_fields=['deposit_status', 'deposit_refunded_at', 'updated_at'])

    logger.info(
        'Depósito reembolsado appt=%s amount=%s',
        appointment.pk, appointment.deposit_amount,
    )
    return appointment


def is_within_refund_window(appointment: 'Appointment') -> bool:
    """
    True si la cancelación se hace con suficiente antelación según la
    política de la sucursal (Branch.refund_window_hours).
    """
    if appointment.branch is None or appointment.start_datetime is None:
        return False
    hours = int(appointment.branch.refund_window_hours or 0)
    if hours <= 0:
        # Política: 0 horas significa siempre reembolsar (cliente friendly)
        return True
    cutoff = appointment.start_datetime - timedelta(hours=hours)
    return timezone.now() <= cutoff
