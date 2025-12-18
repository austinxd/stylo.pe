"""
Serializers para modelos core.
"""
from rest_framework import serializers
from django.db.models import Avg, Q
from django.utils import timezone
from .models import Business, Branch, BranchPhoto, BusinessCategory, Review, ReviewToken
from apps.accounts.models import StaffMember
from apps.subscriptions.models import StaffSubscription


class BusinessCategorySerializer(serializers.ModelSerializer):
    """Serializer para categorías de negocio."""

    class Meta:
        model = BusinessCategory
        fields = ['id', 'slug', 'name', 'icon', 'color', 'order']


class BranchPhotoSerializer(serializers.ModelSerializer):
    """Serializer para fotos de sucursal."""

    class Meta:
        model = BranchPhoto
        fields = ['id', 'image', 'caption', 'is_cover', 'order']


class BranchStaffPublicSerializer(serializers.ModelSerializer):
    """Serializer simplificado de staff para mostrar en página pública de sucursal."""
    display_name = serializers.SerializerMethodField()

    class Meta:
        model = StaffMember
        fields = ['id', 'first_name', 'last_name_paterno', 'photo', 'specialty', 'display_name']

    def get_display_name(self, obj):
        """Retorna el nombre en formato 'Nombre I.' (primer nombre + inicial apellido)."""
        first = obj.first_name.split()[0] if obj.first_name else ''
        last_initial = f" {obj.last_name_paterno[0]}." if obj.last_name_paterno else ''
        return f"{first}{last_initial}"


class BranchSerializer(serializers.ModelSerializer):
    """Serializer completo para sucursales."""
    full_address = serializers.SerializerMethodField()

    class Meta:
        model = Branch
        fields = [
            'id', 'name', 'slug', 'cover_image', 'description',
            'address', 'address_reference', 'district', 'city', 'country',
            'postal_code', 'latitude', 'longitude', 'full_address',
            'phone', 'whatsapp', 'email', 'timezone',
            'is_active', 'is_main', 'created_at'
        ]
        read_only_fields = ['id', 'slug', 'created_at']

    def get_full_address(self, obj):
        """Retorna la dirección completa formateada."""
        parts = [obj.address]
        if obj.address_reference:
            parts.append(f'({obj.address_reference})')
        if obj.district:
            parts.append(f', {obj.district}')
        if obj.city:
            parts.append(f', {obj.city}')
        return ' '.join(parts)


class BranchListSerializer(serializers.ModelSerializer):
    """Serializer simplificado para listas de sucursales."""
    average_rating = serializers.SerializerMethodField()
    total_reviews = serializers.SerializerMethodField()

    class Meta:
        model = Branch
        fields = [
            'id', 'name', 'slug', 'cover_image',
            'address', 'district', 'city',
            'latitude', 'longitude', 'is_main',
            'average_rating', 'total_reviews'
        ]

    def get_average_rating(self, obj):
        result = obj.reviews.filter(is_approved=True).aggregate(avg=Avg('rating'))
        return round(result['avg'], 1) if result['avg'] else None

    def get_total_reviews(self, obj):
        return obj.reviews.filter(is_approved=True).count()


class BranchPublicDetailSerializer(serializers.ModelSerializer):
    """Serializer público con detalles para página de reservas."""
    full_address = serializers.SerializerMethodField()
    business_name = serializers.CharField(source='business.name', read_only=True)
    business_slug = serializers.CharField(source='business.slug', read_only=True)
    business_logo = serializers.ImageField(source='business.logo', read_only=True)
    photos = BranchPhotoSerializer(many=True, read_only=True)
    staff = serializers.SerializerMethodField()
    average_rating = serializers.SerializerMethodField()
    total_reviews = serializers.SerializerMethodField()

    class Meta:
        model = Branch
        fields = [
            'id', 'name', 'slug', 'cover_image', 'description',
            'address', 'address_reference', 'district', 'city',
            'latitude', 'longitude', 'full_address',
            'phone', 'whatsapp', 'email',
            'opening_time', 'closing_time',
            'business_name', 'business_slug', 'business_logo',
            'photos', 'staff', 'is_main', 'average_rating', 'total_reviews'
        ]

    def get_full_address(self, obj):
        parts = [obj.address]
        if obj.address_reference:
            parts.append(f'({obj.address_reference})')
        if obj.district:
            parts.append(f', {obj.district}')
        if obj.city:
            parts.append(f', {obj.city}')
        return ' '.join(parts)

    def get_average_rating(self, obj):
        result = obj.reviews.filter(is_approved=True).aggregate(avg=Avg('rating'))
        return round(result['avg'], 1) if result['avg'] else None

    def get_total_reviews(self, obj):
        return obj.reviews.filter(is_approved=True).count()

    def get_staff(self, obj):
        """Retorna los profesionales activos de la sucursal con membresía válida."""
        # Obtener IDs de profesionales con membresía válida:
        # is_active=True AND (is_billable=True OR trial_ends_at > now)
        now = timezone.now()
        valid_staff_ids = StaffSubscription.objects.filter(
            business=obj.business,
            is_active=True
        ).filter(
            Q(is_billable=True) | Q(trial_ends_at__gt=now)
        ).values_list('staff_id', flat=True)

        staff_members = StaffMember.objects.filter(
            branches=obj,
            is_active=True,
            id__in=valid_staff_ids
        )
        return BranchStaffPublicSerializer(staff_members, many=True).data


class BusinessSerializer(serializers.ModelSerializer):
    """Serializer para negocios."""
    branches = BranchListSerializer(many=True, read_only=True)
    branches_count = serializers.SerializerMethodField()
    categories = BusinessCategorySerializer(many=True, read_only=True)

    class Meta:
        model = Business
        fields = [
            'id', 'name', 'slug', 'description', 'logo',
            'email', 'phone', 'website', 'instagram', 'facebook',
            'is_active', 'is_verified', 'branches', 'branches_count',
            'categories', 'created_at'
        ]
        read_only_fields = ['id', 'slug', 'is_verified', 'created_at']

    def get_branches_count(self, obj):
        return obj.branches.filter(is_active=True).count()


class BusinessListSerializer(serializers.ModelSerializer):
    """Serializer simplificado para listas de negocios."""
    branches_count = serializers.SerializerMethodField()
    categories = BusinessCategorySerializer(many=True, read_only=True)

    class Meta:
        model = Business
        fields = ['id', 'name', 'slug', 'logo', 'is_verified', 'branches_count', 'categories']

    def get_branches_count(self, obj):
        return obj.branches.filter(is_active=True).count()


class BusinessPublicDetailSerializer(serializers.ModelSerializer):
    """Serializer público para página del negocio."""
    branches = BranchListSerializer(many=True, read_only=True, source='active_branches')
    branches_count = serializers.SerializerMethodField()
    has_multiple_branches = serializers.SerializerMethodField()
    categories = BusinessCategorySerializer(many=True, read_only=True)

    class Meta:
        model = Business
        fields = [
            'id', 'name', 'slug', 'description', 'logo', 'cover_image',
            'cover_position', 'primary_color', 'secondary_color',
            'email', 'phone', 'website', 'instagram', 'facebook',
            'is_verified', 'branches', 'branches_count', 'has_multiple_branches',
            'categories'
        ]

    def get_branches_count(self, obj):
        return obj.branches.filter(is_active=True).count()

    def get_has_multiple_branches(self, obj):
        return obj.branches.filter(is_active=True).count() > 1


class ReviewSerializer(serializers.ModelSerializer):
    """Serializer para reseñas de sucursales."""
    client_name = serializers.SerializerMethodField()
    client_initial = serializers.SerializerMethodField()

    class Meta:
        model = Review
        fields = [
            'id', 'rating', 'comment', 'is_verified',
            'client_name', 'client_initial', 'created_at'
        ]
        read_only_fields = ['id', 'is_verified', 'created_at']

    def get_client_name(self, obj):
        if obj.client:
            return f"{obj.client.first_name} {obj.client.last_name_paterno[0] if obj.client.last_name_paterno else ''}."
        return None

    def get_client_initial(self, obj):
        if obj.client and obj.client.first_name:
            return obj.client.first_name[0].upper()
        return "C"


class ReviewCreateSerializer(serializers.ModelSerializer):
    """Serializer para crear reseñas."""

    class Meta:
        model = Review
        fields = ['branch', 'rating', 'comment', 'appointment']

    def validate_rating(self, value):
        if value < 1 or value > 5:
            raise serializers.ValidationError("La calificación debe ser entre 1 y 5 estrellas.")
        return value

    def create(self, validated_data):
        request = self.context.get('request')
        if request and hasattr(request.user, 'client'):
            validated_data['client'] = request.user.client
            # Si hay appointment, marcar como verificado
            if validated_data.get('appointment'):
                validated_data['is_verified'] = True
        return super().create(validated_data)


class BranchRatingSerializer(serializers.Serializer):
    """Serializer para datos de rating agregados."""
    average_rating = serializers.FloatField()
    total_reviews = serializers.IntegerField()
    rating_distribution = serializers.DictField()


class ReviewTokenInfoSerializer(serializers.ModelSerializer):
    """
    Serializer para mostrar información del token de reseña.
    Se usa en GET /reviews/token/{token}/ para mostrar datos de la cita
    antes de que el cliente deje su reseña.
    """
    appointment_id = serializers.IntegerField(source='appointment.id', read_only=True)
    appointment_date = serializers.DateTimeField(source='appointment.start_datetime', read_only=True)
    service_name = serializers.CharField(source='appointment.service.name', read_only=True)
    staff_name = serializers.SerializerMethodField()
    branch_name = serializers.CharField(source='appointment.branch.name', read_only=True)
    business_name = serializers.CharField(source='appointment.branch.business.name', read_only=True)
    client_name = serializers.SerializerMethodField()

    class Meta:
        model = ReviewToken
        fields = [
            'token', 'appointment_id', 'appointment_date',
            'service_name', 'staff_name', 'branch_name', 'business_name',
            'client_name', 'expires_at'
        ]
        read_only_fields = ['token', 'expires_at']

    def get_staff_name(self, obj):
        staff = obj.appointment.staff
        if staff:
            return f"{staff.first_name} {staff.last_name}"
        return None

    def get_client_name(self, obj):
        client = obj.appointment.client
        if client:
            return f"{client.first_name} {client.last_name_paterno}"
        return None


class ReviewWithTokenSerializer(serializers.Serializer):
    """
    Serializer para crear una reseña usando un token único.
    No requiere autenticación - el token valida la identidad del cliente.
    """
    rating = serializers.IntegerField(min_value=1, max_value=5)
    comment = serializers.CharField(required=False, allow_blank=True)

    def validate_rating(self, value):
        if value < 1 or value > 5:
            raise serializers.ValidationError("La calificación debe ser entre 1 y 5 estrellas.")
        return value

    def create(self, validated_data):
        review_token = self.context.get('review_token')
        appointment = review_token.appointment

        # Crear la reseña vinculada a la cita
        review = Review.objects.create(
            branch=appointment.branch,
            client=appointment.client,
            appointment=appointment,
            rating=validated_data['rating'],
            comment=validated_data.get('comment', ''),
            is_verified=True,  # Reseña verificada porque viene de una cita real
            is_approved=True   # Auto-aprobada
        )

        return review
