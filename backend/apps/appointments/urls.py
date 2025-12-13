"""
URLs para citas.
"""
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import PublicBookingViewSet, DashboardAppointmentViewSet

router = DefaultRouter()

# Reservas públicas (sin autenticación)
# POST /api/v1/appointments/booking/start/
# POST /api/v1/appointments/booking/send-otp/
# POST /api/v1/appointments/booking/verify-otp/
# POST /api/v1/appointments/booking/resend-otp/
router.register('booking', PublicBookingViewSet, basename='public-booking')

# Dashboard de citas (requiere autenticación)
router.register('dashboard', DashboardAppointmentViewSet, basename='dashboard-appointment')

urlpatterns = [
    path('', include(router.urls)),
]
