"""
Serializers para servicios.
"""
from rest_framework import serializers
from .models import ServiceCategory, Service, StaffService


class ServiceCategorySerializer(serializers.ModelSerializer):
    """Serializer para categorías de servicios."""

    class Meta:
        model = ServiceCategory
        fields = ['id', 'name', 'description', 'icon', 'order', 'is_active']
        read_only_fields = ['id']


class ServiceSerializer(serializers.ModelSerializer):
    """Serializer para servicios."""
    category_name = serializers.CharField(source='category.name', read_only=True)
    total_duration = serializers.IntegerField(read_only=True)
    gender_display = serializers.CharField(source='get_gender_display', read_only=True)

    class Meta:
        model = Service
        fields = [
            'id', 'name', 'description', 'category', 'category_name',
            'duration_minutes', 'total_duration', 'price', 'gender', 'gender_display',
            'buffer_time_before', 'buffer_time_after',
            'is_active', 'is_featured', 'created_at'
        ]
        read_only_fields = ['id', 'created_at']


class ServiceListSerializer(serializers.ModelSerializer):
    """Serializer simplificado para listas de servicios."""
    category_name = serializers.CharField(source='category.name', read_only=True)
    gender_display = serializers.CharField(source='get_gender_display', read_only=True)

    class Meta:
        model = Service
        fields = ['id', 'name', 'description', 'category_name', 'duration_minutes', 'price', 'gender', 'gender_display', 'is_featured']


class StaffServiceSerializer(serializers.ModelSerializer):
    """Serializer para servicios de profesionales."""
    staff_name = serializers.CharField(source='staff.full_name', read_only=True)
    service_name = serializers.CharField(source='service.name', read_only=True)
    service_price = serializers.DecimalField(
        source='service.price', max_digits=10, decimal_places=2, read_only=True
    )
    price = serializers.DecimalField(max_digits=10, decimal_places=2, read_only=True)
    duration = serializers.IntegerField(read_only=True)

    class Meta:
        model = StaffService
        fields = [
            'id', 'staff', 'staff_name', 'service', 'service_name',
            'custom_price', 'custom_duration', 'service_price',
            'price', 'duration', 'is_active'
        ]
        read_only_fields = ['id']


class ServiceWithStaffSerializer(serializers.ModelSerializer):
    """Serializer de servicio con los profesionales que lo ofrecen."""
    category_name = serializers.CharField(source='category.name', read_only=True)
    gender_display = serializers.CharField(source='get_gender_display', read_only=True)
    staff_providers = serializers.SerializerMethodField()

    class Meta:
        model = Service
        fields = [
            'id', 'name', 'description', 'category_name',
            'duration_minutes', 'price', 'is_featured', 'gender', 'gender_display',
            'staff_providers'
        ]

    def get_staff_providers(self, obj):
        active_providers = obj.staff_providers.filter(
            is_active=True,
            staff__is_active=True
        ).select_related('staff')
        return [
            {
                'id': sp.staff.id,
                'name': sp.staff.full_name,
                'photo': sp.staff.photo.url if sp.staff.photo else None,
                'price': float(sp.price),
                'duration': sp.duration
            }
            for sp in active_providers
        ]
