"""
Modelos de suscripción y facturación.

Sistema de cobro por profesional activo:
- Cada negocio paga una mensualidad por cada profesional activo
- Los nuevos profesionales tienen X días de prueba gratis
- Al terminar la prueba, se cobra prorrateado hasta fin de mes
- Después se cobra mensualmente por la cantidad de profesionales activos
- Si no paga, el negocio no puede recibir reservas
"""
from decimal import Decimal
from django.db import models
from django.utils import timezone
from django.core.validators import MinValueValidator
from datetime import timedelta

from apps.core.models import Business
from apps.accounts.models import StaffMember


class PricingPlan(models.Model):
    """
    Plan de precios configurable desde el admin.
    Solo debe existir un plan activo a la vez.
    """
    name = models.CharField('Nombre del plan', max_length=100, default='Plan Estándar')

    # Precio por profesional activo al mes
    price_per_staff = models.DecimalField(
        'Precio por profesional/mes',
        max_digits=10,
        decimal_places=2,
        validators=[MinValueValidator(Decimal('0.00'))],
        help_text='Precio mensual por cada profesional activo en el equipo'
    )

    # Días de prueba para nuevos profesionales
    trial_days = models.PositiveIntegerField(
        'Días de prueba',
        default=14,
        help_text='Días gratis al agregar un nuevo profesional al equipo'
    )

    # Moneda
    currency = models.CharField(
        'Moneda',
        max_length=3,
        default='PEN',
        help_text='Código ISO de la moneda (PEN, USD, etc.)'
    )

    is_active = models.BooleanField('Activo', default=True)

    created_at = models.DateTimeField('Creado', auto_now_add=True)
    updated_at = models.DateTimeField('Actualizado', auto_now=True)

    class Meta:
        verbose_name = 'Plan de precios'
        verbose_name_plural = 'Planes de precios'

    def __str__(self):
        return f"{self.name} - S/ {self.price_per_staff}/profesional"

    @classmethod
    def get_active_plan(cls):
        """Obtiene el plan de precios activo."""
        return cls.objects.filter(is_active=True).first()

    def save(self, *args, **kwargs):
        # Si este plan se marca como activo, desactivar los demás
        if self.is_active:
            PricingPlan.objects.exclude(pk=self.pk).update(is_active=False)
        super().save(*args, **kwargs)


class BusinessSubscription(models.Model):
    """
    Suscripción del negocio.
    Controla el estado de pago y acceso a la plataforma.
    """
    STATUS_CHOICES = [
        ('trial', 'Período de prueba'),
        ('active', 'Activa'),
        ('past_due', 'Pago pendiente'),
        ('suspended', 'Suspendida'),
        ('cancelled', 'Cancelada'),
    ]

    business = models.OneToOneField(
        Business,
        on_delete=models.CASCADE,
        related_name='subscription',
        verbose_name='Negocio'
    )

    status = models.CharField(
        'Estado',
        max_length=20,
        choices=STATUS_CHOICES,
        default='trial'
    )

    # Fecha de inicio de la suscripción
    started_at = models.DateTimeField('Inicio de suscripción', auto_now_add=True)

    # Fin del período de prueba (calculado al crear el primer staff)
    trial_ends_at = models.DateTimeField(
        'Fin del período de prueba',
        null=True,
        blank=True
    )

    # Próxima fecha de facturación (primer día del mes siguiente)
    next_billing_date = models.DateField(
        'Próxima facturación',
        null=True,
        blank=True
    )

    # Último pago exitoso
    last_payment_date = models.DateField(
        'Último pago',
        null=True,
        blank=True
    )

    # Monto del último pago
    last_payment_amount = models.DecimalField(
        'Monto último pago',
        max_digits=10,
        decimal_places=2,
        null=True,
        blank=True
    )

    created_at = models.DateTimeField('Creado', auto_now_add=True)
    updated_at = models.DateTimeField('Actualizado', auto_now=True)

    class Meta:
        verbose_name = 'Suscripción de negocio'
        verbose_name_plural = 'Suscripciones de negocios'

    def __str__(self):
        return f"Suscripción {self.business.name} - {self.get_status_display()}"

    @property
    def is_active(self):
        """Verifica si la suscripción permite recibir reservas."""
        return self.status in ['trial', 'active']

    @property
    def active_staff_count(self):
        """Cuenta los profesionales activos del negocio."""
        return StaffMember.objects.filter(
            current_business=self.business,
            employment_status='active'
        ).count()

    @property
    def billable_staff_count(self):
        """Cuenta los profesionales que ya pasaron el período de prueba."""
        return StaffSubscription.objects.filter(
            business=self.business,
            is_billable=True,
            is_active=True
        ).count()

    def calculate_monthly_cost(self):
        """Calcula el costo mensual basado en profesionales activos."""
        plan = PricingPlan.get_active_plan()
        if not plan:
            return Decimal('0.00')
        return plan.price_per_staff * self.billable_staff_count

    def calculate_prorated_amount(self, staff_count=None):
        """
        Calcula el monto prorrateado para el resto del mes actual.
        Se usa cuando termina el trial de un profesional.
        """
        plan = PricingPlan.get_active_plan()
        if not plan:
            return Decimal('0.00')

        today = timezone.now().date()
        # Días restantes del mes
        import calendar
        days_in_month = calendar.monthrange(today.year, today.month)[1]
        days_remaining = days_in_month - today.day + 1

        daily_rate = plan.price_per_staff / Decimal(days_in_month)
        count = staff_count if staff_count else 1

        return (daily_rate * days_remaining * count).quantize(Decimal('0.01'))

    def check_and_update_status(self):
        """Verifica y actualiza el estado de la suscripción."""
        now = timezone.now()

        # Si está en trial y el trial terminó
        if self.status == 'trial' and self.trial_ends_at and now >= self.trial_ends_at:
            # Verificar si tiene profesionales billable sin pago
            if self.billable_staff_count > 0 and not self.last_payment_date:
                self.status = 'past_due'
                self.save()

        # Si está past_due por más de 7 días, suspender
        if self.status == 'past_due':
            if self.next_billing_date:
                days_overdue = (now.date() - self.next_billing_date).days
                if days_overdue > 7:
                    self.status = 'suspended'
                    self.save()


class StaffSubscription(models.Model):
    """
    Tracking de suscripción por profesional.
    Registra cuándo fue agregado y si ya es billable.
    """
    business = models.ForeignKey(
        Business,
        on_delete=models.CASCADE,
        related_name='staff_subscriptions',
        verbose_name='Negocio'
    )

    staff = models.ForeignKey(
        StaffMember,
        on_delete=models.CASCADE,
        related_name='subscription_records',
        verbose_name='Profesional'
    )

    # Fecha en que fue agregado al equipo
    added_at = models.DateTimeField('Agregado al equipo', auto_now_add=True)

    # Fecha en que termina su trial individual
    trial_ends_at = models.DateTimeField('Fin de prueba')

    # Si ya es billable (pasó el trial)
    is_billable = models.BooleanField('Es facturable', default=False)

    # Fecha desde que es billable
    billable_since = models.DateField('Facturable desde', null=True, blank=True)

    # Si está activo en el equipo
    is_active = models.BooleanField('Activo', default=True)

    created_at = models.DateTimeField('Creado', auto_now_add=True)
    updated_at = models.DateTimeField('Actualizado', auto_now=True)

    class Meta:
        verbose_name = 'Suscripción de profesional'
        verbose_name_plural = 'Suscripciones de profesionales'
        unique_together = ['business', 'staff']

    def __str__(self):
        status = "Billable" if self.is_billable else "Trial"
        return f"{self.staff.full_name} @ {self.business.name} ({status})"

    def save(self, *args, **kwargs):
        # Si no tiene trial_ends_at, calcularlo
        if not self.trial_ends_at:
            plan = PricingPlan.get_active_plan()
            trial_days = plan.trial_days if plan else 14
            self.trial_ends_at = timezone.now() + timedelta(days=trial_days)
        super().save(*args, **kwargs)

    def check_trial_status(self):
        """Verifica si el trial terminó y actualiza is_billable."""
        if not self.is_billable and timezone.now() >= self.trial_ends_at:
            self.is_billable = True
            self.billable_since = timezone.now().date()
            self.save()
            return True
        return False

    @property
    def trial_days_remaining(self):
        """Días restantes del período de prueba."""
        if self.is_billable:
            return 0
        remaining = (self.trial_ends_at - timezone.now()).days
        return max(0, remaining)


class Invoice(models.Model):
    """
    Factura/cobro mensual al negocio.
    """
    STATUS_CHOICES = [
        ('pending', 'Pendiente'),
        ('paid', 'Pagada'),
        ('failed', 'Fallida'),
        ('cancelled', 'Cancelada'),
    ]

    business = models.ForeignKey(
        Business,
        on_delete=models.CASCADE,
        related_name='invoices',
        verbose_name='Negocio'
    )

    # Período de facturación
    period_start = models.DateField('Inicio del período')
    period_end = models.DateField('Fin del período')

    # Detalles
    staff_count = models.PositiveIntegerField('Cantidad de profesionales')
    price_per_staff = models.DecimalField(
        'Precio por profesional',
        max_digits=10,
        decimal_places=2
    )
    subtotal = models.DecimalField('Subtotal', max_digits=10, decimal_places=2)

    # Prorrateo (si aplica)
    is_prorated = models.BooleanField('Es prorrateado', default=False)
    prorated_days = models.PositiveIntegerField('Días prorrateados', null=True, blank=True)

    # Totales
    total = models.DecimalField('Total', max_digits=10, decimal_places=2)
    currency = models.CharField('Moneda', max_length=3, default='PEN')

    # Estado
    status = models.CharField(
        'Estado',
        max_length=20,
        choices=STATUS_CHOICES,
        default='pending'
    )

    # Pago
    paid_at = models.DateTimeField('Pagada en', null=True, blank=True)
    payment_method = models.CharField('Método de pago', max_length=50, blank=True)
    payment_reference = models.CharField('Referencia de pago', max_length=100, blank=True)

    # Fechas
    due_date = models.DateField('Fecha de vencimiento')
    created_at = models.DateTimeField('Creado', auto_now_add=True)
    updated_at = models.DateTimeField('Actualizado', auto_now=True)

    class Meta:
        verbose_name = 'Factura'
        verbose_name_plural = 'Facturas'
        ordering = ['-created_at']

    def __str__(self):
        return f"Factura {self.business.name} - {self.period_start} a {self.period_end}"

    def mark_as_paid(self, payment_method='', payment_reference=''):
        """Marca la factura como pagada."""
        self.status = 'paid'
        self.paid_at = timezone.now()
        self.payment_method = payment_method
        self.payment_reference = payment_reference
        self.save()

        # Actualizar la suscripción del negocio
        subscription = self.business.subscription
        subscription.status = 'active'
        subscription.last_payment_date = timezone.now().date()
        subscription.last_payment_amount = self.total

        # Calcular próxima fecha de facturación (primer día del mes siguiente)
        next_month = self.period_end.month + 1
        next_year = self.period_end.year
        if next_month > 12:
            next_month = 1
            next_year += 1
        subscription.next_billing_date = self.period_end.replace(
            year=next_year,
            month=next_month,
            day=1
        )
        subscription.save()
