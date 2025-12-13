"""
Serializers para scheduling.
"""
from rest_framework import serializers
from .models import BranchSchedule, WorkSchedule, BlockedTime, SpecialDate


class BranchScheduleSerializer(serializers.ModelSerializer):
    """Serializer para horarios de sucursal."""
    day_name = serializers.CharField(source='get_day_of_week_display', read_only=True)

    class Meta:
        model = BranchSchedule
        fields = [
            'id', 'day_of_week', 'day_name',
            'opening_time', 'closing_time', 'is_open'
        ]
        read_only_fields = ['id']


class WorkScheduleSerializer(serializers.ModelSerializer):
    """Serializer para horarios de trabajo."""
    day_name = serializers.CharField(source='get_day_of_week_display', read_only=True)

    class Meta:
        model = WorkSchedule
        fields = [
            'id', 'staff', 'day_of_week', 'day_name',
            'start_time', 'end_time', 'is_working'
        ]
        read_only_fields = ['id']


class BlockedTimeSerializer(serializers.ModelSerializer):
    """Serializer para tiempos bloqueados."""
    block_type_display = serializers.CharField(
        source='get_block_type_display', read_only=True
    )

    class Meta:
        model = BlockedTime
        fields = [
            'id', 'staff', 'block_type', 'block_type_display',
            'start_datetime', 'end_datetime', 'reason', 'is_all_day',
            'created_at'
        ]
        read_only_fields = ['id', 'created_at']


class SpecialDateSerializer(serializers.ModelSerializer):
    """Serializer para fechas especiales."""
    date_type_display = serializers.CharField(
        source='get_date_type_display', read_only=True
    )

    class Meta:
        model = SpecialDate
        fields = [
            'id', 'branch', 'date', 'date_type', 'date_type_display',
            'name', 'opening_time', 'closing_time'
        ]
        read_only_fields = ['id']


class AvailabilitySlotSerializer(serializers.Serializer):
    """Serializer para slots de disponibilidad."""
    datetime = serializers.DateTimeField()
    available = serializers.BooleanField()
    staff_id = serializers.IntegerField(required=False)
    staff_name = serializers.CharField(required=False)


class DayAvailabilitySerializer(serializers.Serializer):
    """Serializer para disponibilidad de un día."""
    date = serializers.DateField()
    is_available = serializers.BooleanField()
    slots = AvailabilitySlotSerializer(many=True, required=False)
