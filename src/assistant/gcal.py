"""Google Calendar (read/write), built on the shared Google auth."""
from __future__ import annotations

import urllib.parse
from datetime import datetime, timedelta
from typing import Any

from .config import Config
from .google_auth import GoogleAuth, GoogleUnavailable, oauth_flow

API = "https://www.googleapis.com/calendar/v3"

# Backwards-compatible name (older imports/tests used this).
CalendarUnavailable = GoogleUnavailable
__all__ = ["GoogleCalendar", "build_calendar", "day_bounds", "oauth_flow", "CalendarUnavailable"]


class GoogleCalendar(GoogleAuth):
    def __init__(self, client_id: str, client_secret: str, refresh_token: str,
                 calendar_id: str = "primary", cache_path: str | None = None) -> None:
        super().__init__(client_id, client_secret, refresh_token, cache_path)
        self.calendar_id = calendar_id or "primary"

    def list_events(self, start: datetime, end: datetime, max_results: int = 10) -> list[dict[str, Any]]:
        data = self.request(
            "GET",
            f"{API}/calendars/{urllib.parse.quote(self.calendar_id)}/events",
            params={
                "timeMin": start.isoformat(),
                "timeMax": end.isoformat(),
                "singleEvents": "true",
                "orderBy": "startTime",
                "maxResults": str(max_results),
            },
        )
        out = []
        for item in data.get("items", []):
            start_info = item.get("start", {}) or {}
            end_info = item.get("end", {}) or {}
            out.append(
                {
                    "id": item.get("id", ""),
                    "summary": item.get("summary", "(no title)"),
                    "start": start_info.get("dateTime") or start_info.get("date", ""),
                    "end": end_info.get("dateTime") or end_info.get("date", ""),
                    "location": item.get("location", ""),
                }
            )
        return out

    def delete_event(self, event_id: str) -> None:
        self.request("DELETE", f"{API}/calendars/{urllib.parse.quote(self.calendar_id)}/events/{urllib.parse.quote(event_id)}")

    def update_event(self, event_id: str, start: datetime | None = None,
                     end: datetime | None = None, summary: str | None = None) -> dict[str, Any]:
        from .google_auth import local_tz

        body: dict[str, Any] = {}
        if summary:
            body["summary"] = summary
        if start is not None:
            if start.tzinfo is None:
                start = start.replace(tzinfo=local_tz())
            body["start"] = {"dateTime": start.isoformat()}
        if end is not None:
            if end.tzinfo is None:
                end = end.replace(tzinfo=local_tz())
            body["end"] = {"dateTime": end.isoformat()}
        return self.request(
            "PATCH",
            f"{API}/calendars/{urllib.parse.quote(self.calendar_id)}/events/{urllib.parse.quote(event_id)}",
            body=body,
        )

    def create_event(self, summary: str, start: datetime, end: datetime,
                     location: str = "", description: str = "") -> dict[str, Any]:
        from .google_auth import local_tz

        if start.tzinfo is None:
            start = start.replace(tzinfo=local_tz())
        if end.tzinfo is None:
            end = end.replace(tzinfo=local_tz())
        body: dict[str, Any] = {
            "summary": summary,
            "start": {"dateTime": start.isoformat()},
            "end": {"dateTime": end.isoformat()},
        }
        if location:
            body["location"] = location
        if description:
            body["description"] = description
        return self.request("POST", f"{API}/calendars/{urllib.parse.quote(self.calendar_id)}/events", body=body)


def _client(cfg: Config) -> tuple[str, str, str] | None:
    client_id = cfg.secret(cfg.calendar.client_id_env)
    client_secret = cfg.secret(cfg.calendar.client_secret_env)
    refresh = cfg.secret(cfg.calendar.refresh_token_env)
    if not (client_id and client_secret and refresh):
        return None
    return client_id, client_secret, refresh


def build_calendar(cfg: Config) -> GoogleCalendar | None:
    if not getattr(cfg.calendar, "enabled", False):
        return None
    creds = _client(cfg)
    if creds is None:
        return None
    client_id, client_secret, refresh = creds
    return GoogleCalendar(
        client_id=client_id,
        client_secret=client_secret,
        refresh_token=refresh,
        calendar_id=cfg.calendar.calendar_id,
        cache_path=str(cfg.config_dir / "google_token.json"),
    )


def day_bounds(day_offset: int = 0) -> tuple[datetime, datetime]:
    from .google_auth import local_tz

    now = datetime.now(local_tz())
    start = (now + timedelta(days=day_offset)).replace(hour=0, minute=0, second=0, microsecond=0)
    return start, start + timedelta(days=1)
