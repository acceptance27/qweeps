import importlib.util
from pathlib import Path

from assistant.visual.browser_gate import composition, validate_svg

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("hyperframes_check", ROOT / "bench/hyperframes_check.py")
module = importlib.util.module_from_spec(spec)
assert spec.loader
spec.loader.exec_module(module)


def test_extract_svg_keeps_nested_artwork():
    html = (
        '<div><svg class="live-stage-svg" viewBox="0 0 1440 600">'
        '<svg width="10" height="10"><circle cx="5" cy="5" r="4"/></svg>'
        '<text>Input x1</text></svg></div>'
    )
    svg = module.extract_svg(html)
    assert svg.startswith('<svg class="live-stage-svg"')
    assert svg.count("<svg") == 2
    assert svg.count("</svg>") == 2
    assert "Input x1" in svg


def test_composition_is_a_static_hyperframes_document():
    html = composition('<svg class="live-stage-svg"><style>@font-face{font-family:QweepsTeachingSerif;src:url("/live/teaching-serif.ttf") format("truetype")}</style><text>x</text></svg>')
    assert 'data-composition-id="lesson-check"' in html
    assert 'data-no-timeline' in html
    assert 'data-width="1440"' in html
    assert 'data:font/ttf;base64,' in html
    assert 'width="1440" height="600"' in html


def test_browser_gate_rejects_executable_markup():
    import pytest
    from assistant.visual.plan import PlanError
    with pytest.raises(PlanError, match="executable|event handlers"):
        composition('<svg class="live-stage-svg"><script>alert(1)</script></svg>')
    with pytest.raises(PlanError, match="executable|event handlers"):
        composition('<svg class="live-stage-svg" onload="x()"></svg>')


def test_static_gate_checks_one_sample_and_skips_the_craft_sweep(monkeypatch, tmp_path):
    from assistant.visual import browser_gate
    calls = []
    class Result:
        returncode = 0
        stdout = '{"ok": true, "lint": {"findings": []}}'
        stderr = ''
    monkeypatch.setattr(browser_gate.subprocess, 'run', lambda *args, **kwargs: calls.append(args[0]) or Result())
    assert browser_gate.run_check(tmp_path)['ok'] is True
    command = calls[0]
    assert command[command.index('--samples') + 1] == '1'
    assert command[command.index('--range') + 1] == '0,0.1'
