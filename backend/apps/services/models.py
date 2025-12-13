"""
Modelos de servicios.
"""
from django.db import models
from apps.core.models import Branch
from apps.accounts.models import StaffMember


class ServiceCategory(models.Model):
    """
    Categoría de servicios global para toda la plataforma.
    Ejemplo: Cortes, Coloración, Tratamientos, etc.
    Los negocios pueden usar estas categorías para crear sus servicios.
    """
    name = models.CharField('Nombre', max_length=100, unique=True)
    description = models.TextField('Descripción', blank=True)
    icon = models.CharField('Icono', max_length=50, blank=True)
    order = models.PositiveIntegerField('Orden', default=0)
    is_active = models.BooleanField('Activo', default=True)

    class Meta:
        verbose_name = 'Categoría de Servicio'
        verbose_name_plural = 'Categorías de Servicios'
        ordering = ['order', 'name']

    def __str__(self):
        return self.name


class Service(models.Model):
    """
    Servicio creado por el dueño del negocio para una sucursal específica.
    Cada sucursal tiene sus propios servicios con precios independientes.
    """
    GENDER_CHOICES = [
        ('M', 'Masculino'),
        ('F', 'Femenino'),
        ('U', 'Unisex'),
    ]

    branch = models.ForeignKey(
        Branch,
        on_delete=models.CASCADE,
        related_name='services',
        verbose_name='Sucursal'
    )
    category = models.ForeignKey(
        ServiceCategory,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='services',
        verbose_name='Categoría'
    )
    name = models.CharField('Nombre', max_length=200)
    description = models.TextField('Descripción', blank=True)
    gender = models.CharField(
        'Género',
        max_length=1,
        choices=GENDER_CHOICES,
        default='U',
        help_text='Para quién está dirigido el servicio'
    )
    duration_minutes = models.PositiveIntegerField('Duración (minutos)')
    price = models.DecimalField(
        'Precio',
        max_digits=10,
        decimal_places=2,
        help_text='Precio del servicio en esta sucursal'
    )

    # Configuración
    buffer_time_before = models.PositiveIntegerField(
        'Tiempo buffer antes (minutos)',
        default=0,
        help_text='Tiempo de preparación antes del servicio'
    )
    buffer_time_after = models.PositiveIntegerField(
        'Tiempo buffer después (minutos)',
        default=0,
        help_text='Tiempo de limpieza después del servicio'
    )

    # Imagen del servicio
    image = models.ImageField(
        'Imagen',
        upload_to='services/',
        blank=True,
        null=True,
        help_text='Imagen representativa del servicio'
    )

    # Estado
    is_active = models.BooleanField('Activo', default=True)
    is_featured = models.BooleanField('Destacado', default=False)

    # Fechas
    created_at = models.DateTimeField('Creado', auto_now_add=True)
    updated_at = models.DateTimeField('Actualizado', auto_now=True)

    class Meta:
        verbose_name = 'Servicio'
        verbose_name_plural = 'Servicios'
        ordering = ['category__order', 'name']

    def __str__(self):
        return f'{self.name} ({self.branch.name})'

    @property
    def total_duration(self):
        """Duración total incluyendo buffers."""
        return self.duration_minutes + self.buffer_time_before + self.buffer_time_after

    @property
    def business(self):
        """Acceso al negocio a través de la sucursal."""
        return self.branch.business


class StaffService(models.Model):
    """
    Relación entre profesionales y servicios que pueden ofrecer.
    El profesional puede tener un precio personalizado diferente al de la sucursal.
    """
    staff = models.ForeignKey(
        StaffMember,
        on_delete=models.CASCADE,
        related_name='offered_services',
        verbose_name='Profesional'
    )
    service = models.ForeignKey(
        Service,
        on_delete=models.CASCADE,
        related_name='staff_providers',
        verbose_name='Servicio'
    )
    # Precio personalizado del profesional (si difiere del precio del servicio)
    custom_price = models.DecimalField(
        'Precio personalizado',
        max_digits=10,
        decimal_places=2,
        null=True,
        blank=True
    )
    # Duración personalizada
    custom_duration = models.PositiveIntegerField(
        'Duración personalizada (minutos)',
        null=True,
        blank=True
    )
    is_active = models.BooleanField('Activo', default=True)

    class Meta:
        verbose_name = 'Servicio del Profesional'
        verbose_name_plural = 'Servicios de Profesionales'
        unique_together = ['staff', 'service']

    def __str__(self):
        return f'{self.staff.full_name} - {self.service.name}'

    @property
    def price(self):
        """Retorna el precio (personalizado o el del servicio)."""
        return self.custom_price if self.custom_price else self.service.price

    @property
    def duration(self):
        """Retorna la duración (personalizada o base)."""
        return self.custom_duration if self.custom_duration else self.service.duration_minutes
