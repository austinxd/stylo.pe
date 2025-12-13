"""
Admin para modelos de cuentas.

Organización:
- Administradores: Solo super_admin
- Cuentas de Negocio: Dueños y Profesionales juntos
- Clientes: Client
"""
from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from django.utils.html import format_html
from .models import User, Client, StaffMember, BusinessOwnerProfile, LoginSession


# ============================================================
# Proxy Model para Administradores
# ============================================================

class AdminUser(User):
    """Proxy para super admins."""
    class Meta:
        proxy = True
        verbose_name = 'Administrador'
        verbose_name_plural = 'Administradores'


# ============================================================
# Admin: Administradores (super_admin)
# ============================================================

@admin.register(AdminUser)
class AdminUserAdmin(BaseUserAdmin):
    list_display = ['email', 'is_active', 'is_superuser', 'date_joined']
    list_filter = ['is_active', 'is_superuser']
    search_fields = ['email']
    ordering = ['-date_joined']

    fieldsets = (
        (None, {'fields': ('email', 'password')}),
        ('Permisos', {'fields': ('is_active', 'is_staff', 'is_superuser')}),
        ('Fechas', {'fields': ('last_login', 'date_joined')}),
    )

    add_fieldsets = (
        (None, {
            'classes': ('wide',),
            'fields': ('email', 'password1', 'password2'),
        }),
    )

    def get_queryset(self, request):
        return super().get_queryset(request).filter(role='super_admin')

    def save_model(self, request, obj, form, change):
        if not change:
            obj.role = 'super_admin'
            obj.is_staff = True
        super().save_model(request, obj, form, change)


# ============================================================
# Admin: Cuentas de Negocio (Dueños + Profesionales)
# Usamos el modelo User filtrado por roles business_owner y staff
# ============================================================

class BusinessAccount(User):
    """Proxy para cuentas de negocio (dueños y profesionales)."""
    class Meta:
        proxy = True
        verbose_name = 'Cuenta de Negocio'
        verbose_name_plural = 'Cuentas de Negocio'


@admin.register(BusinessAccount)
class BusinessAccountAdmin(admin.ModelAdmin):
    list_display = ['get_full_name', 'phone_number', 'get_role_display', 'get_business_info', 'is_active', 'get_approval_status', 'date_joined']
    list_filter = ['role', 'is_active', 'is_verified', 'date_joined']
    search_fields = ['phone_number', 'email', 'staff_profile__first_name', 'staff_profile__last_name_paterno',
                     'owner_profile__first_name', 'owner_profile__last_name_paterno']
    ordering = ['-date_joined']
    readonly_fields = ['date_joined', 'last_login']

    fieldsets = (
        ('Cuenta', {
            'fields': ('phone_number', 'email', 'role', 'password')
        }),
        ('Estado', {
            'fields': ('is_active', 'is_verified')
        }),
        ('Negocios asignados', {
            'fields': ('owned_businesses', 'managed_branches'),
            'classes': ('collapse',)
        }),
        ('Fechas', {
            'fields': ('date_joined', 'last_login')
        }),
    )

    def get_queryset(self, request):
        return super().get_queryset(request).filter(
            role__in=['business_owner', 'staff']
        ).select_related('staff_profile', 'owner_profile')

    def get_full_name(self, obj):
        if hasattr(obj, 'staff_profile') and obj.staff_profile:
            return obj.staff_profile.full_name
        if hasattr(obj, 'owner_profile') and obj.owner_profile:
            return obj.owner_profile.full_name
        return obj.phone_number or '-'
    get_full_name.short_description = 'Nombre'
    get_full_name.admin_order_field = 'staff_profile__first_name'

    def get_role_display(self, obj):
        if obj.role == 'business_owner':
            return format_html('<span style="background: #dbeafe; color: #1e40af; padding: 2px 8px; border-radius: 4px;">Dueño</span>')
        elif obj.role == 'staff':
            return format_html('<span style="background: #fef3c7; color: #92400e; padding: 2px 8px; border-radius: 4px;">Profesional</span>')
        return obj.get_role_display()
    get_role_display.short_description = 'Tipo'

    def get_business_info(self, obj):
        if obj.role == 'business_owner':
            businesses = obj.owned_businesses.all()
            if businesses:
                return ', '.join([b.name for b in businesses[:2]])
            return format_html('<span style="color: #9ca3af;">Sin negocio</span>')
        elif obj.role == 'staff':
            if hasattr(obj, 'staff_profile') and obj.staff_profile:
                branches = obj.staff_profile.branches.all()
                if branches:
                    return ', '.join([b.name for b in branches[:2]])
            return format_html('<span style="color: #f59e0b;">Sin asignar</span>')
        return '-'
    get_business_info.short_description = 'Negocio/Sucursal'

    def get_approval_status(self, obj):
        if obj.is_active:
            return format_html('<span style="color: #059669;">✓ Aprobado</span>')
        return format_html('<span style="color: #f59e0b;">⏳ Pendiente</span>')
    get_approval_status.short_description = 'Aprobación'

    def save_model(self, request, obj, form, change):
        if not change and not obj.role:
            obj.role = 'staff'
        super().save_model(request, obj, form, change)

    # Acciones masivas para aprobar/rechazar
    actions = ['approve_accounts', 'reject_accounts']

    @admin.action(description='Aprobar cuentas seleccionadas')
    def approve_accounts(self, request, queryset):
        updated = queryset.update(is_active=True)
        self.message_user(request, f'{updated} cuenta(s) aprobada(s).')

    @admin.action(description='Rechazar/Desactivar cuentas seleccionadas')
    def reject_accounts(self, request, queryset):
        updated = queryset.update(is_active=False)
        self.message_user(request, f'{updated} cuenta(s) desactivada(s).')


# ============================================================
# Admin: Perfiles de Dueños (para editar datos personales)
# ============================================================

@admin.register(BusinessOwnerProfile)
class BusinessOwnerProfileAdmin(admin.ModelAdmin):
    list_display = ['full_name', 'document_display', 'phone_number', 'get_approval_status', 'created_at']
    list_filter = ['user__is_active', 'document_type', 'created_at']
    search_fields = ['first_name', 'last_name_paterno', 'document_number', 'user__phone_number']
    ordering = ['-created_at']
    readonly_fields = ['created_at', 'updated_at']

    fieldsets = (
        ('Datos personales', {
            'fields': ('first_name', 'last_name_paterno', 'last_name_materno', 'birth_date')
        }),
        ('Documento', {
            'fields': ('document_type', 'document_number')
        }),
        ('Cuenta', {
            'fields': ('user',)
        }),
        ('Fechas', {
            'fields': ('created_at', 'updated_at')
        }),
    )

    def phone_number(self, obj):
        return obj.user.phone_number if obj.user else '-'
    phone_number.short_description = 'Teléfono'

    def get_approval_status(self, obj):
        if obj.user and obj.user.is_active:
            return format_html('<span style="color: #059669;">✓ Aprobado</span>')
        return format_html('<span style="color: #f59e0b;">⏳ Pendiente</span>')
    get_approval_status.short_description = 'Estado'


# ============================================================
# Admin: Perfiles de Profesionales (para editar datos)
# ============================================================

@admin.register(StaffMember)
class StaffMemberAdmin(admin.ModelAdmin):
    list_display = ['full_name', 'specialty', 'branches_display', 'phone_number', 'is_active', 'get_approval_status', 'created_at']
    list_filter = ['is_active', 'user__is_active', 'branches__business', 'branches', 'created_at']
    search_fields = ['first_name', 'last_name_paterno', 'document_number', 'user__phone_number', 'specialty']
    ordering = ['-created_at']
    readonly_fields = ['created_at', 'updated_at']
    filter_horizontal = ['branches']

    fieldsets = (
        ('Datos personales', {
            'fields': ('first_name', 'last_name_paterno', 'last_name_materno', 'birth_date')
        }),
        ('Documento', {
            'fields': ('document_type', 'document_number')
        }),
        ('Datos profesionales', {
            'fields': ('specialty', 'bio', 'photo')
        }),
        ('Asignación', {
            'fields': ('branches', 'is_active')
        }),
        ('Cuenta', {
            'fields': ('user', 'created_by_admin')
        }),
        ('Fechas', {
            'fields': ('created_at', 'updated_at')
        }),
    )

    def phone_number(self, obj):
        return obj.user.phone_number if obj.user else '-'
    phone_number.short_description = 'Teléfono'

    def branches_display(self, obj):
        branches = obj.branches.all()
        if branches:
            return ', '.join([f"{b.name}" for b in branches[:3]])
        return format_html('<span style="color: #f59e0b;">Sin asignar</span>')
    branches_display.short_description = 'Sucursales'

    def get_approval_status(self, obj):
        if obj.user and obj.user.is_active:
            return format_html('<span style="color: #059669;">✓ Aprobado</span>')
        return format_html('<span style="color: #f59e0b;">⏳ Pendiente</span>')
    get_approval_status.short_description = 'Aprobación'


# ============================================================
# Admin: Clientes
# ============================================================

@admin.register(Client)
class ClientAdmin(admin.ModelAdmin):
    list_display = ['full_name', 'document_display', 'phone_number', 'email', 'whatsapp_opt_in', 'created_at']
    list_filter = ['document_type', 'whatsapp_opt_in', 'created_at']
    search_fields = ['first_name', 'last_name_paterno', 'document_number', 'phone_number', 'email']
    ordering = ['-created_at']
    readonly_fields = ['created_at', 'updated_at']

    fieldsets = (
        ('Datos personales', {
            'fields': ('first_name', 'last_name_paterno', 'last_name_materno', 'birth_date')
        }),
        ('Documento', {
            'fields': ('document_type', 'document_number')
        }),
        ('Contacto', {
            'fields': ('phone_number', 'email', 'whatsapp_opt_in')
        }),
        ('Cuenta (opcional)', {
            'fields': ('user',),
            'classes': ('collapse',)
        }),
        ('Fechas', {
            'fields': ('created_at', 'updated_at')
        }),
    )


# ============================================================
# Admin: Sesiones de Login (para debugging)
# ============================================================

@admin.register(LoginSession)
class LoginSessionAdmin(admin.ModelAdmin):
    list_display = ['phone_number', 'status', 'attempts', 'created_at', 'expires_at']
    list_filter = ['status', 'created_at']
    search_fields = ['phone_number']
    ordering = ['-created_at']
    readonly_fields = ['otp_hash', 'registration_token', 'created_at', 'verified_at']
