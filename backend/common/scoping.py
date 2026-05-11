"""
Scoping multi-tenant centralizado.

Provee helpers consistentes para filtrar querysets según el rol del usuario:
- super_admin: ve todo
- business_owner: ve recursos de sus negocios
- branch_manager: ve recursos de sus sucursales gestionadas
- staff: ve sus propios recursos
- otros: nada

Antes esta lógica estaba duplicada en cada ViewSet del dashboard
(get_queryset). Centralizarla:
1. Reduce errores de copy-paste (IDOR latente)
2. Hace explícito el contrato de tenant scoping
3. Permite añadir nuevos roles sin tocar cada ViewSet
"""
from __future__ import annotations

from typing import TYPE_CHECKING

from django.db.models import QuerySet

if TYPE_CHECKING:
    from apps.accounts.models import User
    from apps.appointments.models import Appointment
    from apps.core.models import Branch
    from apps.accounts.models import StaffMember
    from apps.services.models import Service


def business_ids_for(user: 'User') -> list[int] | None:
    """
    Retorna los IDs de negocios accesibles para el usuario.

    - None: sin restricción (super_admin ve todo)
    - []: usuario sin acceso a ningún negocio
    - [ids…]: lista explícita
    """
    if user.role == 'super_admin':
        return None
    if user.role == 'business_owner':
        return list(user.owned_businesses.values_list('id', flat=True))
    if user.role == 'branch_manager':
        return list(user.managed_branches.values_list('business_id', flat=True).distinct())
    if user.role == 'staff' and hasattr(user, 'staff_profile'):
        # Staff puede pertenecer a un solo negocio activo
        bid = user.staff_profile.current_business_id
        return [bid] if bid else []
    return []


def branch_ids_for(user: 'User') -> list[int] | None:
    """
    Retorna los IDs de sucursales accesibles para el usuario.

    - None: sin restricción (super_admin)
    - [ids…]: explícita (business_owner ve todas las de sus negocios;
              branch_manager sólo las que gestiona;
              staff las que tiene asignadas)
    """
    if user.role == 'super_admin':
        return None
    if user.role == 'business_owner':
        from apps.core.models import Branch
        return list(
            Branch.objects.filter(
                business_id__in=user.owned_businesses.values_list('id', flat=True),
            ).values_list('id', flat=True)
        )
    if user.role == 'branch_manager':
        return list(user.managed_branches.values_list('id', flat=True))
    if user.role == 'staff' and hasattr(user, 'staff_profile'):
        return list(user.staff_profile.branches.values_list('id', flat=True))
    return []


def scope_branches(qs: QuerySet['Branch'], user: 'User') -> QuerySet['Branch']:
    """Filtra un queryset de Branch al alcance del usuario."""
    business_ids = business_ids_for(user)
    if business_ids is None:
        return qs
    if not business_ids:
        return qs.none()
    branch_ids = branch_ids_for(user)
    if branch_ids is None:
        return qs.filter(business_id__in=business_ids)
    if not branch_ids:
        return qs.none()
    # Branch manager: sólo las que gestiona; owner: todas las de sus negocios
    if user.role == 'branch_manager':
        return qs.filter(id__in=branch_ids)
    return qs.filter(business_id__in=business_ids)


def scope_staff(qs: QuerySet['StaffMember'], user: 'User') -> QuerySet['StaffMember']:
    """Filtra un queryset de StaffMember al alcance del usuario."""
    business_ids = business_ids_for(user)
    if business_ids is None:
        return qs
    if not business_ids:
        return qs.none()

    if user.role == 'branch_manager':
        return qs.filter(branches__in=user.managed_branches.all()).distinct()

    if user.role == 'staff' and hasattr(user, 'staff_profile'):
        return qs.filter(pk=user.staff_profile.pk)

    return qs.filter(branches__business_id__in=business_ids).distinct()


def scope_services(qs: QuerySet['Service'], user: 'User') -> QuerySet['Service']:
    """Filtra un queryset de Service al alcance del usuario."""
    branch_ids = branch_ids_for(user)
    if branch_ids is None:
        return qs
    if not branch_ids:
        return qs.none()
    return qs.filter(branch_id__in=branch_ids)


def scope_appointments(qs: QuerySet['Appointment'], user: 'User') -> QuerySet['Appointment']:
    """Filtra un queryset de Appointment al alcance del usuario."""
    if user.role == 'super_admin':
        return qs
    if user.role == 'staff' and hasattr(user, 'staff_profile'):
        return qs.filter(staff=user.staff_profile)
    branch_ids = branch_ids_for(user)
    if branch_ids is None:
        return qs
    if not branch_ids:
        return qs.none()
    return qs.filter(branch_id__in=branch_ids)


def primary_business_for(user: 'User'):
    """
    Retorna el negocio "primario" del usuario, útil para vistas que
    asumen un solo negocio (ej: creación de Branch, suscripciones).

    - business_owner: primer owned_business
    - branch_manager: business de la primera managed_branch
    - staff: current_business
    - otros: None
    """
    if user.role == 'business_owner':
        return user.owned_businesses.first()
    if user.role == 'branch_manager':
        branch = user.managed_branches.first()
        return branch.business if branch else None
    if user.role == 'staff' and hasattr(user, 'staff_profile'):
        return user.staff_profile.current_business
    return None
