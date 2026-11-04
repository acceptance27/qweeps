"""Android entry point; import QWEEPS only after app-private paths are configured."""
import json
import os
import shutil
from pathlib import Path
import threading

_lock = threading.RLock()
_server = None
_service = None
_error = None


def start(files_dir, studio_dir, port=4174):
    global _server, _service, _error
    with _lock:
        if _server is not None:
            return
        os.environ['HOME'] = str(files_dir)
        os.environ['QWEEPS_PLATFORM'] = 'android'
        os.environ['QWEEPS_STUDIO_DIR'] = str(studio_dir)
        from assistant.config import load_config
        from assistant.llm import build_visual_llm, ModelProviderError
        from assistant.visual.server import VisualService, create_server
        cfg = load_config()
        oc_key = cfg.secret("OPENCODE_API_KEY")
        if oc_key:
            os.environ["OPENCODE_API_KEY"] = oc_key
        or_key = cfg.secret("OPENROUTER_API_KEY")
        if or_key:
            os.environ["OPENROUTER_API_KEY"] = or_key
        try:
            build_visual_llm(cfg)
        except ModelProviderError:
            cfg.llm.enabled = False
        # Browser narration uses remote audio; desktop speech/ffmpeg is optional.
        if cfg.tts.provider != 'openrouter' or not cfg.secret(cfg.tts.api_key_env):
            cfg.tts.provider = 'none'
        try:
            _service = VisualService(cfg=cfg)
            # Seed the shipped examples and narration without overwriting user data.
            bundled = Path(studio_dir) / 'bundled-lessons'
            for source_root, target_root in ((bundled / 'browser-lessons', _service.live.folder),
                                             (bundled / 'visual-narration', _service.narration.folder)):
                for source in source_root.rglob('*'):
                    if source.is_file():
                        target = target_root / source.relative_to(source_root)
                        if not target.exists():
                            target.parent.mkdir(parents=True, exist_ok=True)
                            shutil.copyfile(source, target)
            _server = create_server(port=port, studio_dir=Path(studio_dir), service=_service)
            threading.Thread(target=_server.serve_forever, name='qweeps-http', daemon=True).start()
            _error = None
        except Exception as exc:
            _error = str(exc)
            _service = None
            raise


def status():
    with _lock:
        if _service is None:
            return json.dumps({'ready': False, 'active': 0, 'stage': _error or 'Starting Python'})
        with _service.live.lock:
            jobs = list(_service.live.jobs.values())
        active = [job for job in jobs if job.get('status') not in {'ready', 'failed', 'cancelled'}]
        review = any(job.get('status') == 'awaiting_review' for job in jobs)
        return json.dumps({'ready': _server is not None, 'active': len(active) + _service.active_requests,
                           'working': sum(job.get('status') != 'awaiting_review' for job in active) + _service.active_requests,
                           'stage': active[-1].get('stage', 'Generating lesson') if active else
                                    'Generating with your configured AI provider' if _service.active_requests else
                                    'Open QWEEPS to review the lesson' if review else 'Ready'})


def stop(reason='Android stopped the background service'):
    global _server, _service
    with _lock:
        server, service = _server, _service
        _server = None
        _service = None
    if service is not None:
        for job in list(service.live.jobs.values()):
            if job.get('status') not in {'ready', 'failed', 'cancelled'}:
                job.update(status='failed', stage='Interrupted', error=reason)
    if server is not None:
        server.shutdown()
        server.server_close()
