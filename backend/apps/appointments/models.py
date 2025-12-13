"""
Modelos de citas/reservas.
"""
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
        ('pending', 'Pendiente'),
        ('confirmed', 'Confirmada'),
        ('in_progress', 'En progreso'),
        ('completed', 'Completada'),
        ('cancelled', 'Cancelada'),
        ('no_show', 'No asistió'),
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
        on_delete=models.CASCADE,
        related_name='appointments',
        verbose_name='Servicio'
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
        return f'{self.client} - {self.service.name} - {self.start_datetime}'

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

    def cancel(self, cancelled_by: str, reason: str = ''):
        """Cancela la cita."""
        self.status = 'cancelled'
        self.cancelled_at = timezone.now()
        self.cancelled_by = cancelled_by
        self.cancellation_reason = reason
        self.save()


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
