"""
Permisos personalizados para la API.
"""
from rest_framework import permissions


class IsSuperAdmin(permissions.BasePermission):
    """Permite acceso solo a super administradores."""

    def has_permission(self, request, view):
        return (
            request.user and
            request.user.is_authenticated and
            request.user.role == 'super_admin'
        )


class IsBusinessOwner(permissions.BasePermission):
    """Permite acceso a dueños de negocio."""

    def has_permission(self, request, view):
        return (
            request.user and
            request.user.is_authenticated and
            request.user.role in ['super_admin', 'business_owner']
        )


class IsBranchManager(permissions.BasePermission):
    """Permite acceso a administradores de sucursal."""

    def has_permission(self, request, view):
        return (
            request.user and
            request.user.is_authenticated and
            request.user.role in ['super_admin', 'business_owner', 'branch_manager']
        )


class IsStaff(permissions.BasePermission):
    """Permite acceso a profesionales (staff)."""

    def has_permission(self, request, view):
        return (
            request.user and
            request.user.is_authenticated and
            request.user.role in ['super_admin', 'business_owner', 'branch_manager', 'staff']
        )


class IsClient(permissions.BasePermission):
    """Permite acceso a clientes."""

    def has_permission(self, request, view):
        return (
            request.user and
            request.user.is_authenticated and
            request.user.role == 'client'
        )


class IsOwnerOrReadOnly(permissions.BasePermission):
    """
    Permite lectura a todos, pero solo el propietario puede modificar.
    Requiere que el objeto tenga un atributo 'user' o 'client'.
    """

    def has_object_permission(self, request, view, obj):
        if request.method in permissions.SAFE_METHODS:
            return True

        # Verificar propiedad
        if hasattr(obj, 'user'):
            return obj.user == request.user
        if hasattr(obj, 'client') and hasattr(obj.client, 'user'):
            return obj.client.user == request.user

        return False


class BelongsToBusiness(permissions.BasePermission):
    """
    Verifica que el usuario pertenece al negocio del recurso.
    """

    def has_object_permission(self, request, view, obj):
        user = request.user

        if user.role == 'super_admin':
            return True

        # Obtener el business del objeto
        business = None
        if hasattr(obj, 'business'):
            business = obj.business
        elif hasattr(obj, 'branch'):
            business = obj.branch.business
        elif hasattr(obj, 'staff') and hasattr(obj.staff, 'branch'):
            business = obj.staff.branch.business

        if not business:
            return False

        # Verificar que el usuario pertenece al negocio
        if user.role == 'business_owner':
            return hasattr(user, 'owned_businesses') and business in user.owned_businesses.all()

        if user.role == 'branch_manager':
            return hasattr(user, 'managed_branches') and any(
                branch.business == business for branch in user.managed_branches.all()
            )

        if user.role == 'staff':
            return hasattr(user, 'staff_profile') and user.staff_profile.branch.business == business

        return False
