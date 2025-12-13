"""
URL configuration para Stylo.
"""
from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static
from apps.core.views import ReviewWithTokenView

urlpatterns = [
    path('admin/', admin.site.urls),

    # API v1
    path('api/v1/auth/', include('apps.accounts.urls.auth')),
    path('api/v1/businesses/', include('apps.core.urls')),
    path('api/v1/branches/', include('apps.scheduling.urls')),
    path('api/v1/appointments/', include('apps.appointments.urls')),
    path('api/v1/dashboard/', include('apps.dashboard.urls')),
    path('api/v1/', include('apps.subscriptions.urls')),

    # Reseñas con token (público, sin autenticación)
    path('api/v1/reviews/token/<str:token>/', ReviewWithTokenView.as_view(), name='review-with-token'),
]

# Debug toolbar
if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
    try:
        import debug_toolbar
        urlpatterns = [path('__debug__/', include(debug_toolbar.urls))] + urlpatterns
    except ImportError:
        pass
