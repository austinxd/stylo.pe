"""
URLs para servicios.
"""
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import PublicServiceViewSet

router = DefaultRouter()
router.register('', PublicServiceViewSet, basename='service')

urlpatterns = [
    path('', include(router.urls)),
]
