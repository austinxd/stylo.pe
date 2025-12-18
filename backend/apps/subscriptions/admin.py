from django.contrib import admin
from django.utils.html import format_html
from django.utils import timezone
from datetime import timedelta
from .models import (
    PricingPlan, BusinessSubscription, StaffSubscription,
    Invoice, InvoiceLineItem, PaymentMethod, Payment
)


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
        'business', 'status_badge', 'courtesy_badge', 'active_staff_count', 'billable_staff_count',
        'monthly_cost_display', 'next_billing_date', 'last_payment_date'
    ]
    list_filter = ['status', 'has_courtesy_access', 'created_at']
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
        ('Acceso Cortesía', {
            'fields': ('has_courtesy_access', 'courtesy_until', 'courtesy_reason'),
            'description': 'Permite al negocio pagar facturas sin tarjeta real. '
                           'Se crea automáticamente un método de pago virtual "Cortesía Stylo".'
        }),
        ('Período de Prueba', {
            'fields': ('trial_ends_at',)
        }),
        ('Fechas', {
            'fields': ('started_at', 'created_at', 'updated_at'),
            'classes': ('collapse',)
        }),
    )

    actions = ['enable_courtesy_30_days', 'enable_courtesy_90_days', 'enable_courtesy_unlimited', 'disable_courtesy']

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

    def courtesy_badge(self, obj):
        if obj.is_courtesy_active:
            if obj.courtesy_until:
                label = f"Hasta {obj.courtesy_until.strftime('%d/%m/%Y')}"
            else:
                label = "Sin límite"
            return format_html(
                '<span style="background-color: #8B5CF6; color: white; padding: 3px 10px; '
                'border-radius: 10px; font-size: 11px;">{}</span>',
                label
            )
        return format_html(
            '<span style="color: #9CA3AF; font-size: 11px;">—</span>'
        )
    courtesy_badge.short_description = 'Cortesía'

    def monthly_cost_display(self, obj):
        cost = obj.calculate_monthly_cost()
        return f"S/ {cost}"
    monthly_cost_display.short_description = 'Costo Mensual'

    def _enable_courtesy(self, request, queryset, days=None, reason=''):
        """Helper para habilitar cortesía."""
        from .services import CourtesyService
        count = 0
        for sub in queryset:
            CourtesyService.enable_courtesy(
                business=sub.business,
                days=days,
                reason=reason or f'Habilitado por {request.user.email}'
            )
            count += 1
        if days:
            self.message_user(request, f'{count} negocios con cortesía por {days} días.')
        else:
            self.message_user(request, f'{count} negocios con cortesía sin límite.')

    @admin.action(description='Habilitar cortesía (30 días)')
    def enable_courtesy_30_days(self, request, queryset):
        self._enable_courtesy(request, queryset, days=30)

    @admin.action(description='Habilitar cortesía (90 días)')
    def enable_courtesy_90_days(self, request, queryset):
        self._enable_courtesy(request, queryset, days=90)

    @admin.action(description='Habilitar cortesía (sin límite)')
    def enable_courtesy_unlimited(self, request, queryset):
        self._enable_courtesy(request, queryset, days=None)

    @admin.action(description='Desactivar cortesía')
    def disable_courtesy(self, request, queryset):
        from .services import CourtesyService
        count = 0
        for sub in queryset:
            CourtesyService.disable_courtesy(sub.business)
            count += 1
        self.message_user(request, f'{count} negocios sin cortesía.')

    def save_model(self, request, obj, form, change):
        """Al guardar, sincronizar el método de pago cortesía."""
        super().save_model(request, obj, form, change)
        from .services import CourtesyService
        if obj.has_courtesy_access:
            CourtesyService._ensure_courtesy_payment_method(obj.business)
        else:
            CourtesyService._remove_courtesy_payment_method(obj.business)


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

    actions = ['extend_trial_7_days', 'extend_trial_14_days', 'extend_trial_30_days', 'activate_manually', 'deactivate']

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

    @admin.action(description='Extender trial +7 días')
    def extend_trial_7_days(self, request, queryset):
        self._extend_trial(request, queryset, 7)

    @admin.action(description='Extender trial +14 días')
    def extend_trial_14_days(self, request, queryset):
        self._extend_trial(request, queryset, 14)

    @admin.action(description='Extender trial +30 días')
    def extend_trial_30_days(self, request, queryset):
        self._extend_trial(request, queryset, 30)

    def _extend_trial(self, request, queryset, days):
        now = timezone.now()
        count = 0
        for sub in queryset:
            # Si el trial ya expiró, extender desde ahora
            if sub.trial_ends_at and sub.trial_ends_at < now:
                sub.trial_ends_at = now + timedelta(days=days)
            else:
                # Si aún está en trial, sumar días
                sub.trial_ends_at = (sub.trial_ends_at or now) + timedelta(days=days)
            sub.is_billable = False  # Volver a trial
            sub.save()
            count += 1
        self.message_user(request, f'{count} suscripciones extendidas +{days} días.')

    @admin.action(description='Activar manualmente (sin cobro)')
    def activate_manually(self, request, queryset):
        """Activa la suscripción sin requerir pago - útil para testing."""
        count = 0
        for sub in queryset:
            sub.is_active = True
            sub.is_billable = True
            sub.billable_since = timezone.now().date()
            # Extender trial al futuro para que pase la validación
            sub.trial_ends_at = timezone.now() + timedelta(days=365)
            sub.save()
            count += 1

            # También actualizar la suscripción del negocio
            try:
                business_sub = sub.business.subscription
                if business_sub.status in ['trial', 'past_due', 'suspended']:
                    business_sub.status = 'active'
                    business_sub.save()
            except Exception:
                pass

        self.message_user(request, f'{count} profesionales activados manualmente.')

    @admin.action(description='Desactivar suscripción')
    def deactivate(self, request, queryset):
        count = queryset.update(is_active=False)
        self.message_user(request, f'{count} suscripciones desactivadas.')


class InvoiceLineItemInline(admin.TabularInline):
    """Inline para ver line items de una factura."""
    model = InvoiceLineItem
    extra = 0
    readonly_fields = ['staff', 'staff_name', 'period_start', 'period_end', 'days_in_period', 'days_active', 'monthly_rate', 'daily_rate', 'subtotal']
    can_delete = False

    def has_add_permission(self, request, obj=None):
        return False


class PaymentInline(admin.TabularInline):
    """Inline para ver pagos de una factura."""
    model = Payment
    extra = 0
    readonly_fields = ['payment_method', 'amount', 'status', 'culqi_charge_id', 'error_message', 'processed_at', 'created_at']
    can_delete = False

    def has_add_permission(self, request, obj=None):
        return False


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
        'total', 'currency', 'created_at', 'updated_at', 'payment_method_used'
    ]
    date_hierarchy = 'created_at'
    inlines = [InvoiceLineItemInline, PaymentInline]

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
            'fields': ('status', 'due_date', 'paid_at', 'payment_method_used', 'payment_attempts', 'max_payment_attempts', 'notes')
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

    @admin.action(description='Marcar como pagada (manual)')
    def mark_as_paid(self, request, queryset):
        now = timezone.now()
        count = 0
        for invoice in queryset.filter(status='pending'):
            invoice.status = 'paid'
            invoice.paid_at = now
            invoice.notes = (invoice.notes or '') + f'\nMarcada como pagada manualmente por {request.user.email} el {now}'
            invoice.save()
            count += 1
        self.message_user(request, f'{count} facturas marcadas como pagadas.')


@admin.register(PaymentMethod)
class PaymentMethodAdmin(admin.ModelAdmin):
    """Admin para ver métodos de pago."""
    list_display = ['id', 'business', 'card_display', 'brand', 'card_type', 'is_default', 'is_active', 'created_at']
    list_filter = ['brand', 'card_type', 'is_default', 'is_active']
    search_fields = ['business__name', 'holder_name', 'last_four']
    readonly_fields = ['culqi_customer_id', 'culqi_card_id', 'created_at', 'updated_at']

    fieldsets = (
        ('Negocio', {
            'fields': ('business', 'is_default', 'is_active')
        }),
        ('Tarjeta', {
            'fields': ('brand', 'card_type', 'last_four', 'holder_name', 'expiration_month', 'expiration_year')
        }),
        ('Culqi', {
            'fields': ('culqi_customer_id', 'culqi_card_id'),
            'classes': ('collapse',)
        }),
        ('Fechas', {
            'fields': ('created_at', 'updated_at'),
            'classes': ('collapse',)
        }),
    )


@admin.register(Payment)
class PaymentAdmin(admin.ModelAdmin):
    """Admin para ver historial de pagos."""
    list_display = ['id', 'invoice', 'amount_display', 'status_badge', 'payment_method', 'processed_at', 'created_at']
    list_filter = ['status', 'created_at']
    search_fields = ['invoice__business__name', 'culqi_charge_id']
    readonly_fields = ['invoice', 'payment_method', 'amount', 'amount_cents', 'culqi_charge_id', 'culqi_response_code', 'culqi_full_response', 'error_message', 'processed_at', 'created_at']
    date_hierarchy = 'created_at'

    fieldsets = (
        ('Factura', {
            'fields': ('invoice', 'payment_method')
        }),
        ('Monto', {
            'fields': ('amount', 'amount_cents')
        }),
        ('Estado', {
            'fields': ('status', 'error_message', 'processed_at')
        }),
        ('Culqi', {
            'fields': ('culqi_charge_id', 'culqi_response_code', 'culqi_full_response'),
            'classes': ('collapse',)
        }),
        ('Fechas', {
            'fields': ('created_at',),
            'classes': ('collapse',)
        }),
    )

    def amount_display(self, obj):
        return f"S/ {obj.amount}"
    amount_display.short_description = 'Monto'

    def status_badge(self, obj):
        colors = {
            'pending': '#F59E0B',   # yellow
            'succeeded': '#10B981', # green
            'failed': '#EF4444',    # red
            'refunded': '#6B7280',  # gray
        }
        color = colors.get(obj.status, '#6B7280')
        return format_html(
            '<span style="background-color: {}; color: white; padding: 3px 10px; '
            'border-radius: 10px; font-size: 11px;">{}</span>',
            color, obj.get_status_display()
        )
    status_badge.short_description = 'Estado'
