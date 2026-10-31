import importlib.util
from pathlib import Path

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
    html = module.composition('<svg class="live-stage-svg"><style>@font-face{font-family:QweepsTeachingSerif;src:url("/live/teaching-serif.ttf") format("truetype")}</style><text>x</text></svg>')
    assert 'data-composition-id="lesson-check"' in html
    assert 'data-no-timeline' in html
    assert 'data-width="1440"' in html
    assert 'data:font/ttf;base64,' in html
    assert 'width="1440" height="600"' in html
