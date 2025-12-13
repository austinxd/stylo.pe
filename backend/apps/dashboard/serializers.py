"""
Serializers para el dashboard de negocios.
"""
from rest_framework import serializers
from apps.core.models import Business, Branch, BranchPhoto
from apps.accounts.models import StaffMember
from apps.services.models import Service, ServiceCategory, StaffService
from apps.appointments.models import Appointment
from apps.scheduling.models import WorkSchedule, BlockedTime


class DashboardBranchSerializer(serializers.ModelSerializer):
    """Serializer de sucursales para el dashboard."""
    appointments_today = serializers.SerializerMethodField()
    staff_count = serializers.SerializerMethodField()
    services_count = serializers.SerializerMethodField()
    full_address = serializers.CharField(read_only=True)
    google_maps_url = serializers.CharField(read_only=True)
    # cover_image se maneja directamente en el view (request.FILES), no en el serializer
    cover_image = serializers.ImageField(read_only=True)

    class Meta:
        model = Branch
        fields = [
            'id', 'name', 'slug', 'address', 'address_reference', 'district', 'city',
            'latitude', 'longitude', 'phone', 'email', 'cover_image',
            'opening_time', 'closing_time',
            'is_active', 'is_main', 'appointments_today', 'staff_count', 'services_count',
            'full_address', 'google_maps_url'
        ]
        read_only_fields = ['id', 'slug', 'is_main', 'appointments_today', 'staff_count', 'services_count', 'full_address', 'google_maps_url']

    def validate_name(self, value):
        """Valida que no exista otra sucursal con el mismo nombre en el mismo negocio."""
        request = self.context.get('request')
        if request and request.user:
            user = request.user
            if user.role == 'business_owner':
                business = user.owned_businesses.first()
            elif hasattr(user, 'managed_branches') and user.managed_branches.exists():
                business = user.managed_branches.first().business
            else:
                return value

            # Verificar duplicados
            existing = Branch.objects.filter(business=business, name__iexact=value)
            if self.instance:
                existing = existing.exclude(pk=self.instance.pk)
            if existing.exists():
                raise serializers.ValidationError(f'Ya existe una sucursal con el nombre "{value}"')
        return value

    def get_appointments_today(self, obj):
        from django.utils import timezone
        today = timezone.now().date()
        return obj.appointments.filter(
            start_datetime__date=today,
            status__in=['pending', 'confirmed', 'in_progress']
        ).count()

    def get_staff_count(self, obj):
        return obj.branch_staff.filter(is_active=True).count()

    def get_services_count(self, obj):
        # Cuenta servicios activos de la sucursal
        return obj.services.filter(is_active=True).count()


class DashboardStaffSerializer(serializers.ModelSerializer):
    """Serializer de profesionales para el dashboard."""
    last_name = serializers.CharField(source='last_name_paterno', read_only=True)
    branches_info = serializers.SerializerMethodField()
    branch_ids = serializers.PrimaryKeyRelatedField(
        source='branches',
        queryset=Branch.objects.all(),
        many=True,
        required=False
    )
    services_count = serializers.SerializerMethodField()
    services_count_by_branch = serializers.SerializerMethodField()
    appointments_today = serializers.SerializerMethodField()
    is_available = serializers.BooleanField(source='is_available_for_booking', read_only=True)
    availability_status = serializers.DictField(read_only=True)
    has_schedule = serializers.SerializerMethodField()

    class Meta:
        model = StaffMember
        fields = [
            'id', 'first_name', 'last_name', 'last_name_materno', 'phone_number',
            'document_type', 'document_number', 'photo', 'specialty',
            'branch_ids', 'branches_info', 'is_active', 'calendar_color',
            'services_count', 'services_count_by_branch', 'appointments_today',
            'is_available', 'availability_status', 'has_schedule'
        ]

    def get_branches_info(self, obj):
        """Retorna información de las sucursales asignadas."""
        return [
            {'id': b.id, 'name': b.name}
            for b in obj.branches.all()
        ]

    def get_services_count(self, obj):
        return obj.offered_services.filter(is_active=True).count()

    def get_services_count_by_branch(self, obj):
        """Retorna el conteo de servicios por sucursal: {branch_id: count}."""
        from django.db.models import Count
        # Cuenta los servicios activos agrupados por sucursal
        counts = StaffService.objects.filter(
            staff=obj,
            is_active=True
        ).values('service__branch_id').annotate(count=Count('id'))
        return {item['service__branch_id']: item['count'] for item in counts}

    def get_appointments_today(self, obj):
        from django.utils import timezone
        today = timezone.now().date()
        return obj.appointments.filter(
            start_datetime__date=today,
            status__in=['pending', 'confirmed', 'in_progress']
        ).count()

    def get_has_schedule(self, obj):
        return obj.work_schedules.filter(is_working=True).exists()


class DashboardAppointmentSerializer(serializers.ModelSerializer):
    """Serializer de citas para el dashboard."""
    client_name = serializers.CharField(source='client.full_name', read_only=True)
    client_phone = serializers.CharField(source='client.phone_number', read_only=True)
    client_photo = serializers.ImageField(source='client.photo', read_only=True)
    staff_name = serializers.SerializerMethodField()
    service_name = serializers.CharField(source='service.name', read_only=True)

    def get_staff_name(self, obj):
        """Retorna el nombre del staff como 'Nombre I.' (solo primer nombre + inicial del apellido)."""
        if obj.staff:
            # Tomar solo el primer nombre si hay varios
            first_name = obj.staff.first_name.split()[0] if obj.staff.first_name else ''
            last_initial = obj.staff.last_name_paterno[0].upper() if obj.staff.last_name_paterno else ''
            return f"{first_name} {last_initial}." if last_initial else first_name
        return None

    class Meta:
        model = Appointment
        fields = [
            'id', 'client_name', 'client_phone', 'client_photo',
            'staff', 'staff_name', 'service', 'service_name',
            'start_datetime', 'end_datetime', 'status',
            'price', 'notes', 'staff_notes', 'created_at'
        ]


class DashboardServiceSerializer(serializers.ModelSerializer):
    """
    Serializer de servicios para el dashboard.
    Los servicios pertenecen a una Branch (sucursal) específica.
    """
    category_name = serializers.CharField(source='category.name', read_only=True, allow_null=True)
    gender_display = serializers.CharField(source='get_gender_display', read_only=True)
    branch_name = serializers.CharField(source='branch.name', read_only=True)
    staff_count = serializers.SerializerMethodField()

    class Meta:
        model = Service
        fields = [
            'id', 'name', 'description', 'category', 'category_name',
            'branch', 'branch_name',
            'gender', 'gender_display',
            'duration_minutes', 'price',
            'buffer_time_before', 'buffer_time_after',
            'is_active', 'is_featured', 'staff_count', 'image'
        ]

    def get_staff_count(self, obj):
        """Cuenta cuántos profesionales ofrecen este servicio."""
        return obj.staff_providers.filter(is_active=True).count()


class DashboardSummarySerializer(serializers.Serializer):
    """Serializer para resumen del dashboard."""
    appointments_today = serializers.IntegerField()
    appointments_week = serializers.IntegerField()
    revenue_today = serializers.DecimalField(max_digits=10, decimal_places=2)
    revenue_week = serializers.DecimalField(max_digits=10, decimal_places=2)
    clients_new_week = serializers.IntegerField()
    upcoming_appointments = DashboardAppointmentSerializer(many=True)


class StaffCreateUpdateSerializer(serializers.ModelSerializer):
    """Serializer para crear/actualizar profesionales."""
    last_name = serializers.CharField(source='last_name_paterno', required=False, allow_blank=True)
    branch_ids = serializers.PrimaryKeyRelatedField(
        source='branches',
        queryset=Branch.objects.all(),
        many=True,
        required=False
    )

    class Meta:
        model = StaffMember
        fields = [
            'document_type', 'document_number',
            'first_name', 'last_name', 'last_name_materno',
            'phone_number', 'photo', 'bio', 'specialty', 'branch_ids', 'is_active',
            'calendar_color'
        ]
        extra_kwargs = {
            'document_type': {'required': True},
            'document_number': {'required': True},
            'first_name': {'required': True},
            'last_name_materno': {'required': False, 'allow_blank': True},
            'phone_number': {'required': False, 'allow_blank': True},
        }

    def validate(self, data):
        """Verifica que no exista otro staff con el mismo documento."""
        document_type = data.get('document_type')
        document_number = data.get('document_number', '').strip().upper()

        if document_type and document_number:
            # Normalizar documento
            document_number = ''.join(c for c in document_number if c.isalnum())
            data['document_number'] = document_number

            existing = StaffMember.objects.filter(
                document_type=document_type,
                document_number=document_number
            )
            if self.instance:
                existing = existing.exclude(pk=self.instance.pk)
            if existing.exists():
                raise serializers.ValidationError({
                    'document_number': 'Ya existe un profesional con este documento'
                })
        return data


class ServiceCreateUpdateSerializer(serializers.ModelSerializer):
    """
    Serializer para crear/actualizar servicios.
    Los servicios se crean a nivel de sucursal con su precio.
    """

    class Meta:
        model = Service
        fields = [
            'name', 'description', 'category', 'branch', 'gender', 'duration_minutes',
            'price', 'buffer_time_before', 'buffer_time_after', 'is_active', 'is_featured', 'image'
        ]


class WorkScheduleUpdateSerializer(serializers.ModelSerializer):
    """Serializer para actualizar horarios de trabajo por sucursal."""
    branch_name = serializers.CharField(source='branch.name', read_only=True)

    class Meta:
        model = WorkSchedule
        fields = ['id', 'branch', 'branch_name', 'day_of_week', 'start_time', 'end_time', 'is_working']
        extra_kwargs = {
            'branch': {'required': True}
        }

    def validate(self, data):
        """Valida que no haya cruces de horarios en diferentes sucursales."""
        staff = self.context.get('staff')
        if not staff and self.instance:
            staff = self.instance.staff

        if staff and data.get('is_working', True):
            # Validación de cruce ya se hace en el modelo
            pass
        return data


class BlockedTimeCreateSerializer(serializers.ModelSerializer):
    """Serializer para crear tiempos bloqueados."""

    class Meta:
        model = BlockedTime
        fields = [
            'block_type', 'start_datetime', 'end_datetime',
            'reason', 'is_all_day'
        ]


class BranchPhotoSerializer(serializers.ModelSerializer):
    """Serializer para fotos de sucursal en el dashboard."""

    class Meta:
        model = BranchPhoto
        fields = ['id', 'image', 'caption', 'is_cover', 'order', 'created_at']
        read_only_fields = ['id', 'created_at']


class BranchPhotoCreateSerializer(serializers.ModelSerializer):
    """Serializer para crear fotos de sucursal."""

    class Meta:
        model = BranchPhoto
        fields = ['image', 'caption', 'is_cover', 'order']
        extra_kwargs = {
            'caption': {'required': False, 'allow_blank': True},
            'is_cover': {'required': False, 'default': False},
            'order': {'required': False, 'default': 0},
        }
