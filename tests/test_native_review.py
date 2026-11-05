from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock

import pytest

from assistant.visual import native_review
from assistant.visual.plan import PlanError


def test_native_capture_waits_for_requested_revision_and_records_actual_audio_clock(tmp_path, monkeypatch):
    source = tmp_path / 'scene.py'
    source.write_text('native source fingerprint')
    (tmp_path / 'frame.jpg').write_bytes(b'\xff\xd8' + b'x' * 1000)
    host = Mock()
    host.jobs = {}
    host.update.side_effect = lambda sid, state: (host.jobs.update({sid: {'folder': tmp_path}}) or {'expectedRevision': 'current'})
    host.status.side_effect = [{'ready': True, 'revision': 'stale'}, {'ready': True, 'revision': 'current'}] + [{'ready': True, 'revision': 'current'}] * 3
    monkeypatch.setattr(native_review, 'NativeHost', lambda studio: host)
    monkeypatch.setattr(native_review.time, 'sleep', lambda seconds: None)
    lesson = {'nativeScenes': {'gen_test': {'source': str(source)}}, 'chapters': [{
        'renderer': 'manimgl', 'id': 'x', 'start': 0, 'end': 20, 'visualStart': 4,
        'nativeScene': 'gen_test', 'nativeOffset': 10, 'nativeDuration': 12,
        'nativeMap': [{'at': 0, 'scene': 10}, {'at': 4, 'scene': 10}, {'at': 20, 'scene': 22}]}]}
    images, labels = native_review.capture_native_frames(tmp_path, lesson)
    assert len(images) == len(labels) == 3
    assert host.status.call_count == 4
    assert all(label['revision'] == 'current' for label in labels)
    assert all(label['time'] > 4 for label in labels)
    assert host.update.call_args_list[0].args[1]['time'] == pytest.approx(11.44)
    host.close.assert_called_once()
