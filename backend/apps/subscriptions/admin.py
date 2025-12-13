from django.contrib import admin
from django.utils.html import format_html
from .models import PricingPlan, BusinessSubscription, StaffSubscription, Invoice


@admin.register(PricingPlan)
class PricingPlanAdmin(admin.ModelAdmin):
    """Admin para configurar planes de precios."""
    list_display = ['name', 'price_per_staff_display', 'trial_days', 'currency', 'is_active', 'updated_at']
    list_filter = ['is_active', 'currency']
    search_fields = ['name']
    readonly_fields = ['created_at', 'updated_at']

    fieldsets = (
        ('Información del Plan', {
            'fields': ('name', 'is_active')
        }),
        ('Precios', {
            'fields': ('price_per_staff', 'currency'),
            'description': 'Configure el precio mensual por cada profesional activo en el equipo.'
        }),
        ('Período de Prueba', {
            'fields': ('trial_days',),
            'description': 'Días gratis que tiene cada nuevo profesional antes de ser facturado.'
        }),
        ('Fechas', {
            'fields': ('created_at', 'updated_at'),
            'classes': ('collapse',)
        }),
    )

    def price_per_staff_display(self, obj):
        return f"S/ {obj.price_per_staff}"
    price_per_staff_display.short_description = 'Precio/Profesional'


@admin.register(BusinessSubscription)
class BusinessSubscriptionAdmin(admin.ModelAdmin):
    """Admin para ver suscripciones de negocios."""
    list_display = [
        'business', 'status_badge', 'active_staff_count', 'billable_staff_count',
        'monthly_cost_display', 'next_billing_date', 'last_payment_date'
    ]
    list_filter = ['status', 'created_at']
    search_fields = ['business__name']
    readonly_fields = [
        'business', 'started_at', 'created_at', 'updated_at',
        'active_staff_count', 'billable_staff_count', 'monthly_cost_display'
    ]

    fieldsets = (
        ('Negocio', {
            'fields': ('business', 'status')
        }),
        ('Estado de Facturación', {
            'fields': (
                'active_staff_count', 'billable_staff_count', 'monthly_cost_display',
                'next_billing_date', 'last_payment_date', 'last_payment_amount'
            )
        }),
        ('Período de Prueba', {
            'fields': ('trial_ends_at',)
        }),
        ('Fechas', {
            'fields': ('started_at', 'created_at', 'updated_at'),
            'classes': ('collapse',)
        }),
    )

    def status_badge(self, obj):
        colors = {
            'trial': '#3B82F6',      # blue
            'active': '#10B981',     # green
            'past_due': '#F59E0B',   # yellow
            'suspended': '#EF4444',  # red
            'cancelled': '#6B7280',  # gray
        }
        color = colors.get(obj.status, '#6B7280')
        return format_html(
            '<span style="background-color: {}; color: white; padding: 3px 10px; '
            'border-radius: 10px; font-size: 11px;">{}</span>',
            color, obj.get_status_display()
        )
    status_badge.short_description = 'Estado'

    def monthly_cost_display(self, obj):
        cost = obj.calculate_monthly_cost()
        return f"S/ {cost}"
    monthly_cost_display.short_description = 'Costo Mensual'


@admin.register(StaffSubscription)
class StaffSubscriptionAdmin(admin.ModelAdmin):
    """Admin para ver suscripciones por profesional."""
    list_display = [
        'staff', 'business', 'added_at', 'trial_status_badge',
        'trial_days_remaining', 'is_active'
    ]
    list_filter = ['is_billable', 'is_active', 'business']
    search_fields = ['staff__first_name', 'staff__last_name_paterno', 'business__name']
    readonly_fields = ['added_at', 'created_at', 'updated_at', 'trial_days_remaining']

    fieldsets = (
        ('Profesional', {
            'fields': ('staff', 'business', 'is_active')
        }),
        ('Estado de Trial', {
            'fields': ('trial_ends_at', 'trial_days_remaining', 'is_billable', 'billable_since')
        }),
        ('Fechas', {
            'fields': ('added_at', 'created_at', 'updated_at'),
            'classes': ('collapse',)
        }),
    )

    def trial_status_badge(self, obj):
        if obj.is_billable:
            return format_html(
                '<span style="background-color: #10B981; color: white; padding: 3px 10px; '
                'border-radius: 10px; font-size: 11px;">Facturable</span>'
            )
        else:
            return format_html(
                '<span style="background-color: #3B82F6; color: white; padding: 3px 10px; '
                'border-radius: 10px; font-size: 11px;">En Prueba</span>'
            )
    trial_status_badge.short_description = 'Estado'


@admin.register(Invoice)
class InvoiceAdmin(admin.ModelAdmin):
    """Admin para ver y gestionar facturas."""
    list_display = [
        'id', 'business', 'period_display', 'staff_count',
        'total_display', 'status_badge', 'due_date', 'paid_at'
    ]
    list_filter = ['status', 'is_prorated', 'created_at']
    search_fields = ['business__name']
    readonly_fields = [
        'business', 'period_start', 'period_end', 'staff_count',
        'price_per_staff', 'subtotal', 'is_prorated', 'prorated_days',
        'total', 'currency', 'created_at', 'updated_at'
    ]
    date_hierarchy = 'created_at'

    fieldsets = (
        ('Negocio', {
            'fields': ('business',)
        }),
        ('Período', {
            'fields': ('period_start', 'period_end', 'is_prorated', 'prorated_days')
        }),
        ('Detalle', {
            'fields': ('staff_count', 'price_per_staff', 'subtotal', 'total', 'currency')
        }),
        ('Pago', {
            'fields': ('status', 'due_date', 'paid_at', 'payment_method', 'payment_reference')
        }),
        ('Fechas', {
            'fields': ('created_at', 'updated_at'),
            'classes': ('collapse',)
        }),
    )

    actions = ['mark_as_paid']

    def period_display(self, obj):
        return f"{obj.period_start} - {obj.period_end}"
    period_display.short_description = 'Período'

    def total_display(self, obj):
        return f"S/ {obj.total}"
    total_display.short_description = 'Total'

    def status_badge(self, obj):
        colors = {
            'pending': '#F59E0B',   # yellow
            'paid': '#10B981',      # green
            'failed': '#EF4444',    # red
            'cancelled': '#6B7280', # gray
        }
        color = colors.get(obj.status, '#6B7280')
        return format_html(
            '<span style="background-color: {}; color: white; padding: 3px 10px; '
            'border-radius: 10px; font-size: 11px;">{}</span>',
            color, obj.get_status_display()
        )
    status_badge.short_description = 'Estado'

    @admin.action(description='Marcar como pagada')
    def mark_as_paid(self, request, queryset):
        for invoice in queryset.filter(status='pending'):
            invoice.mark_as_paid(payment_method='manual', payment_reference='Admin')
        self.message_user(request, f'{queryset.count()} facturas marcadas como pagadas.')
