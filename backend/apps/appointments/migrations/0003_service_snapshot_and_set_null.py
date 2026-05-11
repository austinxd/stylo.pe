"""
Cambia Appointment.service de CASCADE a SET_NULL y agrega snapshot
(service_name_snapshot, service_duration_snapshot) para preservar el
historial financiero y operativo cuando se elimina un Service.

Backfilea el snapshot de citas existentes desde el Service vinculado.
"""
import django.db.models.deletion
from django.db import migrations, models


def backfill_snapshots(apps, schema_editor):
    Appointment = apps.get_model('appointments', 'Appointment')
    # Iterar en batches para no cargar todo en memoria si la tabla es grande
    qs = Appointment.objects.select_related('service').filter(service__isnull=False)
    batch = []
    BATCH_SIZE = 500
    for ap in qs.iterator(chunk_size=BATCH_SIZE):
        if not ap.service_name_snapshot:
            ap.service_name_snapshot = ap.service.name[:200]
        if ap.service_duration_snapshot is None:
            # total_duration es property: duration + buffers
            duration = (
                ap.service.duration_minutes
                + (ap.service.buffer_time_before or 0)
                + (ap.service.buffer_time_after or 0)
            )
            ap.service_duration_snapshot = duration
        batch.append(ap)
        if len(batch) >= BATCH_SIZE:
            Appointment.objects.bulk_update(
                batch, ['service_name_snapshot', 'service_duration_snapshot']
            )
            batch = []
    if batch:
        Appointment.objects.bulk_update(
            batch, ['service_name_snapshot', 'service_duration_snapshot']
        )


def noop_reverse(apps, schema_editor):
    """No revertimos el backfill: los snapshots son data útil aunque se vuelva al CASCADE."""
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('appointments', '0002_initial'),
        ('services', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='appointment',
            name='service_name_snapshot',
            field=models.CharField(
                blank=True,
                default='',
                max_length=200,
                verbose_name='Nombre del servicio (snapshot)',
            ),
        ),
        migrations.AddField(
            model_name='appointment',
            name='service_duration_snapshot',
            field=models.PositiveIntegerField(
                blank=True,
                null=True,
                verbose_name='Duración del servicio en minutos (snapshot)',
            ),
        ),
        migrations.RunPython(backfill_snapshots, noop_reverse),
        migrations.AlterField(
            model_name='appointment',
            name='service',
            field=models.ForeignKey(
                blank=True,
                help_text='Nullable: si el servicio es eliminado, la cita se preserva con el snapshot.',
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='appointments',
                to='services.service',
                verbose_name='Servicio',
            ),
        ),
    ]
