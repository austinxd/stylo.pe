"""
Servicios de negocio del dashboard.

Extrae la lógica compleja de cálculo de estadísticas mensuales de la view
para que sea testeable, reutilizable y separada de la capa HTTP.
"""
from __future__ import annotations

from calendar import monthrange
from datetime import datetime
from typing import TYPE_CHECKING, TypedDict

from django.db.models import Avg, Count, Sum
from django.utils import timezone

from apps.accounts.models import Client
from apps.appointments.models import Appointment
from common.scoping import branch_ids_for

if TYPE_CHECKING:
    from apps.accounts.models import User


class MonthlyStats(TypedDict):
    period: dict
    overview: dict
    efficiency: dict
    comparison: dict
    charts: dict
    rankings: dict


# Estados que cuentan para "gráfica" y rankings: la actividad real del negocio.
# Excluye cancelled y no_show porque distorsionan la lectura.
ACTIVE_STATUSES = ['completed', 'confirmed', 'in_progress']


def _month_range(year: int, month: int) -> tuple[datetime, datetime]:
    """Retorna (primer_dia_00:00, ultimo_dia_23:59:59) timezone-aware."""
    first = timezone.make_aware(datetime(year, month, 1, 0, 0, 0))
    last_num = monthrange(year, month)[1]
    last = timezone.make_aware(datetime(year, month, last_num, 23, 59, 59))
    return first, last


def _prev_month(year: int, month: int) -> tuple[int, int]:
    if month == 1:
        return year - 1, 12
    return year, month - 1


def _safe_pct_change(current: float, previous: float) -> float:
    """% de cambio. 0 si previous es 0 (evita división por cero)."""
    if not previous:
        return 0.0
    return ((current - previous) / previous) * 100


def parse_month_param(value: str | None) -> tuple[int, int]:
    """Parsea 'YYYY-MM' o cae a mes actual si es inválido/ausente."""
    now = timezone.now()
    if not value:
        return now.year, now.month
    try:
        year, month = map(int, value.split('-'))
        if not 1 <= month <= 12:
            raise ValueError
        return year, month
    except (ValueError, AttributeError):
        return now.year, now.month


def compute_monthly_stats(user: 'User', year: int, month: int) -> MonthlyStats:
    """
    Computa todas las métricas del dashboard para un mes específico,
    filtradas al alcance multi-tenant del usuario.

    Estructura de retorno coincide con el contrato anterior del view
    para mantener compatibilidad con el frontend.
    """
    first_day, last_day = _month_range(year, month)
    prev_year, prev_month = _prev_month(year, month)
    prev_first_day, prev_last_day = _month_range(prev_year, prev_month)

    # Scoping: si la lista es None significa "sin restricción" (super_admin)
    scoped_branch_ids = branch_ids_for(user)

    appointments_qs = Appointment.objects.filter(
        start_datetime__gte=first_day,
        start_datetime__lte=last_day,
    )
    prev_appointments_qs = Appointment.objects.filter(
        start_datetime__gte=prev_first_day,
        start_datetime__lte=prev_last_day,
    )
    if scoped_branch_ids is not None:
        appointments_qs = appointments_qs.filter(branch_id__in=scoped_branch_ids)
        prev_appointments_qs = prev_appointments_qs.filter(
            branch_id__in=scoped_branch_ids
        )

    overview = _compute_overview(appointments_qs, first_day, last_day)
    prev_overview = _compute_overview(prev_appointments_qs, prev_first_day, prev_last_day)

    total = overview['total_appointments']
    efficiency = {
        'completion_rate': round(_safe_pct_rate(overview['completed_appointments'], total), 1),
        'cancellation_rate': round(_safe_pct_rate(overview['cancelled_appointments'], total), 1),
        'no_show_rate': round(_safe_pct_rate(overview['no_shows'], total), 1),
    }

    comparison = {
        'appointments_change': round(
            _safe_pct_change(total, prev_overview['total_appointments']), 1
        ),
        'revenue_change': round(
            _safe_pct_change(overview['revenue'], prev_overview['revenue']), 1
        ),
        'prev_appointments': prev_overview['total_appointments'],
        'prev_revenue': prev_overview['revenue'],
    }

    charts = _compute_daily_charts(appointments_qs)
    rankings = _compute_rankings(appointments_qs)

    return {
        'period': {
            'year': year,
            'month': month,
            'month_name': first_day.strftime('%B'),
            'start_date': first_day.date().isoformat(),
            'end_date': last_day.date().isoformat(),
        },
        'overview': overview,
        'efficiency': efficiency,
        'comparison': comparison,
        'charts': charts,
        'rankings': rankings,
    }


def _safe_pct_rate(numerator: int, denominator: int) -> float:
    if denominator == 0:
        return 0.0
    return (numerator / denominator) * 100


def _compute_overview(qs, first_day: datetime, last_day: datetime) -> dict:
    total = qs.count()
    completed = qs.filter(status='completed').count()
    cancelled = qs.filter(status='cancelled').count()
    no_shows = qs.filter(status='no_show').count()
    revenue = qs.filter(status='completed').aggregate(t=Sum('price'))['t'] or 0
    expected = qs.filter(status__in=ACTIVE_STATUSES).aggregate(t=Sum('price'))['t'] or 0
    avg_ticket = qs.filter(status='completed').aggregate(a=Avg('price'))['a'] or 0
    new_clients = Client.objects.filter(
        created_at__gte=first_day,
        created_at__lte=last_day,
    ).count()

    return {
        'total_appointments': total,
        'completed_appointments': completed,
        'cancelled_appointments': cancelled,
        'no_shows': no_shows,
        'new_clients': new_clients,
        'revenue': float(revenue),
        'expected_revenue': float(expected),
        'avg_ticket': round(float(avg_ticket), 2),
    }


def _compute_daily_charts(qs) -> dict:
    """
    Agrupa citas activas por día.

    NOTA de performance: usa agrupación en Python para evitar problemas
    históricos con TruncDate + MySQL/timezone. Si la tabla crece y esto
    se vuelve cuello de botella, migrar a:
        qs.annotate(d=TruncDate('start_datetime', tzinfo=...))
          .values('d').annotate(c=Count(), s=Sum('price'))
    """
    rows = qs.filter(status__in=ACTIVE_STATUSES).values('start_datetime', 'price')

    daily: dict[str, dict] = {}
    for row in rows:
        dt = row.get('start_datetime')
        if not dt:
            continue
        key = dt.date().isoformat()
        bucket = daily.setdefault(key, {'count': 0, 'revenue': 0.0})
        bucket['count'] += 1
        bucket['revenue'] += float(row.get('price') or 0)

    daily_appointments = []
    daily_revenue = []
    for key in sorted(daily.keys()):
        bucket = daily[key]
        daily_appointments.append({'date': key, 'count': bucket['count']})
        daily_revenue.append({'date': key, 'amount': bucket['revenue']})

    return {
        'daily_appointments': daily_appointments,
        'daily_revenue': daily_revenue,
    }


def _compute_rankings(qs) -> dict:
    active_qs = qs.filter(status__in=ACTIVE_STATUSES)

    popular = (
        active_qs.values('service__id', 'service__name')
        .annotate(count=Count('id'), revenue=Sum('price'))
        .order_by('-count')[:5]
    )
    top_staff = (
        active_qs.values('staff__id', 'staff__first_name', 'staff__last_name_paterno')
        .annotate(appointments=Count('id'), revenue=Sum('price'))
        .order_by('-appointments')[:5]
    )

    return {
        'popular_services': [
            {
                'id': row['service__id'],
                'name': row['service__name'] or 'Servicio eliminado',
                'count': row['count'],
                'revenue': float(row['revenue'] or 0),
            }
            for row in popular
        ],
        'top_staff': [
            {
                'id': row['staff__id'],
                'name': f"{row['staff__first_name']} {row['staff__last_name_paterno'] or ''}".strip(),
                'appointments': row['appointments'],
                'revenue': float(row['revenue'] or 0),
            }
            for row in top_staff
        ],
    }
