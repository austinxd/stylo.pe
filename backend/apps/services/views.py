"""
Views para servicios (endpoints públicos).
"""
from rest_framework import viewsets
from rest_framework.permissions import AllowAny
from rest_framework.decorators import action
from rest_framework.response import Response
from django.shortcuts import get_object_or_404

from apps.core.models import Branch
from .models import Service, ServiceCategory
from .serializers import (
    ServiceSerializer,
    ServiceListSerializer,
    ServiceCategorySerializer,
    ServiceWithStaffSerializer
)


class PublicServiceViewSet(viewsets.ReadOnlyModelViewSet):
    """
    API pública para ver servicios de una sucursal.
    Acceso sin autenticación.
    """
    permission_classes = [AllowAny]
    serializer_class = ServiceListSerializer
    pagination_class = None  # Deshabilitar paginación para obtener todos los servicios

    def get_queryset(self):
        branch_id = self.kwargs.get('branch_id')
        queryset = Service.objects.filter(
            branch_id=branch_id,
            is_active=True
        ).select_related('category')

        # Filtrar por género del cliente
        # Si gender='M', mostrar servicios M (masculino) y U (unisex)
        # Si gender='F', mostrar servicios F (femenino) y U (unisex)
        gender = self.request.query_params.get('gender')
        if gender in ['M', 'F']:
            from django.db.models import Q
            queryset = queryset.filter(Q(gender=gender) | Q(gender='U'))

        return queryset.order_by('category__order', 'name')

    def get_serializer_class(self):
        if self.action == 'retrieve':
            return ServiceWithStaffSerializer
        return ServiceListSerializer

    @action(detail=False, methods=['get'])
    def categories(self, request, branch_id=None):
        """Lista las categorías de servicios de la sucursal."""
        branch = get_object_or_404(Branch, pk=branch_id, is_active=True)
        categories = ServiceCategory.objects.filter(
            business=branch.business,
            is_active=True
        ).order_by('order', 'name')
        serializer = ServiceCategorySerializer(categories, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=['get'])
    def featured(self, request, branch_id=None):
        """Lista los servicios destacados de la sucursal."""
        services = self.get_queryset().filter(is_featured=True)
        serializer = ServiceListSerializer(services, many=True)
        return Response(serializer.data)
