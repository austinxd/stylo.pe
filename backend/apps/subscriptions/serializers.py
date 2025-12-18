"""
Serializers para suscripciones.
"""
from rest_framework import serializers
from .models import (
    PricingPlan, BusinessSubscription, StaffSubscription,
    Invoice, InvoiceLineItem, PaymentMethod, Payment
)


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
            'is_billable', 'billable_since', 'deactivated_at', 'is_active'
        ]

    def get_staff_photo(self, obj):
        if obj.staff.photo:
            return obj.staff.photo.url
        return None


class BusinessSubscriptionSerializer(serializers.ModelSerializer):
    """Serializer para suscripción del negocio."""
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    monthly_cost = serializers.SerializerMethodField()
    is_courtesy_active = serializers.BooleanField(read_only=True)

    class Meta:
        model = BusinessSubscription
        fields = [
            'id', 'status', 'status_display',
            'active_staff_count', 'billable_staff_count', 'monthly_cost',
            'trial_ends_at', 'next_billing_date',
            'last_payment_date', 'last_payment_amount',
            'has_courtesy_access', 'is_courtesy_active',
            'courtesy_until', 'courtesy_reason',
            'started_at'
        ]

    def get_monthly_cost(self, obj):
        return str(obj.calculate_monthly_cost())


class InvoiceSerializer(serializers.ModelSerializer):
    """Serializer para facturas."""
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    period = serializers.SerializerMethodField()
    payment_method_display = serializers.SerializerMethodField()

    class Meta:
        model = Invoice
        fields = [
            'id', 'period_start', 'period_end', 'period',
            'staff_count', 'price_per_staff', 'subtotal',
            'is_prorated', 'prorated_days',
            'total', 'currency',
            'status', 'status_display',
            'due_date', 'paid_at',
            'payment_method_used', 'payment_method_display',
            'payment_attempts', 'max_payment_attempts',
            'created_at'
        ]

    def get_period(self, obj):
        return f"{obj.period_start.strftime('%d/%m/%Y')} - {obj.period_end.strftime('%d/%m/%Y')}"

    def get_payment_method_display(self, obj):
        if obj.payment_method_used:
            return obj.payment_method_used.card_display
        return None


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
    # Campos de cortesía
    has_courtesy_access = serializers.BooleanField()
    is_courtesy_active = serializers.BooleanField()
    courtesy_until = serializers.DateField(allow_null=True)
    courtesy_reason = serializers.CharField(allow_null=True, allow_blank=True)
    # Relaciones
    plan = PricingPlanSerializer(allow_null=True)
    staff = StaffSubscriptionSerializer(many=True)
    pending_invoices = InvoiceSerializer(many=True)


# ==================== NUEVOS SERIALIZERS ====================

class PaymentMethodSerializer(serializers.ModelSerializer):
    """Serializer para métodos de pago."""
    card_display = serializers.CharField(read_only=True)
    brand_display = serializers.CharField(source='get_brand_display', read_only=True)
    card_type_display = serializers.CharField(source='get_card_type_display', read_only=True)
    method_type_display = serializers.CharField(source='get_method_type_display', read_only=True)
    is_virtual = serializers.BooleanField(read_only=True)
    display_expiration = serializers.CharField(read_only=True)

    class Meta:
        model = PaymentMethod
        fields = [
            'id', 'method_type', 'method_type_display',
            'card_type', 'card_type_display',
            'brand', 'brand_display', 'last_four',
            'holder_name', 'expiration_month', 'expiration_year',
            'display_expiration', 'is_virtual',
            'is_default', 'is_active', 'card_display', 'created_at'
        ]
        read_only_fields = ['id', 'created_at']


class PaymentMethodCreateSerializer(serializers.Serializer):
    """Serializer para agregar un nuevo método de pago."""
    card_token = serializers.CharField(
        help_text="Token de tarjeta generado por Culqi.js"
    )
    set_as_default = serializers.BooleanField(
        default=True,
        help_text="Si debe establecerse como método de pago por defecto"
    )


class InvoiceLineItemSerializer(serializers.ModelSerializer):
    """Serializer para detalle de líneas de factura."""

    class Meta:
        model = InvoiceLineItem
        fields = [
            'id', 'staff', 'staff_name', 'description',
            'period_start', 'period_end',
            'days_in_period', 'days_active',
            'monthly_rate', 'daily_rate', 'subtotal'
        ]


class InvoiceDetailSerializer(serializers.ModelSerializer):
    """Serializer detallado para factura con line items."""
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    period = serializers.SerializerMethodField()
    payment_method_display = serializers.SerializerMethodField()
    line_items = InvoiceLineItemSerializer(many=True, read_only=True)
    payments = serializers.SerializerMethodField()

    class Meta:
        model = Invoice
        fields = [
            'id', 'period_start', 'period_end', 'period',
            'staff_count', 'price_per_staff', 'subtotal',
            'is_prorated', 'prorated_days',
            'total', 'currency',
            'status', 'status_display',
            'due_date', 'paid_at',
            'payment_method_used', 'payment_method_display',
            'payment_attempts', 'max_payment_attempts',
            'notes', 'line_items', 'payments', 'created_at'
        ]

    def get_period(self, obj):
        return f"{obj.period_start.strftime('%d/%m/%Y')} - {obj.period_end.strftime('%d/%m/%Y')}"

    def get_payment_method_display(self, obj):
        if obj.payment_method_used:
            return obj.payment_method_used.card_display
        return None

    def get_payments(self, obj):
        return PaymentSerializer(obj.payments.all(), many=True).data


class PaymentSerializer(serializers.ModelSerializer):
    """Serializer para pagos."""
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    payment_method_display = serializers.SerializerMethodField()

    class Meta:
        model = Payment
        fields = [
            'id', 'amount', 'status', 'status_display',
            'payment_method_display', 'error_message',
            'processed_at', 'created_at'
        ]

    def get_payment_method_display(self, obj):
        if obj.payment_method:
            return obj.payment_method.card_display
        return None
