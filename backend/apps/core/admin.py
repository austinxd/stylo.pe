"""
Admin para modelos core.
"""
from django.contrib import admin
from .models import Business, Branch, BranchPhoto, BusinessCategory


class BranchPhotoInline(admin.TabularInline):
    model = BranchPhoto
    extra = 1
    fields = ['image', 'caption', 'is_cover', 'order']


@admin.register(BusinessCategory)
class BusinessCategoryAdmin(admin.ModelAdmin):
    list_display = ['name', 'slug', 'icon', 'order', 'is_active']
    list_filter = ['is_active']
    list_editable = ['order', 'is_active']
    search_fields = ['name', 'slug']
    ordering = ['order', 'name']


@admin.register(Business)
class BusinessAdmin(admin.ModelAdmin):
    list_display = ['name', 'slug', 'email', 'is_active', 'is_verified', 'created_at']
    list_filter = ['is_active', 'is_verified', 'created_at', 'categories']
    search_fields = ['name', 'email']
    prepopulated_fields = {'slug': ('name',)}
    filter_horizontal = ['categories']  # Widget para seleccionar múltiples categorías
    ordering = ['-created_at']


@admin.register(Branch)
class BranchAdmin(admin.ModelAdmin):
    list_display = ['name', 'business', 'city', 'district', 'is_active', 'created_at']
    list_filter = ['is_active', 'business', 'city']
    search_fields = ['name', 'address', 'business__name']
    ordering = ['business', 'name']
    inlines = [BranchPhotoInline]


@admin.register(BranchPhoto)
class BranchPhotoAdmin(admin.ModelAdmin):
    list_display = ['branch', 'caption', 'is_cover', 'order', 'created_at']
    list_filter = ['branch__business', 'is_cover']
    search_fields = ['branch__name', 'caption']
    ordering = ['branch', '-is_cover', 'order']
