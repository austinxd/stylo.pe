"""
Modelos de suscripción y facturación.

Sistema de cobro por profesional activo (POSTPAGO - MES VENCIDO):
- Cada negocio paga una mensualidad por cada profesional activo
- Los nuevos profesionales tienen X días de prueba gratis
- Al terminar la prueba, el dueño debe activar al profesional para que siga trabajando
- Para activar, el negocio debe tener un método de pago configurado (tarjeta o cortesía)
- El 1ero de cada mes se genera factura del MES ANTERIOR
- La factura calcula los días exactos que cada profesional estuvo activo
- Si no paga, el negocio no puede recibir reservas

Integración con Culqi para pagos con tarjeta.
"""
from decimal import Decimal
from datetime import date, timedelta

from django.db import models
from django.utils import timezone
from django.core.validators import MinValueValidator

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

    # === Acceso Cortesía ===
    has_courtesy_access = models.BooleanField(
        'Acceso cortesía',
        default=False,
        help_text='Permite pagar facturas sin tarjeta real'
    )
    courtesy_until = models.DateField(
        'Cortesía hasta',
        null=True,
        blank=True,
        help_text='Fecha límite del acceso cortesía (vacío = sin límite)'
    )
    courtesy_reason = models.CharField(
        'Motivo cortesía',
        max_length=200,
        blank=True,
        help_text='Ej: Cliente beta, Promoción lanzamiento, Partner'
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
    def is_courtesy_active(self):
        """Verifica si el acceso cortesía está activo."""
        if not self.has_courtesy_access:
            return False
        if self.courtesy_until:
            return date.today() <= self.courtesy_until
        return True

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
    Registra cuándo fue agregado, activado y desactivado para calcular días exactos.

    Ciclo de vida:
    1. Se crea con trial_ends_at calculado
    2. Durante el trial: is_billable=False, puede trabajar
    3. Trial vence: el dueño debe activar (requiere método de pago)
    4. Al activar: is_billable=True, billable_since=fecha
    5. Si se desactiva: deactivated_at=fecha, is_active=False
    6. Si se reactiva: deactivated_at=None, is_active=True, billable_since=nueva fecha

    Facturación (mes vencido):
    - El 1ero del mes se calcula: días entre billable_since y deactivated_at (o fin de mes)
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

    # Si ya es billable (pasó el trial y fue activado)
    is_billable = models.BooleanField('Es facturable', default=False)

    # Fecha desde que es billable (para calcular días activos)
    billable_since = models.DateField('Facturable desde', null=True, blank=True)

    # Fecha en que fue desactivado (para calcular días activos)
    deactivated_at = models.DateField(
        'Desactivado el',
        null=True,
        blank=True,
        help_text='Fecha en que el dueño desactivó al profesional'
    )

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

    def calculate_active_days(self, period_start: date, period_end: date) -> int:
        """
        Calcula los días que el profesional estuvo activo (billable) en un período.

        Args:
            period_start: Inicio del período (ej: 1 de diciembre)
            period_end: Fin del período (ej: 31 de diciembre)

        Returns:
            Número de días activos en el período (0 si no estuvo activo)
        """
        # Si no es billable, no cuenta
        if not self.is_billable or not self.billable_since:
            return 0

        # Fecha efectiva de inicio (la mayor entre billable_since y period_start)
        effective_start = max(self.billable_since, period_start)

        # Fecha efectiva de fin (la menor entre deactivated_at/period_end)
        if self.deactivated_at:
            effective_end = min(self.deactivated_at, period_end)
        else:
            effective_end = period_end

        # Si el rango es inválido, no hay días activos
        if effective_start > effective_end:
            return 0

        # Calcular días (inclusive)
        return (effective_end - effective_start).days + 1


class PaymentMethod(models.Model):
    """
    Método de pago guardado del negocio.
    Almacena la referencia a la tarjeta en Culqi (nunca el número real).
    También soporta métodos virtuales como "Cortesía Stylo".
    """
    METHOD_TYPE_CHOICES = [
        ('card', 'Tarjeta'),
        ('courtesy', 'Cortesía'),
    ]
    CARD_TYPE_CHOICES = [
        ('credit', 'Crédito'),
        ('debit', 'Débito'),
    ]
    BRAND_CHOICES = [
        ('visa', 'Visa'),
        ('mastercard', 'Mastercard'),
        ('amex', 'American Express'),
        ('diners', 'Diners Club'),
        ('courtesy', 'Cortesía Stylo'),
    ]

    business = models.ForeignKey(
        Business,
        on_delete=models.CASCADE,
        related_name='payment_methods',
        verbose_name='Negocio'
    )

    # === Tipo de método ===
    method_type = models.CharField(
        'Tipo de método',
        max_length=20,
        choices=METHOD_TYPE_CHOICES,
        default='card'
    )

    # === Datos de Culqi (solo para tarjetas reales) ===
    culqi_customer_id = models.CharField(
        'ID Cliente Culqi',
        max_length=100,
        blank=True,
        help_text='Customer ID en Culqi (cus_xxx)'
    )
    culqi_card_id = models.CharField(
        'ID Tarjeta Culqi',
        max_length=100,
        blank=True,
        help_text='Card ID en Culqi (crd_xxx)'
    )

    # === Info para mostrar al usuario ===
    card_type = models.CharField(
        'Tipo de tarjeta',
        max_length=20,
        choices=CARD_TYPE_CHOICES,
        default='credit',
        blank=True
    )
    brand = models.CharField(
        'Marca',
        max_length=20,
        choices=BRAND_CHOICES,
        default='visa'
    )
    last_four = models.CharField(
        'Últimos 4 dígitos',
        max_length=4,
        blank=True
    )
    holder_name = models.CharField(
        'Nombre del titular',
        max_length=100,
        blank=True
    )
    expiration_month = models.PositiveIntegerField('Mes expiración', null=True, blank=True)
    expiration_year = models.PositiveIntegerField('Año expiración', null=True, blank=True)

    # === Estado ===
    is_default = models.BooleanField('Es principal', default=False)
    is_active = models.BooleanField('Activa', default=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Método de pago'
        verbose_name_plural = 'Métodos de pago'
        ordering = ['-is_default', '-created_at']

    def __str__(self):
        if self.method_type == 'courtesy':
            return "Cortesía Stylo"
        return f"{self.get_brand_display()} ****{self.last_four}"

    @property
    def is_virtual(self):
        """Indica si es un método de pago virtual (sin tarjeta real)."""
        return self.method_type == 'courtesy'

    @property
    def is_expired(self):
        """Verifica si la tarjeta está vencida."""
        if self.is_virtual:
            return False
        if not self.expiration_year or not self.expiration_month:
            return False
        today = date.today()
        return (self.expiration_year < today.year or
                (self.expiration_year == today.year and
                 self.expiration_month < today.month))

    @property
    def display_expiration(self):
        """Retorna la fecha de expiración formateada."""
        if self.is_virtual or not self.expiration_month or not self.expiration_year:
            return "N/A"
        return f"{self.expiration_month:02d}/{self.expiration_year % 100:02d}"

    @property
    def card_display(self):
        """Retorna representación legible de la tarjeta."""
        if self.method_type == 'courtesy':
            return "Cortesía Stylo"
        return f"{self.get_brand_display()} ****{self.last_four}"

    def save(self, *args, **kwargs):
        # Si es la primera tarjeta o se marca como default, desmarcar las demás
        if self.is_default:
            PaymentMethod.objects.filter(
                business=self.business,
                is_default=True
            ).exclude(pk=self.pk).update(is_default=False)
        # Si es la primera tarjeta, marcarla como default
        if not self.pk:
            if not PaymentMethod.objects.filter(business=self.business).exists():
                self.is_default = True
        super().save(*args, **kwargs)


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

    # Pago - Referencia al método de pago usado
    paid_at = models.DateTimeField('Pagada en', null=True, blank=True)
    payment_method_used = models.ForeignKey(
        'PaymentMethod',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='invoices',
        verbose_name='Método de pago usado'
    )

    # Máximo de reintentos de cobro
    max_payment_attempts = models.PositiveIntegerField(
        'Máx. intentos de cobro',
        default=3
    )

    # Notas internas
    notes = models.TextField('Notas internas', blank=True)

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

    @property
    def total_cents(self):
        """Retorna el total en céntimos (para Culqi)."""
        return int(self.total * 100)

    @property
    def successful_payment(self):
        """Retorna el pago exitoso si existe."""
        return self.payments.filter(status='succeeded').first()

    @property
    def can_retry_payment(self):
        """Verifica si se puede reintentar el cobro."""
        attempts = self.payments.count()
        has_success = self.payments.filter(status='succeeded').exists()
        return not has_success and attempts < self.max_payment_attempts

    def mark_as_paid(self, payment_method_used=None):
        """Marca la factura como pagada."""
        self.status = 'paid'
        self.paid_at = timezone.now()
        if payment_method_used:
            self.payment_method_used = payment_method_used
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


class InvoiceLineItem(models.Model):
    """
    Línea de detalle en una factura.
    Representa el cobro prorrateado de UN profesional en UN período.
    """
    invoice = models.ForeignKey(
        Invoice,
        on_delete=models.CASCADE,
        related_name='line_items',
        verbose_name='Factura'
    )
    staff = models.ForeignKey(
        StaffMember,
        on_delete=models.SET_NULL,
        null=True,
        related_name='invoice_items',
        verbose_name='Profesional'
    )
    staff_name = models.CharField(
        'Nombre del profesional',
        max_length=200,
        help_text='Guardado para historial si el staff se elimina'
    )

    # === Período ===
    period_start = models.DateField('Inicio período')
    period_end = models.DateField('Fin período')
    days_in_period = models.PositiveIntegerField(
        'Días en período',
        help_text='Total días del mes (28-31)'
    )

    # === Uso ===
    days_active = models.PositiveIntegerField(
        'Días activo',
        help_text='Días que el profesional estuvo activo/billable'
    )

    # === Tarifas ===
    monthly_rate = models.DecimalField(
        'Tarifa mensual',
        max_digits=10,
        decimal_places=2,
        help_text='Precio mensual por profesional al momento de facturar'
    )
    daily_rate = models.DecimalField(
        'Tarifa diaria',
        max_digits=10,
        decimal_places=4,
        help_text='monthly_rate / days_in_period'
    )

    # === Resultado ===
    subtotal = models.DecimalField(
        'Subtotal',
        max_digits=10,
        decimal_places=2,
        help_text='days_active × daily_rate'
    )

    class Meta:
        verbose_name = 'Detalle de factura'
        verbose_name_plural = 'Detalles de factura'
        ordering = ['id']

    def __str__(self):
        return f"{self.staff_name}: {self.days_active}d = S/{self.subtotal}"

    def calculate(self):
        """Calcula las tarifas y subtotal."""
        self.daily_rate = self.monthly_rate / Decimal(self.days_in_period)
        self.subtotal = (self.daily_rate * self.days_active).quantize(Decimal('0.01'))
        return self.subtotal

    def save(self, *args, **kwargs):
        # Guardar nombre del staff para historial
        if self.staff and not self.staff_name:
            self.staff_name = self.staff.full_name
        super().save(*args, **kwargs)


class Payment(models.Model):
    """
    Registro de cada intento de cobro.
    Una Invoice puede tener múltiples Payments (reintentos).
    """
    STATUS_CHOICES = [
        ('pending', 'Pendiente'),
        ('succeeded', 'Exitoso'),
        ('failed', 'Fallido'),
        ('refunded', 'Reembolsado'),
    ]

    invoice = models.ForeignKey(
        Invoice,
        on_delete=models.CASCADE,
        related_name='payments',
        verbose_name='Factura'
    )
    payment_method = models.ForeignKey(
        PaymentMethod,
        on_delete=models.SET_NULL,
        null=True,
        related_name='payments',
        verbose_name='Método de pago'
    )

    # === Monto ===
    amount = models.DecimalField(
        'Monto',
        max_digits=10,
        decimal_places=2
    )
    amount_cents = models.PositiveIntegerField(
        'Monto en céntimos',
        help_text='Culqi trabaja en céntimos (4650 = S/46.50)'
    )
    currency = models.CharField(
        'Moneda',
        max_length=3,
        default='PEN'
    )

    # === Respuesta de Culqi ===
    culqi_charge_id = models.CharField(
        'ID Cargo Culqi',
        max_length=100,
        blank=True,
        help_text='Charge ID (chr_xxx)'
    )
    status = models.CharField(
        'Estado',
        max_length=20,
        choices=STATUS_CHOICES,
        default='pending'
    )
    culqi_response_code = models.CharField(
        'Código respuesta',
        max_length=50,
        blank=True
    )
    culqi_response_message = models.CharField(
        'Mensaje respuesta',
        max_length=200,
        blank=True
    )
    culqi_full_response = models.JSONField(
        'Respuesta completa Culqi',
        null=True,
        blank=True
    )

    # === Metadata ===
    attempt_number = models.PositiveIntegerField(
        'Número de intento',
        default=1
    )
    is_automatic = models.BooleanField(
        'Cobro automático',
        default=True,
        help_text='True si fue por Celery, False si fue manual'
    )
    error_message = models.TextField(
        'Mensaje de error',
        blank=True
    )

    created_at = models.DateTimeField(auto_now_add=True)
    processed_at = models.DateTimeField(
        'Procesado en',
        null=True,
        blank=True
    )

    class Meta:
        verbose_name = 'Pago'
        verbose_name_plural = 'Pagos'
        ordering = ['-created_at']

    def __str__(self):
        return f"Pago #{self.id} - {self.get_status_display()} - S/{self.amount}"

    def save(self, *args, **kwargs):
        # Calcular céntimos automáticamente
        if self.amount:
            self.amount_cents = int(self.amount * 100)
        super().save(*args, **kwargs)
