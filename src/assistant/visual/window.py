"""Target only the studio's own Chromium app window on Hyprland 0.55+."""
import json
import re
import shutil
import subprocess


def desktop_window(session_id: str, close: bool = False) -> bool:
    if not re.fullmatch(r"[0-9a-f]{32}", session_id) or not shutil.which("hyprctl"):
        return False
    try:
        result = subprocess.run(["hyprctl", "-j", "clients"], capture_output=True, text=True, timeout=3)
        for client in json.loads(result.stdout):
            classes = {str(client.get("class", "")).lower(), str(client.get("initialClass", "")).lower()}
            address = client.get("address", "")
            # Chromium's Wayland app ID can ignore --class; its --app window
            # still has a distinct origin-based class rather than a browser class.
            app_class = "qweeps-visual" in classes or any(
                re.fullmatch(r"(?:chrome|brave|msedge)-127\.0\.0\.1__-.+", name) for name in classes)
            if (not app_class or client.get("title") != f"QWEEPS Visual {session_id}"
                    or not re.fullmatch(r"0x[0-9a-fA-F]+", address)):
                continue
            target = f'window = "address:{address}"'
            expression = f"hl.dsp.window.close({{ {target} }})" if close else f'hl.dsp.window.set_prop({{ prop = "border_size", value = "0", {target} }})'
            completed = subprocess.run(["hyprctl", "dispatch", expression], capture_output=True, text=True, timeout=3)
            return completed.returncode == 0 and completed.stdout.strip() == "ok"
    except (OSError, ValueError, subprocess.TimeoutExpired, TypeError):
        pass
    return False
