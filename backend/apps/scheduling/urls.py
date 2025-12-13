"""
URLs para scheduling.
"""
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import AvailabilityView, MonthAvailabilityView
from apps.services.views import PublicServiceViewSet
from apps.core.views import BranchReviewsView

# Router para servicios anidados bajo branch
services_router = DefaultRouter()
services_router.register('services', PublicServiceViewSet, basename='branch-services')

urlpatterns = [
    path('<int:branch_id>/availability', AvailabilityView.as_view(), name='availability'),
    path('<int:branch_id>/availability/month', MonthAvailabilityView.as_view(), name='month-availability'),
    path('<int:branch_id>/', include(services_router.urls)),
    # Reviews de sucursales
    path('<int:branch_id>/reviews/', BranchReviewsView.as_view(), name='branch-reviews'),
]
