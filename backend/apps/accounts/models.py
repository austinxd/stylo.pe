"""
Modelos de usuarios y autenticación.

Flujo de registro:
- Super Admin: email + password (Django Admin)
- Business Owner: WhatsApp OTP + datos personales con documento
- Staff/Profesional: Creado por admin con documento, puede activar con WhatsApp OTP
- Cliente: WhatsApp OTP + datos personales con documento

El documento es el identificador único de la persona física.
"""
import secrets
import hashlib
from django.db import models
from django.contrib.auth.models import AbstractBaseUser, PermissionsMixin, BaseUserManager
from django.utils import timezone
from django.conf import settings

from apps.core.models import Business, Branch


class PersonProfile(models.Model):
    """
    Modelo base para datos personales.
    El documento es el identificador único de la persona física.
    Tanto clientes como staff comparten estos datos base.
    """
    DOCUMENT_TYPES = [
        ('dni', 'DNI'),
        ('pasaporte', 'Pasaporte'),
        ('ce', 'Carné de Extranjería'),
    ]

    document_type = models.CharField(
        'Tipo de documento',
        max_length=20,
        choices=DOCUMENT_TYPES
    )
    document_number = models.CharField(
        'Número de documento',
        max_length=20
    )
    first_name = models.CharField('Nombres', max_length=100)
    last_name_paterno = models.CharField('Apellido paterno', max_length=100)
    last_name_materno = models.CharField('Apellido materno', max_length=100, blank=True)
    birth_date = models.DateField('Fecha de nacimiento', null=True, blank=True)

    created_at = models.DateTimeField('Creado', auto_now_add=True)
    updated_at = models.DateTimeField('Actualizado', auto_now=True)

    class Meta:
        abstract = True

    @property
    def full_name(self):
        parts = [self.first_name, self.last_name_paterno]
        if self.last_name_materno:
            parts.append(self.last_name_materno)
        return ' '.join(parts)

    @property
    def document_display(self):
        return f"{self.get_document_type_display()}: {self.document_number}"


class UserManager(BaseUserManager):
    """Manager personalizado para el modelo User."""

    def create_user(self, phone_number=None, email=None, password=None, **extra_fields):
        """
        Crea y guarda un usuario.
        - Super admins usan email como identificador
        - Otros roles usan phone_number como identificador
        """
        role = extra_fields.get('role', 'staff')

        if role == 'super_admin':
            if not email:
                raise ValueError('El email es obligatorio para super_admin')
            email = self.normalize_email(email)
            user = self.model(email=email, phone_number=phone_number, **extra_fields)
        else:
            # Para staff creados por admin, phone_number puede ser opcional inicialmente
            user = self.model(phone_number=phone_number, email=email, **extra_fields)

        if password:
            user.set_password(password)
        else:
            user.set_unusable_password()  # Sin contraseña, usa OTP
        user.save(using=self._db)
        return user

    def create_superuser(self, email, password=None, **extra_fields):
        """Crea y guarda un superusuario con email."""
        extra_fields.setdefault('is_staff', True)
        extra_fields.setdefault('is_superuser', True)
        extra_fields.setdefault('role', 'super_admin')
        extra_fields.setdefault('is_verified', True)

        if extra_fields.get('is_staff') is not True:
            raise ValueError('Superuser debe tener is_staff=True.')
        if extra_fields.get('is_superuser') is not True:
            raise ValueError('Superuser debe tener is_superuser=True.')

        return self.create_user(email=email, password=password, **extra_fields)

    def get_or_create_by_document(self, document_type, document_number, **defaults):
        """
        Busca un usuario por su documento. Si existe, lo retorna.
        Si no existe, crea uno nuevo.
        Usado para vincular staff existente o crear nuevos.
        Nota: Los clientes ya no tienen User asociado.
        """
        # Buscar en perfiles de staff
        try:
            staff = StaffMember.objects.get(
                document_type=document_type,
                document_number=document_number
            )
            return staff.user, False
        except StaffMember.DoesNotExist:
            pass

        # No existe, crear nuevo usuario
        user = self.create_user(**defaults)
        return user, True


class User(AbstractBaseUser, PermissionsMixin):
    """
    Modelo de usuario personalizado.
    - Super admins usan email como identificador (para Django Admin)
    - Otros roles usan phone_number como identificador (WhatsApp OTP)

    El usuario puede no tener contraseña (set_unusable_password).
    La autenticación se hace vía WhatsApp OTP.
    """
    ROLE_CHOICES = [
        ('super_admin', 'Super Administrador'),
        ('business_owner', 'Dueño de Negocio'),
        ('branch_manager', 'Administrador de Sucursal'),
        ('staff', 'Profesional'),
    ]

    phone_number = models.CharField(
        'Número de teléfono',
        max_length=20,
        unique=True,
        blank=True,
        null=True,
        help_text='Formato internacional: +51987654321'
    )
    email = models.EmailField(
        'Email',
        unique=True,
        blank=True,
        null=True,
        help_text='Requerido para super_admin'
    )
    role = models.CharField('Rol', max_length=20, choices=ROLE_CHOICES, default='staff')

    # Permisos Django
    is_active = models.BooleanField('Activo', default=True)
    is_staff = models.BooleanField('Es staff Django', default=False)
    is_verified = models.BooleanField(
        'Verificado',
        default=False,
        help_text='True cuando el usuario verificó su teléfono por OTP'
    )

    # Relaciones con negocios (para roles administrativos)
    owned_businesses = models.ManyToManyField(
        Business,
        related_name='owners',
        blank=True,
        verbose_name='Negocios propios'
    )
    managed_branches = models.ManyToManyField(
        Branch,
        related_name='managers',
        blank=True,
        verbose_name='Sucursales administradas'
    )

    # Fechas
    date_joined = models.DateTimeField('Fecha de registro', default=timezone.now)
    last_login = models.DateTimeField('Último acceso', blank=True, null=True)

    objects = UserManager()

    # Django Admin usará email para super_admin
    USERNAME_FIELD = 'email'
    REQUIRED_FIELDS = []

    class Meta:
        verbose_name = 'Usuario'
        verbose_name_plural = 'Usuarios'

    def __str__(self):
        if self.role == 'super_admin':
            return self.email or 'Super Admin'
        # Intentar mostrar nombre del perfil de staff
        if hasattr(self, 'staff_profile'):
            return self.staff_profile.full_name
        if hasattr(self, 'owner_profile'):
            return self.owner_profile.full_name
        return self.phone_number or self.email or f'Usuario #{self.pk}'

    @property
    def is_admin(self):
        """Verifica si el usuario tiene rol administrativo."""
        return self.role in ['super_admin', 'business_owner', 'branch_manager']

    @property
    def profile(self):
        """Retorna el perfil asociado (staff o owner)."""
        if hasattr(self, 'staff_profile'):
            return self.staff_profile
        if hasattr(self, 'owner_profile'):
            return self.owner_profile
        return None

    def get_identifier(self):
        """Retorna el identificador principal según el rol."""
        if self.role == 'super_admin':
            return self.email
        return self.phone_number

    def can_login(self):
        """Verifica si el usuario puede hacer login."""
        return self.is_active and self.phone_number is not None


class Client(PersonProfile):
    """
    Cliente para reservas.

    Se identifican únicamente por su documento (DNI/CE/Pasaporte).
    El teléfono se usa para verificación OTP y contacto.
    Si el mismo documento reserva con otro teléfono, se actualiza.

    Actualmente NO requieren cuenta, pero en el futuro podrían tenerla
    para acceder a historial, preferencias, etc.
    """
    GENDER_CHOICES = [
        ('M', 'Masculino'),
        ('F', 'Femenino'),
    ]

    # Cuenta de usuario (opcional, para futuro)
    user = models.OneToOneField(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='client_profile',
        verbose_name='Cuenta de usuario'
    )

    # Teléfono para contacto y verificación OTP
    phone_number = models.CharField(
        'Número de teléfono',
        max_length=20,
        default='',  # Requerido para migración, se validará en forms/serializers
        help_text='Formato internacional: +51987654321'
    )

    # Email opcional para confirmaciones
    email = models.EmailField('Email', blank=True, null=True)

    # Género del cliente (para filtrar servicios)
    gender = models.CharField(
        'Género',
        max_length=1,
        choices=GENDER_CHOICES,
        default='M',
        help_text='Género del cliente para filtrar servicios disponibles'
    )

    # Foto de perfil
    photo = models.ImageField(
        'Foto de perfil',
        upload_to='clients/photos/',
        blank=True,
        null=True
    )

    # Preferencias
    whatsapp_opt_in = models.BooleanField(
        'Acepta notificaciones WhatsApp',
        default=True
    )

    class Meta:
        verbose_name = 'Cliente'
        verbose_name_plural = 'Clientes'
        unique_together = ['document_type', 'document_number']

    def __str__(self):
        return self.full_name

    @classmethod
    def get_or_create_from_booking(cls, document_type, document_number, phone_number,
                                    first_name, last_name_paterno, last_name_materno='',
                                    email=None, whatsapp_opt_in=True, gender='M', birth_date=None,
                                    photo=None):
        """
        Obtiene o crea un cliente a partir de datos de reserva.
        Si el documento existe, actualiza el teléfono, género, birth_date y foto si son diferentes.
        """
        try:
            client = cls.objects.get(
                document_type=document_type,
                document_number=document_number
            )
            # Actualizar teléfono, género, birth_date y foto si cambiaron
            update_fields = []
            if client.phone_number != phone_number:
                client.phone_number = phone_number
                update_fields.append('phone_number')
            if client.gender != gender:
                client.gender = gender
                update_fields.append('gender')
            if birth_date and client.birth_date != birth_date:
                client.birth_date = birth_date
                update_fields.append('birth_date')
            if photo and not client.photo:
                # Solo actualizar foto si el cliente no tiene una
                client.photo = photo
                update_fields.append('photo')
            if update_fields:
                update_fields.append('updated_at')
                client.save(update_fields=update_fields)
            return client, False
        except cls.DoesNotExist:
            client = cls.objects.create(
                document_type=document_type,
                document_number=document_number,
                phone_number=phone_number,
                first_name=first_name,
                last_name_paterno=last_name_paterno,
                last_name_materno=last_name_materno,
                email=email,
                whatsapp_opt_in=whatsapp_opt_in,
                gender=gender,
                birth_date=birth_date,
                photo=photo
            )
            return client, True


class StaffMember(PersonProfile):
    """
    Perfil de profesional/empleado.
    Representa a quienes brindan los servicios.

    REGLAS DE NEGOCIO:
    - Un profesional solo puede pertenecer a UN negocio a la vez
    - Para cambiar de negocio, el dueño actual debe hacer "release"
    - El perfil persiste para historial de carrera
    - Los profesionales NO controlan su cuenta (temporalmente)

    El profesional es creado y gestionado por el dueño del negocio.
    """
    EMPLOYMENT_STATUS_CHOICES = [
        ('active', 'Activo'),  # Trabajando en un negocio
        ('released', 'Liberado'),  # Fue liberado, puede unirse a otro
        ('pending', 'Pendiente'),  # Recién creado, esperando asignación
    ]

    user = models.OneToOneField(
        User,
        on_delete=models.CASCADE,
        related_name='staff_profile',
        verbose_name='Usuario'
    )

    # Negocio actual (un profesional solo pertenece a un negocio a la vez)
    current_business = models.ForeignKey(
        Business,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='staff_members',
        verbose_name='Negocio actual',
        help_text='El negocio al que pertenece actualmente'
    )

    # Sucursales donde trabaja (dentro del negocio actual)
    branches = models.ManyToManyField(
        Branch,
        related_name='branch_staff',
        verbose_name='Sucursales',
        blank=True
    )

    # Estado de empleo
    employment_status = models.CharField(
        'Estado de empleo',
        max_length=20,
        choices=EMPLOYMENT_STATUS_CHOICES,
        default='pending',
        help_text='Estado actual del profesional en la plataforma'
    )

    # Fecha de release (si fue liberado)
    released_at = models.DateTimeField(
        'Fecha de liberación',
        null=True,
        blank=True,
        help_text='Fecha cuando fue liberado del negocio anterior'
    )

    # Teléfono de contacto (registrado por admin)
    phone_number = models.CharField(
        'Teléfono',
        max_length=20,
        blank=True,
        default='',
        help_text='Teléfono de contacto del profesional'
    )

    # Datos profesionales
    photo = models.ImageField(
        'Foto',
        upload_to='staff/photos/',
        blank=True,
        null=True
    )
    bio = models.TextField('Biografía', blank=True)
    specialty = models.CharField('Especialidad', max_length=200, blank=True)

    # Estado
    is_active = models.BooleanField('Activo', default=True)

    # Color para calendario (formato hex, e.g., '#3B82F6')
    calendar_color = models.CharField(
        'Color de calendario',
        max_length=7,
        default='#3B82F6',
        help_text='Color hexadecimal para identificar al profesional en el calendario'
    )

    # Creado por admin - indica si el staff fue añadido por un admin
    # y aún no ha activado su cuenta
    created_by_admin = models.BooleanField(
        'Creado por admin',
        default=False,
        help_text='True si fue creado por un admin y el staff no ha verificado su cuenta'
    )

    class Meta:
        verbose_name = 'Profesional'
        verbose_name_plural = 'Profesionales'
        ordering = ['first_name']
        unique_together = ['document_type', 'document_number']

    def __str__(self):
        return self.full_name

    @property
    def is_account_activated(self):
        """El staff ha verificado su número de teléfono."""
        return self.user.is_verified and self.user.phone_number is not None

    @property
    def is_available_for_booking(self):
        """
        Verifica si el profesional está disponible para recibir citas.
        Requiere: al menos una sucursal + horario de trabajo + servicios asignados.
        """
        # Debe tener al menos una sucursal
        if not self.branches.exists():
            return False

        # Debe tener al menos un día de trabajo activo
        has_schedule = self.work_schedules.filter(is_working=True).exists()
        if not has_schedule:
            return False

        # Debe tener al menos un servicio asignado activo
        has_services = self.offered_services.filter(is_active=True).exists()
        if not has_services:
            return False

        return True

    @property
    def availability_status(self):
        """
        Retorna el estado de disponibilidad con detalle.
        Útil para mostrar qué falta configurar.
        """
        missing = []

        if not self.branches.exists():
            missing.append('sucursal')

        if not self.work_schedules.filter(is_working=True).exists():
            missing.append('horario')

        if not self.offered_services.filter(is_active=True).exists():
            missing.append('servicios')

        if missing:
            return {
                'available': False,
                'missing': missing,
                'message': f'Falta configurar: {", ".join(missing)}'
            }

        return {
            'available': True,
            'missing': [],
            'message': 'Disponible para citas'
        }


class StaffEmploymentHistory(models.Model):
    """
    Historial de empleo de un profesional.
    Registra cada negocio donde ha trabajado para armar su carrera.
    """
    staff = models.ForeignKey(
        StaffMember,
        on_delete=models.CASCADE,
        related_name='employment_history',
        verbose_name='Profesional'
    )
    business = models.ForeignKey(
        Business,
        on_delete=models.CASCADE,
        related_name='staff_history',
        verbose_name='Negocio'
    )
    started_at = models.DateTimeField(
        'Fecha de inicio',
        help_text='Fecha cuando comenzó a trabajar en el negocio'
    )
    ended_at = models.DateTimeField(
        'Fecha de fin',
        null=True,
        blank=True,
        help_text='Fecha cuando dejó de trabajar (null si aún trabaja)'
    )
    release_reason = models.TextField(
        'Motivo del release',
        blank=True,
        help_text='Motivo por el cual el dueño liberó al profesional'
    )
    released_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='staff_releases',
        verbose_name='Liberado por'
    )

    class Meta:
        verbose_name = 'Historial de Empleo'
        verbose_name_plural = 'Historial de Empleos'
        ordering = ['-started_at']

    def __str__(self):
        status = 'Actual' if not self.ended_at else f'Hasta {self.ended_at.date()}'
        return f'{self.staff.full_name} en {self.business.name} ({status})'


class BusinessOwnerProfile(PersonProfile):
    """
    Perfil del dueño de negocio.
    Contiene los datos personales del propietario.
    """
    user = models.OneToOneField(
        User,
        on_delete=models.CASCADE,
        related_name='owner_profile',
        verbose_name='Usuario'
    )

    # Foto de perfil
    photo = models.ImageField(
        'Foto de perfil',
        upload_to='owners/photos/',
        blank=True,
        null=True
    )

    class Meta:
        verbose_name = 'Perfil de Dueño'
        verbose_name_plural = 'Perfiles de Dueños'
        unique_together = ['document_type', 'document_number']

    def __str__(self):
        return self.full_name


class LoginSession(models.Model):
    """
    Sesión de login con OTP.
    Gestiona el flujo de autenticación vía WhatsApp.
    """
    STATUS_CHOICES = [
        ('OTP_SENT', 'OTP Enviado'),
        ('OTP_VERIFIED', 'OTP Verificado'),
        ('COMPLETED', 'Completado'),
        ('EXPIRED', 'Expirado'),
    ]

    phone_number = models.CharField('Número de teléfono', max_length=20)
    otp_hash = models.CharField('Hash del OTP', max_length=64)
    status = models.CharField(
        'Estado',
        max_length=20,
        choices=STATUS_CHOICES,
        default='OTP_SENT'
    )
    registration_token = models.CharField(
        'Token de registro',
        max_length=64,
        blank=True,
        null=True
    )
    attempts = models.PositiveSmallIntegerField('Intentos fallidos', default=0)
    max_attempts = models.PositiveSmallIntegerField('Máximo de intentos', default=3)

    # Para vincular staff existente durante el registro
    pending_staff_link = models.ForeignKey(
        StaffMember,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='pending_sessions',
        verbose_name='Staff pendiente de vincular'
    )

    # Fechas
    created_at = models.DateTimeField('Creado', auto_now_add=True)
    expires_at = models.DateTimeField('Expira')
    verified_at = models.DateTimeField('Verificado', blank=True, null=True)

    class Meta:
        verbose_name = 'Sesión de Login'
        verbose_name_plural = 'Sesiones de Login'
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.phone_number} - {self.status}'

    def set_otp(self, otp_code):
        """Guarda el OTP hasheado."""
        self.otp_hash = hashlib.sha256(otp_code.encode()).hexdigest()

    def verify_otp(self, otp_code):
        """Verifica si el OTP proporcionado es correcto."""
        otp_hash = hashlib.sha256(otp_code.encode()).hexdigest()
        return self.otp_hash == otp_hash

    def is_expired(self):
        """Verifica si la sesión ha expirado."""
        return timezone.now() > self.expires_at

    def is_locked(self):
        """Verifica si se han excedido los intentos."""
        return self.attempts >= self.max_attempts

    def generate_registration_token(self):
        """Genera un token temporal para completar el registro."""
        self.registration_token = secrets.token_urlsafe(32)
        return self.registration_token

    @classmethod
    def generate_otp(cls, length=None):
        """Genera un código OTP aleatorio."""
        if length is None:
            length = getattr(settings, 'OTP_LENGTH', 6)
        return ''.join([str(secrets.randbelow(10)) for _ in range(length)])


class BookingSession(models.Model):
    """
    Sesión de verificación OTP para reservas de clientes.

    Flujo:
    1. Cliente llena datos de reserva (servicio, fecha, hora, datos personales)
    2. Se envía OTP al WhatsApp del cliente
    3. Cliente verifica OTP
    4. Se crea/actualiza el Client y se confirma la reserva

    Separado de LoginSession porque los clientes no tienen User.
    """
    STATUS_CHOICES = [
        ('PENDING', 'Pendiente de datos'),
        ('OTP_SENT', 'OTP Enviado'),
        ('OTP_VERIFIED', 'OTP Verificado'),
        ('COMPLETED', 'Reserva Completada'),
        ('EXPIRED', 'Expirado'),
    ]

    # Token único para identificar la sesión
    session_token = models.CharField(
        'Token de sesión',
        max_length=64,
        unique=True,
        db_index=True
    )

    GENDER_CHOICES = [
        ('M', 'Masculino'),
        ('F', 'Femenino'),
    ]

    # Datos del cliente
    phone_number = models.CharField('Teléfono WhatsApp', max_length=20)
    document_type = models.CharField('Tipo documento', max_length=20)
    document_number = models.CharField('Número documento', max_length=20)
    first_name = models.CharField('Nombres', max_length=100)
    last_name_paterno = models.CharField('Apellido paterno', max_length=100)
    last_name_materno = models.CharField('Apellido materno', max_length=100, blank=True)
    birth_date = models.DateField('Fecha de nacimiento', null=True, blank=True)
    email = models.EmailField('Email', blank=True, null=True)
    gender = models.CharField(
        'Género',
        max_length=1,
        choices=GENDER_CHOICES,
        default='M',
        help_text='Género del cliente para filtrar servicios'
    )

    # Datos de la reserva (guardados como JSON para flexibilidad)
    branch_id = models.PositiveIntegerField('ID Sucursal')
    service_id = models.PositiveIntegerField('ID Servicio')
    staff_id = models.PositiveIntegerField('ID Profesional')
    start_datetime = models.DateTimeField('Fecha/hora inicio')
    notes = models.TextField('Notas', blank=True)

    # OTP y estado
    otp_hash = models.CharField('Hash del OTP', max_length=64, blank=True)
    status = models.CharField(
        'Estado',
        max_length=20,
        choices=STATUS_CHOICES,
        default='PENDING'
    )
    attempts = models.PositiveSmallIntegerField('Intentos fallidos', default=0)
    max_attempts = models.PositiveSmallIntegerField('Máximo de intentos', default=3)

    # Foto del cliente (temporal durante el flujo de reserva)
    photo = models.ImageField(
        'Foto del cliente',
        upload_to='booking_sessions/photos/',
        blank=True,
        null=True
    )

    # Resultado
    appointment_id = models.PositiveIntegerField(
        'ID Cita creada',
        null=True,
        blank=True
    )

    # Fechas
    created_at = models.DateTimeField('Creado', auto_now_add=True)
    expires_at = models.DateTimeField('Expira')
    verified_at = models.DateTimeField('Verificado', blank=True, null=True)

    class Meta:
        verbose_name = 'Sesión de Reserva'
        verbose_name_plural = 'Sesiones de Reserva'
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.phone_number} - {self.status}'

    @classmethod
    def generate_session_token(cls):
        """Genera un token único para la sesión."""
        return secrets.token_urlsafe(32)

    def set_otp(self, otp_code):
        """Guarda el OTP hasheado."""
        self.otp_hash = hashlib.sha256(otp_code.encode()).hexdigest()

    def verify_otp(self, otp_code):
        """Verifica si el OTP proporcionado es correcto."""
        otp_hash = hashlib.sha256(otp_code.encode()).hexdigest()
        return self.otp_hash == otp_hash

    def is_expired(self):
        """Verifica si la sesión ha expirado."""
        return timezone.now() > self.expires_at

    def is_locked(self):
        """Verifica si se han excedido los intentos."""
        return self.attempts >= self.max_attempts

    @classmethod
    def generate_otp(cls, length=None):
        """Genera un código OTP aleatorio."""
        if length is None:
            length = getattr(settings, 'OTP_LENGTH', 6)
        return ''.join([str(secrets.randbelow(10)) for _ in range(length)])
