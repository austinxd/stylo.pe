"""
URLs para la API pública de negocios.
"""
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import PublicBusinessViewSet, BusinessCategoriesView, BranchReviewsView

router = DefaultRouter()
router.register('', PublicBusinessViewSet, basename='business')

urlpatterns = [
    path('categories/', BusinessCategoriesView.as_view(), name='business-categories'),
    path('', include(router.urls)),
]

# URLs para reviews (bajo /branches/)
branch_review_patterns = [
    path('<int:branch_id>/reviews/', BranchReviewsView.as_view(), name='branch-reviews'),
]
