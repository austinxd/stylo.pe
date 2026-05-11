"""
Modelos de citas/reservas.
"""
import secrets

from django.db import models
from django.utils import timezone

from apps.core.models import Branch
from apps.accounts.models import Client, StaffMember
from apps.services.models import Service


class Appointment(models.Model):
    """
    Representa una cita/reserva de un cliente.
    """
    STATUS_CHOICES = [
        ('pending_payment', 'Esperando pago'),
        ('pending', 'Pendiente'),
        ('confirmed', 'Confirmada'),
        ('in_progress', 'En progreso'),
        ('completed', 'Completada'),
        ('cancelled', 'Cancelada'),
        ('no_show', 'No asistió'),
    ]

    DEPOSIT_STATUS_CHOICES = [
        ('not_required', 'No requerido'),
        ('paid', 'Pagado'),
        ('refunded', 'Reembolsado'),
        ('failed', 'Fallido'),
    ]

    # Relaciones principales
    branch = models.ForeignKey(
        Branch,
        on_delete=models.CASCADE,
        related_name='appointments',
        verbose_name='Sucursal'
    )
    client = models.ForeignKey(
        Client,
        on_delete=models.CASCADE,
        related_name='appointments',
        verbose_name='Cliente'
    )
    staff = models.ForeignKey(
        StaffMember,
        on_delete=models.CASCADE,
        related_name='appointments',
        verbose_name='Profesional'
    )
    service = models.ForeignKey(
        Service,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='appointments',
        verbose_name='Servicio',
        help_text='Nullable: si el servicio es eliminado, la cita se preserva con el snapshot.'
    )

    # Snapshot del servicio al momento de la reserva.
    # Se preserva si el Service es eliminado o renombrado, para mantener
    # íntegros los reportes financieros y el historial de cliente.
    service_name_snapshot = models.CharField(
        'Nombre del servicio (snapshot)',
        max_length=200,
        blank=True,
        default=''
    )
    service_duration_snapshot = models.PositiveIntegerField(
        'Duración del servicio en minutos (snapshot)',
        null=True,
        blank=True,
    )

    # Horario
    start_datetime = models.DateTimeField('Inicio')
    end_datetime = models.DateTimeField('Fin')

    # Estado
    status = models.CharField(
        'Estado',
        max_length=20,
        choices=STATUS_CHOICES,
        default='pending'
    )

    # Información adicional
    notes = models.TextField('Notas del cliente', blank=True)
    staff_notes = models.TextField('Notas del profesional', blank=True)
    price = models.DecimalField(
        'Precio',
        max_digits=10,
        decimal_places=2,
        help_text='Precio al momento de la reserva'
    )

    # Pago anticipado (depósito)
    deposit_amount = models.DecimalField(
        'Monto del depósito',
        max_digits=10, decimal_places=2,
        null=True, blank=True,
        help_text='Monto cobrado al reservar (snapshot del % del precio).',
    )
    deposit_status = models.CharField(
        'Estado del depósito',
        max_length=20,
        choices=DEPOSIT_STATUS_CHOICES,
        default='not_required',
    )
    deposit_charge_id = models.CharField(
        'ID del charge Culqi',
        max_length=64,
        blank=True, default='',
        db_index=True,
    )
    deposit_paid_at = models.DateTimeField(
        'Depósito pagado el', null=True, blank=True,
    )
    deposit_refunded_at = models.DateTimeField(
        'Depósito reembolsado el', null=True, blank=True,
    )

    # Cancelación
    cancelled_at = models.DateTimeField('Cancelado el', null=True, blank=True)
    cancelled_by = models.CharField(
        'Cancelado por',
        max_length=20,
        blank=True,
        choices=[('client', 'Cliente'), ('staff', 'Profesional'), ('system', 'Sistema')]
    )
    cancellation_reason = models.TextField('Motivo de cancelación', blank=True)

    # Fechas
    created_at = models.DateTimeField('Creado', auto_now_add=True)
    updated_at = models.DateTimeField('Actualizado', auto_now=True)

    class Meta:
        verbose_name = 'Cita'
        verbose_name_plural = 'Citas'
        ordering = ['-start_datetime']
        indexes = [
            models.Index(fields=['start_datetime', 'status']),
            models.Index(fields=['client', 'status']),
            models.Index(fields=['staff', 'start_datetime']),
        ]

    def __str__(self):
        service_label = self.service.name if self.service else (self.service_name_snapshot or 'Servicio eliminado')
        return f'{self.client} - {service_label} - {self.start_datetime}'

    @property
    def service_display_name(self):
        """Nombre del servicio para mostrar (usa snapshot si el servicio fue eliminado)."""
        if self.service:
            return self.service.name
        return self.service_name_snapshot or 'Servicio eliminado'

    def save(self, *args, **kwargs):
        # Capturar snapshot del servicio en cada save mientras exista la FK,
        # para que el historial sea inmutable si el servicio cambia o se elimina.
        if self.service_id and self.service:
            if not self.service_name_snapshot:
                self.service_name_snapshot = self.service.name
            if self.service_duration_snapshot is None:
                self.service_duration_snapshot = self.service.total_duration
        super().save(*args, **kwargs)

    @property
    def duration_minutes(self):
        """Duración de la cita en minutos."""
        delta = self.end_datetime - self.start_datetime
        return int(delta.total_seconds() / 60)

    @property
    def is_upcoming(self):
        """Verifica si la cita es futura."""
        return self.start_datetime > timezone.now()

    @property
    def is_past(self):
        """Verifica si la cita ya pasó."""
        return self.end_datetime < timezone.now()

    def can_cancel(self):
        """Verifica si la cita puede ser cancelada."""
        if self.status in ['cancelled', 'completed', 'no_show']:
            return False
        # Permitir cancelación hasta 2 horas antes
        return self.start_datetime > timezone.now() + timezone.timedelta(hours=2)

    def cancel(self, cancelled_by: str, reason: str = '', auto_refund: bool = True):
        """
        Cancela la cita.

        Args:
            cancelled_by: 'client', 'staff', 'system'
            reason: motivo de la cancelación
            auto_refund: si True (default), intenta reembolsar el depósito
                         si la política de la sucursal lo permite.
                         Marcar False cuando el caller maneja el refund
                         de manera específica (ej: refund forzado por admin).

        Flujo de reembolso:
        - Si deposit_status != 'paid': no se intenta refund
        - Si está dentro de Branch.refund_window_hours: refund completo
        - Si está fuera: no refund (sirve como no-show fee)
        """
        from django.db import transaction
        from .deposit_service import (
            refund_deposit,
            is_within_refund_window,
            DepositRefundError,
        )
        import logging

        refund_log = logging.getLogger(__name__)

        with transaction.atomic():
            self.status = 'cancelled'
            self.cancelled_at = timezone.now()
            self.cancelled_by = cancelled_by
            self.cancellation_reason = reason
            self.save()

            # Cancelar recordatorios pendientes para que no se envíen
            self.reminders.filter(status='pending').update(status='cancelled')

        # Refund fuera de la transacción de cancelación: Culqi es una
        # API externa, no queremos rollback de la cancelación si falla.
        if auto_refund and self.deposit_status == 'paid':
            if is_within_refund_window(self):
                try:
                    refund_deposit(appointment=self)
                except DepositRefundError as e:
                    refund_log.error(
                        'Refund automático falló appt=%s: %s. '
                        'La cita queda cancelada pero el depósito permanece pagado.',
                        self.pk, e,
                    )
            else:
                refund_log.info(
                    'Cita appt=%s cancelada fuera de ventana de reembolso '
                    '(refund_window_hours=%s). Sin refund.',
                    self.pk, self.branch.refund_window_hours,
                )


class AppointmentReminder(models.Model):
    """
    Recordatorio de cita.
    """
    REMINDER_TYPES = [
        ('whatsapp', 'WhatsApp'),
        ('email', 'Email'),
        ('sms', 'SMS'),
    ]

    STATUS_CHOICES = [
        ('pending', 'Pendiente'),
        ('sent', 'Enviado'),
        ('failed', 'Fallido'),
        ('cancelled', 'Cancelado'),
    ]

    appointment = models.ForeignKey(
        Appointment,
        on_delete=models.CASCADE,
        related_name='reminders',
        verbose_name='Cita'
    )
    reminder_type = models.CharField(
        'Tipo',
        max_length=20,
        choices=REMINDER_TYPES,
        default='whatsapp'
    )
    scheduled_at = models.DateTimeField('Programado para')
    sent_at = models.DateTimeField('Enviado', null=True, blank=True)
    status = models.CharField(
        'Estado',
        max_length=20,
        choices=STATUS_CHOICES,
        default='pending'
    )
    error_message = models.TextField('Mensaje de error', blank=True)

    # Fechas
    created_at = models.DateTimeField('Creado', auto_now_add=True)

    class Meta:
        verbose_name = 'Recordatorio'
        verbose_name_plural = 'Recordatorios'
        ordering = ['scheduled_at']

    def __str__(self):
        return f'{self.appointment} - {self.get_reminder_type_display()} - {self.status}'


class WaitlistEntry(models.Model):
    """
    Anotación de un cliente en lista de espera para un servicio en una
    sucursal cuando no hay slots disponibles.

    Cuando una cita existente se cancela, un signal busca al primer entry
    matcheable (FIFO por created_at) y lo marca como `notified`,
    devolviendo un claim_token único que el cliente puede usar para
    reservar el slot liberado (válido por un tiempo corto).

    Diseño:
    - El cliente NO necesita cuenta para anotarse. Se identifica por
      phone_number; se asocia a un Client si ya existe el documento.
    - Se evita duplicación: misma combinación (branch, service, phone,
      preferred_date) sólo puede existir una vez en estado 'waiting'.
    """
    STATUS_CHOICES = [
        ('waiting', 'En espera'),
        ('notified', 'Notificado'),
        ('claimed', 'Reservó'),
        ('expired', 'Expiró sin reservar'),
        ('cancelled', 'Cancelado'),
    ]

    branch = models.ForeignKey(
        Branch,
        on_delete=models.CASCADE,
        related_name='waitlist_entries',
        verbose_name='Sucursal',
    )
    service = models.ForeignKey(
        Service,
        on_delete=models.CASCADE,
        related_name='waitlist_entries',
        verbose_name='Servicio',
    )
    staff = models.ForeignKey(
        StaffMember,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='waitlist_entries',
        verbose_name='Profesional preferido',
        help_text='Null si el cliente acepta cualquier profesional disponible.',
    )

    # Identidad del cliente (sin requerir cuenta)
    client = models.ForeignKey(
        Client,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='waitlist_entries',
        verbose_name='Cliente',
    )
    phone_number = models.CharField('Teléfono', max_length=20)
    first_name = models.CharField('Nombre', max_length=100)

    # Preferencias de horario
    preferred_date = models.DateField('Fecha preferida')
    preferred_time_start = models.TimeField(
        'Hora preferida desde', null=True, blank=True,
    )
    preferred_time_end = models.TimeField(
        'Hora preferida hasta', null=True, blank=True,
    )

    # Estado
    status = models.CharField(
        'Estado', max_length=20, choices=STATUS_CHOICES, default='waiting',
    )

    # Token para reclamar el slot liberado (URL-safe, único)
    claim_token = models.CharField(
        'Token de reclamo', max_length=64, blank=True, default='', db_index=True,
    )
    claim_token_expires_at = models.DateTimeField(
        'Token expira', null=True, blank=True,
    )

    # Slot específico que se liberó (al notificar al cliente).
    # Cuando reclame, crearemos un nuevo Appointment con estos mismos
    # datos (staff, start_datetime, end_datetime).
    notified_for_staff = models.ForeignKey(
        StaffMember,
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='+',
        verbose_name='Profesional del slot ofrecido',
    )
    notified_for_start_datetime = models.DateTimeField(
        'Inicio del slot ofrecido', null=True, blank=True,
    )
    notified_for_end_datetime = models.DateTimeField(
        'Fin del slot ofrecido', null=True, blank=True,
    )

    # Auditoría
    notified_at = models.DateTimeField('Notificado el', null=True, blank=True)
    claimed_at = models.DateTimeField('Reservó el', null=True, blank=True)
    notes = models.TextField('Notas', blank=True)
    created_at = models.DateTimeField('Creado', auto_now_add=True)
    updated_at = models.DateTimeField('Actualizado', auto_now=True)

    class Meta:
        verbose_name = 'Lista de espera'
        verbose_name_plural = 'Listas de espera'
        ordering = ['created_at']
        indexes = [
            models.Index(fields=['branch', 'service', 'status', 'preferred_date']),
            models.Index(fields=['phone_number', 'status']),
        ]
        constraints = [
            # Evitar que el mismo teléfono se anote dos veces en waiting
            # para la misma combinación.
            models.UniqueConstraint(
                fields=['branch', 'service', 'phone_number', 'preferred_date'],
                condition=models.Q(status='waiting'),
                name='unique_active_waitlist_entry',
            ),
        ]

    def __str__(self):
        return (
            f'{self.first_name} ({self.phone_number}) - '
            f'{self.service.name} @ {self.branch.name} - {self.preferred_date}'
        )

    @staticmethod
    def generate_claim_token() -> str:
        """Token URL-safe de 32 bytes (256 bits de entropía)."""
        return secrets.token_urlsafe(32)

    def matches_appointment_window(self, appointment) -> bool:
        """
        Verifica si esta entry encaja con el slot de una cita cancelada.

        Reglas:
        - Misma sucursal y servicio
        - preferred_date == fecha de la cita (en TZ del servidor)
        - Si staff está definido, debe coincidir
        - Si preferred_time_{start,end} están definidos, la cita debe caer
          dentro de ese rango
        """
        if self.branch_id != appointment.branch_id:
            return False
        if self.service_id != appointment.service_id:
            return False
        if self.staff_id and self.staff_id != appointment.staff_id:
            return False
        appt_date = appointment.start_datetime.astimezone(
            timezone.get_current_timezone()
        ).date()
        if self.preferred_date != appt_date:
            return False
        if self.preferred_time_start and self.preferred_time_end:
            appt_time = appointment.start_datetime.astimezone(
                timezone.get_current_timezone()
            ).time()
            if not (self.preferred_time_start <= appt_time <= self.preferred_time_end):
                return False
        return True
