"""
Modelos core: Business (Negocio) y Branch (Sucursal).
"""
from django.db import models
from django.utils.text import slugify


class BusinessCategory(models.Model):
    """
    Categorías de negocios: Peluquería, Barbería, Spa, Uñas, etc.
    Un negocio puede tener múltiples categorías.
    """
    CATEGORY_CHOICES = [
        ('peluqueria', 'Peluquería'),
        ('barberia', 'Barbería'),
        ('unas', 'Uñas'),
        ('spa', 'Spa & Masajes'),
        ('estetica', 'Estética'),
        ('maquillaje', 'Maquillaje'),
    ]

    slug = models.CharField(
        'Identificador',
        max_length=50,
        unique=True,
        choices=CATEGORY_CHOICES
    )
    name = models.CharField('Nombre', max_length=100)
    icon = models.CharField(
        'Icono',
        max_length=50,
        blank=True,
        help_text='Nombre del icono (ej: scissors, spa, nail)'
    )
    color = models.CharField(
        'Color',
        max_length=50,
        default='bg-pink-100 text-pink-600',
        help_text='Clases de Tailwind para el color'
    )
    order = models.PositiveIntegerField('Orden', default=0)
    is_active = models.BooleanField('Activo', default=True)

    class Meta:
        verbose_name = 'Categoría de negocio'
        verbose_name_plural = 'Categorías de negocio'
        ordering = ['order', 'name']

    def __str__(self):
        return self.name


class Business(models.Model):
    """
    Representa un negocio registrado en la plataforma.
    Cada negocio puede tener múltiples sucursales.
    """
    name = models.CharField('Nombre', max_length=200)
    slug = models.SlugField('Slug', max_length=200, unique=True)
    description = models.TextField('Descripción', blank=True)
    logo = models.ImageField('Logo', upload_to='businesses/logos/', blank=True, null=True)

    # Categorías del negocio (puede tener varias)
    categories = models.ManyToManyField(
        BusinessCategory,
        related_name='businesses',
        verbose_name='Categorías',
        blank=True,
        help_text='Selecciona las categorías que aplican a este negocio'
    )

    # Datos de contacto
    email = models.EmailField('Email', blank=True)
    phone = models.CharField('Teléfono', max_length=20, blank=True)
    website = models.URLField('Sitio web', blank=True)

    # Redes sociales
    instagram = models.CharField('Instagram', max_length=100, blank=True)
    facebook = models.CharField('Facebook', max_length=100, blank=True)

    # Branding personalizado
    primary_color = models.CharField(
        'Color primario',
        max_length=7,
        default='#1a1a2e',
        help_text='Color hexadecimal (ej: #1a1a2e)'
    )
    secondary_color = models.CharField(
        'Color secundario',
        max_length=7,
        default='#c9a227',
        help_text='Color hexadecimal (ej: #c9a227)'
    )
    cover_image = models.ImageField(
        'Imagen de portada',
        upload_to='businesses/covers/',
        blank=True,
        null=True
    )
    cover_position = models.PositiveSmallIntegerField(
        'Posición de portada',
        default=50,
        help_text='Posición vertical de la imagen (0=arriba, 50=centro, 100=abajo)'
    )

    # Estado
    is_active = models.BooleanField('Activo', default=True)
    is_verified = models.BooleanField('Verificado', default=False)

    # Fechas
    created_at = models.DateTimeField('Creado', auto_now_add=True)
    updated_at = models.DateTimeField('Actualizado', auto_now=True)

    class Meta:
        verbose_name = 'Negocio'
        verbose_name_plural = 'Negocios'
        ordering = ['name']

    def __str__(self):
        return self.name

    def save(self, *args, **kwargs):
        if not self.slug:
            self.slug = slugify(self.name)
            # Asegurar unicidad
            original_slug = self.slug
            counter = 1
            while Business.objects.filter(slug=self.slug).exclude(pk=self.pk).exists():
                self.slug = f'{original_slug}-{counter}'
                counter += 1
        super().save(*args, **kwargs)

    @property
    def active_branches(self):
        """Retorna solo sucursales activas."""
        return self.branches.filter(is_active=True)


class Branch(models.Model):
    """
    Representa una sucursal de un negocio.
    Cada sucursal tiene su propio staff, horarios y servicios.
    """
    business = models.ForeignKey(
        Business,
        on_delete=models.CASCADE,
        related_name='branches',
        verbose_name='Negocio'
    )
    name = models.CharField('Nombre', max_length=200)
    slug = models.SlugField('Slug', max_length=200)

    # Imagen de portada
    cover_image = models.ImageField(
        'Imagen de portada',
        upload_to='branches/covers/',
        blank=True,
        null=True
    )

    # Ubicación
    address = models.CharField('Dirección', max_length=300)
    address_reference = models.CharField(
        'Referencia',
        max_length=200,
        blank=True,
        help_text='Ej: Frente al parque, 2do piso'
    )
    district = models.CharField('Distrito', max_length=100, blank=True)
    city = models.CharField('Ciudad', max_length=100, default='Lima')
    country = models.CharField('País', max_length=100, default='Perú')
    postal_code = models.CharField('Código postal', max_length=20, blank=True)
    latitude = models.DecimalField(
        'Latitud', max_digits=9, decimal_places=6, blank=True, null=True
    )
    longitude = models.DecimalField(
        'Longitud', max_digits=9, decimal_places=6, blank=True, null=True
    )

    # Contacto
    phone = models.CharField('Teléfono', max_length=20, blank=True)
    whatsapp = models.CharField('WhatsApp', max_length=20, blank=True)
    email = models.EmailField('Email', blank=True)

    # Configuración
    timezone = models.CharField('Zona horaria', max_length=50, default='America/Lima')

    # Horario de atención
    opening_time = models.TimeField('Hora de apertura', default='09:00')
    closing_time = models.TimeField('Hora de cierre', default='19:00')

    # Para mostrar en la web
    description = models.TextField('Descripción', blank=True)

    # Estado
    is_active = models.BooleanField('Activo', default=True)
    is_main = models.BooleanField('Sucursal principal', default=False)

    # Fechas
    created_at = models.DateTimeField('Creado', auto_now_add=True)
    updated_at = models.DateTimeField('Actualizado', auto_now=True)

    class Meta:
        verbose_name = 'Sucursal'
        verbose_name_plural = 'Sucursales'
        ordering = ['business', 'name']
        unique_together = ['business', 'slug']

    def __str__(self):
        return f'{self.business.name} - {self.name}'

    def _sync_cover_image_to_gallery(self):
        """
        Sincroniza la imagen de portada (cover_image) con la galería (BranchPhoto).
        Si hay cover_image, asegura que exista un BranchPhoto con is_cover=True.
        La imagen de portada siempre aparece primero en la galería (order=0).
        """
        if self.cover_image:
            # Buscar si ya existe una foto de portada
            cover_photo = self.photos.filter(is_cover=True).first()

            if not cover_photo:
                # Solo crear si no existe ninguna foto de portada
                # (el usuario puede haber subido una manualmente en Step 3)
                BranchPhoto.objects.create(
                    branch=self,
                    image=self.cover_image,
                    caption='Imagen de portada',
                    is_cover=True,
                    order=0
                )

    def save(self, *args, **kwargs):
        if not self.slug:
            self.slug = slugify(self.name)
            # Asegurar unicidad dentro del negocio
            original_slug = self.slug
            counter = 1
            while Branch.objects.filter(
                business=self.business, slug=self.slug
            ).exclude(pk=self.pk).exists():
                self.slug = f'{original_slug}-{counter}'
                counter += 1

        # Guardar primero para tener el pk
        super().save(*args, **kwargs)

        # Sincronizar cover_image con BranchPhoto (galería)
        self._sync_cover_image_to_gallery()

    @property
    def full_address(self):
        """Dirección completa para mostrar y para Google Maps."""
        parts = []
        if self.address:
            parts.append(self.address)
        if self.district:
            parts.append(self.district)
        if self.city:
            parts.append(self.city)
        if self.country and self.country != 'Perú':
            parts.append(self.country)
        return ', '.join(parts) if parts else ''

    @property
    def google_maps_url(self):
        """URL para abrir la ubicación en Google Maps."""
        from urllib.parse import quote
        # Si tenemos coordenadas, usar esas (más preciso)
        if self.latitude and self.longitude:
            return f'https://www.google.com/maps?q={self.latitude},{self.longitude}'
        # Si no, usar la dirección completa
        if self.full_address:
            return f'https://www.google.com/maps/search/?api=1&query={quote(self.full_address)}'
        return None


class BranchPhoto(models.Model):
    """
    Fotos de una sucursal para la galería.
    Permite tener múltiples fotos y marcar una como portada.
    """
    branch = models.ForeignKey(
        Branch,
        on_delete=models.CASCADE,
        related_name='photos',
        verbose_name='Sucursal'
    )
    image = models.ImageField(
        'Imagen',
        upload_to='branches/gallery/',
        help_text='Recomendado: 800x600px o proporción 4:3'
    )
    caption = models.CharField(
        'Descripción',
        max_length=200,
        blank=True,
        help_text='Descripción opcional de la foto'
    )
    is_cover = models.BooleanField(
        'Es portada',
        default=False,
        help_text='Marcar como foto principal de la sucursal'
    )
    order = models.PositiveIntegerField(
        'Orden',
        default=0,
        help_text='Orden de aparición en la galería'
    )
    created_at = models.DateTimeField('Creado', auto_now_add=True)

    class Meta:
        verbose_name = 'Foto de sucursal'
        verbose_name_plural = 'Fotos de sucursal'
        ordering = ['-is_cover', 'order', '-created_at']

    def __str__(self):
        return f'Foto de {self.branch.name} - {"Portada" if self.is_cover else f"#{self.order}"}'

    def save(self, *args, **kwargs):
        # Si esta foto se marca como portada, desmarcar las otras
        if self.is_cover:
            BranchPhoto.objects.filter(
                branch=self.branch,
                is_cover=True
            ).exclude(pk=self.pk).update(is_cover=False)
        super().save(*args, **kwargs)


class Review(models.Model):
    """
    Reseñas y calificaciones de clientes para sucursales.
    Las reseñas están vinculadas a una sucursal específica.
    """
    RATING_CHOICES = [
        (1, '1 estrella'),
        (2, '2 estrellas'),
        (3, '3 estrellas'),
        (4, '4 estrellas'),
        (5, '5 estrellas'),
    ]

    branch = models.ForeignKey(
        Branch,
        on_delete=models.CASCADE,
        related_name='reviews',
        verbose_name='Sucursal'
    )
    client = models.ForeignKey(
        'accounts.Client',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='reviews',
        verbose_name='Cliente'
    )
    rating = models.PositiveSmallIntegerField(
        'Calificación',
        choices=RATING_CHOICES,
        help_text='Calificación de 1 a 5 estrellas'
    )
    comment = models.TextField(
        'Comentario',
        blank=True,
        help_text='Comentario opcional sobre la experiencia'
    )
    # Para reseñas verificadas (cliente tuvo cita real)
    is_verified = models.BooleanField(
        'Verificado',
        default=False,
        help_text='Indica si el cliente tuvo una cita verificada'
    )
    appointment = models.OneToOneField(
        'appointments.Appointment',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='review',
        verbose_name='Cita relacionada'
    )
    # Moderación
    is_approved = models.BooleanField(
        'Aprobado',
        default=True,
        help_text='Las reseñas pueden ser moderadas'
    )
    # Fechas
    created_at = models.DateTimeField('Creado', auto_now_add=True)
    updated_at = models.DateTimeField('Actualizado', auto_now=True)

    class Meta:
        verbose_name = 'Reseña'
        verbose_name_plural = 'Reseñas'
        ordering = ['-created_at']
        # Un cliente solo puede dejar una reseña por cita
        constraints = [
            models.UniqueConstraint(
                fields=['client', 'appointment'],
                name='unique_review_per_appointment',
                condition=models.Q(appointment__isnull=False)
            )
        ]

    def __str__(self):
        stars = '⭐' * self.rating
        return f'{self.branch.name} - {stars} ({self.client or "Anónimo"})'


class ReviewToken(models.Model):
    """
    Token único para que clientes dejen reseñas después de una cita completada.
    Se envía por WhatsApp al finalizar la cita.
    """
    import secrets

    appointment = models.OneToOneField(
        'appointments.Appointment',
        on_delete=models.CASCADE,
        related_name='review_token',
        verbose_name='Cita'
    )
    token = models.CharField(
        'Token',
        max_length=64,
        unique=True,
        db_index=True
    )
    is_used = models.BooleanField(
        'Usado',
        default=False,
        help_text='Se marca como usado cuando el cliente deja la reseña'
    )
    expires_at = models.DateTimeField(
        'Expira',
        help_text='El token expira después de 7 días'
    )
    created_at = models.DateTimeField('Creado', auto_now_add=True)
    used_at = models.DateTimeField('Usado el', null=True, blank=True)

    class Meta:
        verbose_name = 'Token de reseña'
        verbose_name_plural = 'Tokens de reseña'
        ordering = ['-created_at']

    def __str__(self):
        return f'Token para cita #{self.appointment_id} - {"Usado" if self.is_used else "Pendiente"}'

    @classmethod
    def generate_token(cls):
        """Genera un token único de 32 caracteres."""
        import secrets
        return secrets.token_urlsafe(24)

    @classmethod
    def create_for_appointment(cls, appointment):
        """Crea un token de reseña para una cita completada."""
        from django.utils import timezone
        from datetime import timedelta

        # El token expira en 7 días
        expires_at = timezone.now() + timedelta(days=7)

        return cls.objects.create(
            appointment=appointment,
            token=cls.generate_token(),
            expires_at=expires_at
        )

    def is_valid(self):
        """Verifica si el token es válido (no usado y no expirado)."""
        from django.utils import timezone
        return not self.is_used and self.expires_at > timezone.now()

    def mark_as_used(self):
        """Marca el token como usado."""
        from django.utils import timezone
        self.is_used = True
        self.used_at = timezone.now()
        self.save(update_fields=['is_used', 'used_at'])
