from __future__ import annotations

import shutil
import subprocess


def send(title: str, body: str = "", icon: str = "dialog-information") -> bool:
    if shutil.which("notify-send"):
        command = ["notify-send", "-i", icon, title]
        if body:
            command.append(body)
        try:
            subprocess.run(command, check=False, timeout=10)
            return True
        except (OSError, subprocess.TimeoutExpired):
            return False
    if shutil.which("omarchy"):
        try:
            subprocess.run(
                ["omarchy", "notification", "send", title, body],
                check=False,
                timeout=10,
            )
            return True
        except (OSError, subprocess.TimeoutExpired):
            return False
    return False
