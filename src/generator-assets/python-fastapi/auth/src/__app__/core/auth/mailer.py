# @auth-file register|password-reset
"""E-posta: `SMTP_HOST` ayarlıysa SMTP (stdlib, thread'de), değilse log'a yazılır (geliştirme)."""

from __future__ import annotations

import asyncio
import logging
import smtplib
from email.message import EmailMessage

from __app__.core.config import settings

log = logging.getLogger(__name__)


def _send(to: str, subject: str, text: str) -> None:
    msg = EmailMessage()
    msg["From"] = settings.MAIL_FROM or settings.SMTP_USER
    msg["To"] = to
    msg["Subject"] = subject
    msg.set_content(text)
    if settings.SMTP_PORT == 465:
        with smtplib.SMTP_SSL(settings.SMTP_HOST, settings.SMTP_PORT, timeout=15) as smtp:
            if settings.SMTP_USER:
                smtp.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
            smtp.send_message(msg)
        return
    with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=15) as smtp:
        smtp.starttls()
        if settings.SMTP_USER:
            smtp.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
        smtp.send_message(msg)


async def send_mail(to: str, subject: str, text: str) -> None:
    if not settings.SMTP_HOST:
        # Konsol mailer: geliştirmede ve doğrulama betiklerinde kod buradan okunur.
        print(f"mail.console to={to} subject={subject!r} text={text!r}", flush=True)
        return
    await asyncio.to_thread(_send, to, subject, text)
