"""
URLs para el módulo de suscripciones.
"""
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import SubscriptionViewSet
from .webhooks import culqi_webhook

router = DefaultRouter()
router.register(r'subscription', SubscriptionViewSet, basename='subscription')

urlpatterns = [
    path('webhooks/culqi/', culqi_webhook, name='culqi-webhook'),
    path('', include(router.urls)),
]
