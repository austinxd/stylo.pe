"""
Views para la API pública de negocios y sucursales.
"""
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.views import APIView
from django.shortcuts import get_object_or_404
from django.db.models import Avg, Count

from .models import Business, Branch, BusinessCategory, Review, ReviewToken
from .serializers import (
    BusinessSerializer,
    BusinessListSerializer,
    BusinessPublicDetailSerializer,
    BranchSerializer,
    BranchListSerializer,
    BranchPublicDetailSerializer,
    BusinessCategorySerializer,
    ReviewSerializer,
    ReviewCreateSerializer,
    ReviewTokenInfoSerializer,
    ReviewWithTokenSerializer
)


class PublicBusinessViewSet(viewsets.ReadOnlyModelViewSet):
    """
    API pública para ver negocios.
    No requiere autenticación.

    Endpoints:
    - GET /businesses/ - Lista de negocios
    - GET /businesses/{slug}/ - Detalle de negocio con sus sucursales
    - GET /businesses/{slug}/branches/ - Sucursales del negocio
    - GET /businesses/{slug}/branches/{branch_slug}/ - Detalle de sucursal
    """
    permission_classes = [AllowAny]
    lookup_field = 'slug'

    def get_queryset(self):
        return Business.objects.filter(is_active=True).prefetch_related('branches')

    def get_serializer_class(self):
        if self.action == 'list':
            return BusinessListSerializer
        if self.action == 'retrieve':
            return BusinessPublicDetailSerializer
        return BusinessSerializer

    @action(detail=True, methods=['get'], url_path='branches')
    def branches(self, request, slug=None):
        """Lista las sucursales activas de un negocio."""
        business = self.get_object()
        branches = business.branches.filter(is_active=True).order_by('-is_main', 'name')
        serializer = BranchListSerializer(branches, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=['get'], url_path='branches/(?P<branch_slug>[^/.]+)')
    def branch_detail(self, request, slug=None, branch_slug=None):
        """Detalle de una sucursal específica por slug."""
        business = self.get_object()
        branch = get_object_or_404(
            business.branches.filter(is_active=True),
            slug=branch_slug
        )
        serializer = BranchPublicDetailSerializer(branch)
        return Response(serializer.data)


class PublicBranchViewSet(viewsets.ReadOnlyModelViewSet):
    """
    API pública para ver sucursales directamente.
    Útil para búsquedas por ubicación.
    """
    permission_classes = [AllowAny]
    serializer_class = BranchListSerializer

    def get_queryset(self):
        queryset = Branch.objects.filter(
            is_active=True,
            business__is_active=True
        ).select_related('business')

        # Filtrar por ciudad
        city = self.request.query_params.get('city')
        if city:
            queryset = queryset.filter(city__icontains=city)

        # Filtrar por distrito
        district = self.request.query_params.get('district')
        if district:
            queryset = queryset.filter(district__icontains=district)

        # Filtrar por cercanía (si se proveen lat/lng)
        lat = self.request.query_params.get('lat')
        lng = self.request.query_params.get('lng')
        if lat and lng:
            # Por ahora solo filtrar las que tienen coordenadas
            # TODO: Implementar ordenamiento por distancia
            queryset = queryset.filter(
                latitude__isnull=False,
                longitude__isnull=False
            )

        return queryset.order_by('business__name', '-is_main')


class BusinessCategoriesView(APIView):
    """
    API pública para obtener las categorías de negocios disponibles.
    GET /categories/ - Lista todas las categorías activas
    """
    permission_classes = [AllowAny]

    def get(self, request):
        categories = BusinessCategory.objects.filter(is_active=True).order_by('order', 'name')
        serializer = BusinessCategorySerializer(categories, many=True)
        return Response(serializer.data)


class BranchReviewsView(APIView):
    """
    API para reseñas de sucursales.
    GET /branches/{id}/reviews/ - Lista reseñas aprobadas de una sucursal
    POST /branches/{id}/reviews/ - Crear una reseña (requiere autenticación)
    """

    def get_permissions(self):
        if self.request.method == 'POST':
            return [IsAuthenticated()]
        return [AllowAny()]

    def get(self, request, branch_id):
        """Lista las reseñas aprobadas de una sucursal con estadísticas."""
        branch = get_object_or_404(Branch, pk=branch_id, is_active=True)
        reviews = branch.reviews.filter(is_approved=True).order_by('-created_at')

        # Calcular estadísticas
        stats = reviews.aggregate(
            average=Avg('rating'),
            total=Count('id')
        )

        # Distribución por estrellas
        distribution = {}
        for i in range(1, 6):
            count = reviews.filter(rating=i).count()
            distribution[i] = count

        serializer = ReviewSerializer(reviews[:20], many=True)  # Limitar a 20 reseñas

        return Response({
            'average_rating': round(stats['average'], 1) if stats['average'] else None,
            'total_reviews': stats['total'],
            'rating_distribution': distribution,
            'reviews': serializer.data
        })

    def post(self, request, branch_id):
        """Crear una nueva reseña para una sucursal."""
        branch = get_object_or_404(Branch, pk=branch_id, is_active=True)

        # Verificar si el usuario ya tiene una reseña para esta sucursal
        if hasattr(request.user, 'client'):
            existing_review = Review.objects.filter(
                branch=branch,
                client=request.user.client,
                appointment__isnull=True  # Solo si no es una reseña por cita
            ).exists()
            if existing_review:
                return Response(
                    {'error': 'Ya has dejado una reseña para esta sucursal.'},
                    status=status.HTTP_400_BAD_REQUEST
                )

        data = request.data.copy()
        data['branch'] = branch.id

        serializer = ReviewCreateSerializer(data=data, context={'request': request})
        if serializer.is_valid():
            serializer.save()
            return Response(
                ReviewSerializer(serializer.instance).data,
                status=status.HTTP_201_CREATED
            )
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class ReviewWithTokenView(APIView):
    """
    API para crear reseñas usando un token único (sin autenticación).
    El token se envía por WhatsApp después de completar una cita.

    GET /reviews/token/{token}/ - Obtener información de la cita para mostrar en el form
    POST /reviews/token/{token}/ - Crear reseña usando el token
    """
    permission_classes = [AllowAny]

    def get(self, request, token):
        """
        Obtiene información del token para mostrar en el formulario de reseña.
        """
        review_token = get_object_or_404(ReviewToken, token=token)

        # Verificar si el token ya fue usado o expiró
        if not review_token.is_valid():
            if review_token.is_used:
                return Response(
                    {'error': 'Ya dejaste una reseña para esta cita.', 'code': 'already_used'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            return Response(
                {'error': 'El enlace ha expirado.', 'code': 'expired'},
                status=status.HTTP_400_BAD_REQUEST
            )

        serializer = ReviewTokenInfoSerializer(review_token)
        return Response(serializer.data)

    def post(self, request, token):
        """
        Crea una reseña usando el token único.
        No requiere autenticación - el token valida la identidad.
        """
        review_token = get_object_or_404(ReviewToken, token=token)

        # Verificar si el token es válido
        if not review_token.is_valid():
            if review_token.is_used:
                return Response(
                    {'error': 'Ya dejaste una reseña para esta cita.'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            return Response(
                {'error': 'El enlace ha expirado.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Verificar que la cita no tenga ya una reseña
        appointment = review_token.appointment
        if hasattr(appointment, 'review') and appointment.review:
            return Response(
                {'error': 'Esta cita ya tiene una reseña.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Crear la reseña
        serializer = ReviewWithTokenSerializer(
            data=request.data,
            context={'review_token': review_token}
        )

        if serializer.is_valid():
            review = serializer.save()
            # Marcar el token como usado
            review_token.mark_as_used()

            return Response({
                'success': True,
                'message': 'Gracias por tu reseña!',
                'review': ReviewSerializer(review).data
            }, status=status.HTTP_201_CREATED)

        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
