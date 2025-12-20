"""
Management command para enviar recordatorios de citas por WhatsApp.
Ejecutar cada hora via cron:
0 * * * * cd /srv/stylo.pe/backend && source venv/bin/activate && python manage.py send_reminders >> /var/log/stylo/reminders.log 2>&1
"""
from django.core.management.base import BaseCommand
from django.utils import timezone
from django.utils.timezone import localtime

from apps.appointments.models import Appointment, AppointmentReminder
from apps.accounts.services.whatsapp_service import WhatsAppService


class Command(BaseCommand):
    help = 'Envía recordatorios de citas pendientes por WhatsApp'

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Solo mostrar qué se enviaría, sin enviar',
        )

    def handle(self, *args, **options):
        dry_run = options['dry_run']
        now = timezone.now()

        self.stdout.write(f"\n{'='*60}")
        self.stdout.write(f"[{now.strftime('%Y-%m-%d %H:%M:%S')}] Iniciando envío de recordatorios")
        self.stdout.write(f"{'='*60}\n")

        # Buscar recordatorios pendientes cuya hora ya pasó
        reminders = AppointmentReminder.objects.filter(
            status='pending',
            scheduled_at__lte=now,
            reminder_type='whatsapp'
        ).select_related(
            'appointment',
            'appointment__client',
            'appointment__staff',
            'appointment__service',
            'appointment__branch',
            'appointment__branch__business'
        )

        total = reminders.count()
        sent = 0
        skipped = 0
        failed = 0

        if total == 0:
            self.stdout.write(self.style.SUCCESS("No hay recordatorios pendientes."))
            return

        self.stdout.write(f"Encontrados {total} recordatorios pendientes.\n")

        whatsapp = WhatsAppService()

        for reminder in reminders:
            appointment = reminder.appointment

            # Saltar si la cita fue cancelada o ya pasó
            if appointment.status in ['cancelled', 'no_show', 'completed']:
                reminder.status = 'cancelled'
                reminder.save(update_fields=['status'])
                skipped += 1
                self.stdout.write(
                    f"  SALTADO: Cita #{appointment.id} - estado: {appointment.status}"
                )
                continue

            # Saltar si la cita ya pasó
            if appointment.start_datetime < now:
                reminder.status = 'cancelled'
                reminder.save(update_fields=['status'])
                skipped += 1
                self.stdout.write(
                    f"  SALTADO: Cita #{appointment.id} - ya pasó"
                )
                continue

            # Preparar datos del mensaje
            client = appointment.client
            phone_number = client.phone_number
            client_name = client.first_name
            service_name = appointment.service.name
            branch_name = appointment.branch.name

            # Formatear fecha/hora en zona local
            local_datetime = localtime(appointment.start_datetime)
            datetime_str = local_datetime.strftime('%d/%m/%Y a las %H:%M')

            if dry_run:
                self.stdout.write(
                    f"  [DRY-RUN] Enviaría a {phone_number}: "
                    f"Cita de {client_name} para {service_name} el {datetime_str}"
                )
                sent += 1
                continue

            # Enviar recordatorio
            try:
                result = whatsapp.send_appointment_reminder(
                    phone_number=phone_number,
                    client_name=client_name,
                    service_name=service_name,
                    datetime_str=datetime_str,
                    branch_name=branch_name
                )

                if result.get('success'):
                    reminder.status = 'sent'
                    reminder.sent_at = now
                    reminder.save(update_fields=['status', 'sent_at'])
                    sent += 1
                    self.stdout.write(
                        self.style.SUCCESS(
                            f"  ENVIADO: {phone_number} - {client_name} - {service_name}"
                        )
                    )
                else:
                    reminder.status = 'failed'
                    reminder.save(update_fields=['status'])
                    failed += 1
                    self.stdout.write(
                        self.style.ERROR(
                            f"  FALLIDO: {phone_number} - Error: {result.get('error')}"
                        )
                    )

            except Exception as e:
                reminder.status = 'failed'
                reminder.save(update_fields=['status'])
                failed += 1
                self.stdout.write(
                    self.style.ERROR(f"  ERROR: {phone_number} - {str(e)}")
                )

        # Resumen
        self.stdout.write(f"\n{'='*60}")
        self.stdout.write("RESUMEN:")
        self.stdout.write(f"  Total procesados: {total}")
        self.stdout.write(self.style.SUCCESS(f"  Enviados: {sent}"))
        self.stdout.write(f"  Saltados: {skipped}")
        if failed:
            self.stdout.write(self.style.ERROR(f"  Fallidos: {failed}"))
        self.stdout.write(f"{'='*60}\n")
