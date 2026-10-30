"""Regression checks for the model/data boundary and shared visual control bus."""
import ast
import copy
import json
import threading
from functools import partial
from http.server import ThreadingHTTPServer
from pathlib import Path
import urllib.error
import urllib.request
from unittest.mock import Mock, patch

import pytest

from assistant.config import Config
from assistant.llm import OfflineLLM
from assistant.visual.plan import PlanError, generate_scene_reply, manim_source, validate_plan
from assistant.visual.server import Handler, VisualService
from assistant.visual.window import desktop_window


@pytest.fixture
def plan():
    return {"title": "ALU", "summary": "A simple selection example", "sources": [], "beats": [
        {"title": "Select an operation", "narration": "A control signal chooses the result.", "duration": 8,
         "elements": [{"id": "and", "kind": "box", "label": "AND", "x": -2},
                      {"id": "add", "kind": "box", "label": "ADD", "x": 2},
                      {"id": "wire", "kind": "arrow", "from": "and", "to": "add"}]}]}


@pytest.fixture
def service(tmp_path):
    with patch("assistant.visual.server.manim_python", return_value=None):
        return VisualService(cfg=Config(), llm=Mock(), render_dir=tmp_path)


def test_model_receives_selection_camera_source_and_history(plan):
    model = Mock(spec=["compose"])
    model.compose.return_value = json.dumps({"answer": "The selector chooses ADD.", "scene": plan})
    context = {"selection": ["add"], "time": 7.5, "camera": {"x": 2}, "sourceContext": "if mode == ADD"}
    reply = generate_scene_reply(model, "Why this operation?", context, [{"role": "user", "content": "Earlier question"}], "branch")
    sent = json.loads(model.compose.call_args.args[0])
    assert sent["context"] == context
    assert sent["history"][0]["content"] == "Earlier question"
    assert reply["scene"]["beats"][0]["elements"][2]["from"] == "and"


@pytest.mark.parametrize("mutation", [
    lambda p: p["beats"][0]["elements"][2].update({"to": "missing"}),
    lambda p: p["beats"][0]["elements"][0].update({"x": float("nan")}),
    lambda p: p["beats"][0]["elements"][0].update({"kind": "python"}),
    lambda p: p["beats"][0]["elements"][0].update({"color": "url(https://example.com)"}),
    lambda p: p["beats"][0].update({"duration": 900}),
    lambda p: p["beats"][0]["elements"][1].update({"id": "and"}),
])
def test_invalid_model_plans_are_rejected(plan, mutation):
    mutation(plan)
    with pytest.raises(PlanError):
        validate_plan(plan)


def test_motion_cues_survive_validation_and_export(plan):
    plan["beats"][0]["elements"][2].update({"revealAt": 3, "drawDuration": 1.5, "emphasizeAt": 5})
    validated = validate_plan(plan)
    edge = validated["beats"][0]["elements"][2]
    assert edge["revealAt"] == 3 and edge["emphasizeAt"] == 5
    source = manim_source(plan)
    ast.parse(source)
    assert 'Transform(obj, target' in source
    assert 'MoveAlongPath' in source
    assert 'FadeOut(previous)' not in source


@pytest.mark.parametrize("cue", [{"revealAt": 9}, {"drawDuration": -1}, {"emphasizeAt": 8}, {"opacity": 0}, {"entrance": "execute"}])
def test_motion_cues_cannot_escape_the_beat_or_add_unknown_actions(plan, cue):
    plan["beats"][0]["elements"][0].update(cue)
    with pytest.raises(PlanError):
        validate_plan(plan)


def test_retry_is_bounded_and_reports_validation_errors(plan):
    model = Mock(spec=["compose"])
    model.compose.side_effect = ["not json", json.dumps({"answer": "A valid answer", "scene": plan})]
    assert generate_scene_reply(model, "Teach me", {}, [], "lesson")["scene"]["title"] == "ALU"
    assert model.compose.call_count == 2
    assert "failed validation" in model.compose.call_args.args[0]
    model.compose.side_effect = None
    model.compose.return_value = '{"answer":"No picture", "scene":null}'
    with pytest.raises(PlanError):
        generate_scene_reply(model, "Teach me", {}, [], "lesson")


def test_python_export_keeps_injected_text_as_data(plan):
    plan["beats"][0]["elements"][0]["label"] = "'); __import__('os').system('false'); #"
    source = manim_source(plan)
    tree = ast.parse(source)
    assert len([n for n in tree.body if isinstance(n, ast.ClassDef)]) == 1
    assert "QweepsLesson" in source
    assert ast.literal_eval(tree.body[2].value.args[0]) == json.dumps(validate_plan(plan), ensure_ascii=False)


def test_sessions_and_command_queues_are_isolated(service):
    a, _ = service.session(); b, _ = service.session()
    service.update(a, {"selection": ["A"]}); service.update(b, {"selection": ["B"]})
    service.command("pause", a)
    service.command("resume", b)
    assert service.drain(a)["commands"] == [{"command": "pause"}]
    assert service.drain(a)["commands"] == []
    assert service.drain(b)["commands"] == [{"command": "resume"}]
    assert service.state(a)["context"]["selection"] == ["A"]


def test_offline_never_returns_a_scripted_ai_answer(service):
    service.llm = OfflineLLM()
    with pytest.raises(PlanError, match="No AI model"):
        service.ask({"question": "Why?"})


def test_failed_generation_does_not_corrupt_conversation(service):
    sid, s = service.session()
    s["history"] = [{"role": "user", "content": "Original"}]
    with patch("assistant.visual.server.generate_reply", side_effect=PlanError("bad plan")):
        with pytest.raises(PlanError):
            service.ask({"sessionId": sid, "question": "Explain"})
    assert s["history"] == [{"role": "user", "content": "Original"}]


def test_server_rejects_cross_origin_and_malformed_requests(service, tmp_path):
    handler = type("TestHandler", (Handler,), {"service": service})
    httpd = ThreadingHTTPServer(("127.0.0.1", 0), partial(handler, directory=str(tmp_path)))
    thread = threading.Thread(target=httpd.serve_forever, daemon=True); thread.start()
    url = f"http://127.0.0.1:{httpd.server_port}/api/visual/session"
    try:
        req = urllib.request.Request(url, data=b'{}', headers={"Origin": "https://example.com", "Content-Type": "application/json"})
        with pytest.raises(urllib.error.HTTPError) as exc:
            urllib.request.urlopen(req)
        assert exc.value.code == 403
        req = urllib.request.Request(url, data=b'[]', headers={"Content-Type": "application/json"})
        with pytest.raises(urllib.error.HTTPError) as exc:
            urllib.request.urlopen(req)
        assert exc.value.code == 400
        req = urllib.request.Request(url, data=b'{}', headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(req) as response:
            assert json.load(response)["sessionId"]
    finally:
        httpd.shutdown(); httpd.server_close(); thread.join(timeout=2)


def test_video_ranges_allow_chapter_seeking_for_examples_and_renders(service, tmp_path):
    content = bytes(range(256)) * 400
    (tmp_path / "example.mp4").write_bytes(content)
    job = "c" * 32
    render = service.render_dir / job
    render.mkdir()
    (render / "lesson.mp4").write_bytes(content)
    handler = type("RangeHandler", (Handler,), {"service": service})
    httpd = ThreadingHTTPServer(("127.0.0.1", 0), partial(handler, directory=str(tmp_path)))
    thread = threading.Thread(target=httpd.serve_forever, daemon=True)
    thread.start()
    try:
        for route in ["/example.mp4", f"/renders/{job}.mp4"]:
            url = f"http://127.0.0.1:{httpd.server_port}{route}"
            with urllib.request.urlopen(url) as response:
                assert response.status == 200
                assert response.headers["Accept-Ranges"] == "bytes"
                assert response.read() == content
            for requested, start, end in [("bytes=70000-70099", 70000, 70099),
                                          ("bytes=100000-", 100000, len(content) - 1),
                                          ("bytes=-30", len(content) - 30, len(content) - 1),
                                          ("bytes=2-999999", 2, len(content) - 1)]:
                request = urllib.request.Request(url, headers={"Range": requested})
                with urllib.request.urlopen(request) as response:
                    assert response.status == 206
                    assert response.headers["Content-Range"] == f"bytes {start}-{end}/{len(content)}"
                    assert int(response.headers["Content-Length"]) == end - start + 1
                    assert response.read() == content[start:end + 1]
            for invalid in ["bytes=999999-", "bytes=10-2", "bytes=-0", "bytes=-", "bytes=1-2,4-5"]:
                request = urllib.request.Request(url, headers={"Range": invalid})
                with pytest.raises(urllib.error.HTTPError) as exc:
                    urllib.request.urlopen(request)
                assert exc.value.code == 416
                assert exc.value.headers["Content-Range"] == f"bytes */{len(content)}"
    finally:
        httpd.shutdown(); httpd.server_close(); thread.join(timeout=2)


def test_escape_targets_only_the_owned_app_window():
    sid = "a" * 32
    clients = [{"class": "brave-browser", "title": f"QWEEPS Visual {sid}", "address": "0x111"},
               {"class": "qweeps-visual", "title": "Other lesson", "address": "0x222"},
               {"class": "qweeps-visual", "title": f"QWEEPS Visual {sid}", "address": "0x333"}]
    with patch("assistant.visual.window.shutil.which", return_value="hyprctl"), patch("assistant.visual.window.subprocess.run") as run:
        run.side_effect = [Mock(stdout=json.dumps(clients)), Mock(returncode=0, stdout="ok\n")]
        assert desktop_window(sid, close=True)
        command = run.call_args.args[0]
        assert 'address:0x333' in command[-1] and 'window.close' in command[-1]
        assert '0x111' not in command[-1]


def test_no_false_success_when_a_visual_control_has_no_connected_window():
    from assistant.skills.visual import VisualExplainerSkill
    from assistant.skills.base import SkillContext
    with patch("assistant.skills.visual.get_active_runner") as runner:
        runner.return_value.resume.return_value = False
        result = VisualExplainerSkill().run({"action": "control", "command": "resume"}, SkillContext(cfg=Config()))
    assert "No visual window" in result.text


def test_wayland_origin_app_class_can_be_styled_but_regular_browser_cannot():
    sid = "b" * 32
    clients = [{"class": "brave-127.0.0.1__-Default", "title": f"QWEEPS Visual {sid}", "address": "0x444"}]
    with patch("assistant.visual.window.shutil.which", return_value="hyprctl"), patch("assistant.visual.window.subprocess.run") as run:
        run.side_effect = [Mock(stdout=json.dumps(clients)), Mock(returncode=0, stdout="ok\n")]
        assert desktop_window(sid)
        assert 'border_size' in run.call_args.args[0][-1]


def test_visual_service_preserves_the_configured_model_fallback():
    from assistant.llm import FallbackLLM
    from assistant.http import HTTPError
    primary = Mock(spec=["compose"])
    primary.compose.side_effect = HTTPError(403, "subscription unavailable")
    fallback = Mock(spec=["compose"])
    fallback.compose.return_value = json.dumps({"answer": "A cached input reuses a previous prompt prefix.", "scene": None})
    chain = FallbackLLM(primary, fallback)
    with patch("assistant.visual.server.manim_python", return_value=None):
        service = VisualService(cfg=Config(), llm=chain)
    reply = service.ask({"question": "What is cached input?", "mode": "question"})
    assert service.llm is chain
    assert reply["answer"] == "A cached input reuses a previous prompt prefix."
    assert primary.compose.call_count == fallback.compose.call_count == 1


def test_structured_visual_requests_keep_their_token_budget_and_fallback():
    from assistant.llm import FallbackLLM
    from assistant.http import HTTPError
    primary = Mock(spec=["_chat"])
    primary._chat.side_effect = ["valid", HTTPError(403, "unavailable")]
    fallback = Mock(spec=["compose"]); fallback.compose.return_value = "fallback JSON"
    chain = FallbackLLM(primary, fallback)
    messages=[{"role":"system","content":"Return JSON"},{"role":"user","content":"the current scene"}]
    assert chain._chat(messages,max_tokens=6000)=="valid"
    primary._chat.assert_called_with(messages,max_tokens=6000)
    assert chain._chat(messages,max_tokens=6000)=="fallback JSON"
    fallback.compose.assert_called_with("the current scene","Return JSON")
def test_antigravity_compose_reports_timeout_and_uses_longer_budget(monkeypatch):
    import subprocess
    from assistant.config import Config
    from assistant.llm import AntigravityLLM, ModelProviderError
    calls=[]
    def run(*args,**kwargs):
        calls.append(kwargs['timeout'])
        raise subprocess.TimeoutExpired(args[0],kwargs['timeout'])
    monkeypatch.setattr(subprocess,'run',run)
    with pytest.raises(ModelProviderError,match='did not finish'):
        AntigravityLLM(Config()).compose('make a lesson')
    assert calls==[180]


def test_empty_primary_structured_response_uses_fallback():
    from unittest.mock import Mock
    from assistant.llm import FallbackLLM
    primary=Mock(spec=['_chat']);primary._chat.return_value=''
    fallback=Mock(spec=['compose']);fallback.compose.return_value='{"answer":"fallback"}'
    assert FallbackLLM(primary,fallback)._chat([{'role':'user','content':'question'}])=='{"answer":"fallback"}'
