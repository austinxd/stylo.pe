"""
Serializers para suscripciones.
"""
from rest_framework import serializers
from .models import PricingPlan, BusinessSubscription, StaffSubscription, Invoice


class PricingPlanSerializer(serializers.ModelSerializer):
    """Serializer para el plan de precios."""

    class Meta:
        model = PricingPlan
        fields = ['id', 'name', 'price_per_staff', 'trial_days', 'currency']


class StaffSubscriptionSerializer(serializers.ModelSerializer):
    """Serializer para suscripción de profesional."""
    staff_name = serializers.CharField(source='staff.full_name', read_only=True)
    staff_photo = serializers.SerializerMethodField()

    class Meta:
        model = StaffSubscription
        fields = [
            'id', 'staff', 'staff_name', 'staff_photo',
            'added_at', 'trial_ends_at', 'trial_days_remaining',
            'is_billable', 'billable_since', 'is_active'
        ]

    def get_staff_photo(self, obj):
        if obj.staff.photo:
            return obj.staff.photo.url
        return None


class BusinessSubscriptionSerializer(serializers.ModelSerializer):
    """Serializer para suscripción del negocio."""
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    monthly_cost = serializers.SerializerMethodField()

    class Meta:
        model = BusinessSubscription
        fields = [
            'id', 'status', 'status_display',
            'active_staff_count', 'billable_staff_count', 'monthly_cost',
            'trial_ends_at', 'next_billing_date',
            'last_payment_date', 'last_payment_amount',
            'started_at'
        ]

    def get_monthly_cost(self, obj):
        return str(obj.calculate_monthly_cost())


class InvoiceSerializer(serializers.ModelSerializer):
    """Serializer para facturas."""
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    period = serializers.SerializerMethodField()

    class Meta:
        model = Invoice
        fields = [
            'id', 'period_start', 'period_end', 'period',
            'staff_count', 'price_per_staff', 'subtotal',
            'is_prorated', 'prorated_days',
            'total', 'currency',
            'status', 'status_display',
            'due_date', 'paid_at',
            'payment_method', 'payment_reference',
            'created_at'
        ]

    def get_period(self, obj):
        return f"{obj.period_start.strftime('%d/%m/%Y')} - {obj.period_end.strftime('%d/%m/%Y')}"


class SubscriptionSummarySerializer(serializers.Serializer):
    """Serializer para el resumen de suscripción."""
    status = serializers.CharField()
    status_display = serializers.CharField()
    can_receive_bookings = serializers.BooleanField()
    active_staff_count = serializers.IntegerField()
    billable_staff_count = serializers.IntegerField()
    monthly_cost = serializers.CharField()
    next_billing_date = serializers.DateField(allow_null=True)
    last_payment_date = serializers.DateField(allow_null=True)
    last_payment_amount = serializers.CharField(allow_null=True)
    plan = PricingPlanSerializer(allow_null=True)
    staff = StaffSubscriptionSerializer(many=True)
    pending_invoices = InvoiceSerializer(many=True)
