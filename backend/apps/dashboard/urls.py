"""
URLs para el dashboard.
"""
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    MyBusinessView,
    DashboardSummaryView,
    DashboardStatsView,
    DashboardBranchViewSet,
    DashboardStaffViewSet,
    DashboardServiceViewSet,
    DashboardAppointmentViewSet,
    OnboardingView,
    OnboardingCompleteView
)

router = DefaultRouter()
router.register('branches', DashboardBranchViewSet, basename='dashboard-branch')
router.register('staff', DashboardStaffViewSet, basename='dashboard-staff')
router.register('services', DashboardServiceViewSet, basename='dashboard-service')
router.register('appointments', DashboardAppointmentViewSet, basename='dashboard-appointment')

urlpatterns = [
    path('my-business/', MyBusinessView.as_view(), name='dashboard-my-business'),
    path('summary/', DashboardSummaryView.as_view(), name='dashboard-summary'),
    path('stats/', DashboardStatsView.as_view(), name='dashboard-stats'),
    path('onboarding/', OnboardingView.as_view(), name='dashboard-onboarding'),
    path('onboarding/complete/', OnboardingCompleteView.as_view(), name='dashboard-onboarding-complete'),
    path('', include(router.urls)),
]
