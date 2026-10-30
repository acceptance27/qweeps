import unittest
from pathlib import Path

import assistant.workspace as workspace
from assistant.agent import WorkspaceAgent
from assistant.config import default_config


def _client(class_name, title, ws, address="0x1", pid=100):
    return {
        "class": class_name,
        "title": title,
        "workspace": {"id": ws},
        "address": address,
        "pid": pid,
    }


class AgentWindowTests(unittest.TestCase):
    def setUp(self):
        self.cfg = default_config(Path("/tmp/ws-test"))

    def _patch_hypr(self, clients, active_ws=1, active_addr="0x1"):
        def fake(*args):
            if args[0] == "clients":
                return clients
            if args[0] == "activeworkspace":
                return {"id": active_ws}
            if args[0] == "activewindow":
                return {"address": active_addr}
            return None

        original = workspace._hyprctl
        workspace._hyprctl = fake
        self.addCleanup(lambda: setattr(workspace, "_hyprctl", original))

    def test_filters_and_cleans_opencode_title(self):
        self._patch_hypr([
            _client("org.omarchy.agent", "OC | Fix the thing", 1),
            _client("brave-browser", "not an agent", 1),
            _client("org.omarchy.agy", "foot", 2, address="0x2"),
        ])
        windows = workspace.agent_windows(self.cfg)
        self.assertEqual([w["kind"] for w in windows], ["opencode", "antigravity"])
        self.assertEqual(windows[0]["title"], "Fix the thing")
        self.assertTrue(windows[0]["on_active"])
        self.assertFalse(windows[1]["on_active"])

    def test_pick_prefers_active_workspace(self):
        windows = [
            {"kind": "opencode", "title": "unrelated", "on_active": False, "focused": True},
            {"kind": "opencode", "title": "fix the parser bug", "on_active": True, "focused": False},
        ]
        picked = workspace.pick_window("fix the parser bug", windows)
        self.assertEqual(picked["title"], "fix the parser bug")

    def test_pick_uses_title_overlap_when_multiple_active(self):
        windows = [
            {"kind": "opencode", "title": "react dashboard work", "on_active": True, "focused": True},
            {"kind": "antigravity", "title": "database migration plan", "on_active": True, "focused": False},
        ]
        picked = workspace.pick_window("help with the database migration", windows)
        self.assertEqual(picked["title"], "database migration plan")

    def test_pick_prefers_llm_choice(self):
        class StubLLM:
            def answer(self, *a, **k):
                return "2"

        windows = [
            {"kind": "opencode", "title": "alpha", "on_active": True, "focused": True},
            {"kind": "opencode", "title": "beta", "on_active": True, "focused": False},
        ]
        picked = workspace.pick_window("anything", windows, StubLLM())
        self.assertEqual(picked["title"], "beta")

    def test_pick_returns_none_without_windows(self):
        self.assertIsNone(workspace.pick_window("hi", []))


class SessionMatchTests(unittest.TestCase):
    def test_exact_title_wins(self):
        sessions = [
            {"id": "s1", "title": "Something else"},
            {"id": "s2", "title": "Qweeps cutoff issue"},
        ]
        match = workspace._match_session("Qweeps cutoff issue", sessions)
        self.assertEqual(match["id"], "s2")

    def test_fuzzy_title_fallback(self):
        sessions = [{"id": "s3", "title": "Antigravity CLI vs IDE choice"}]
        match = workspace._match_session("Antigravity CLI vs IDE choic", sessions)
        self.assertEqual(match["id"], "s3")

    def test_no_match_returns_none(self):
        self.assertIsNone(workspace._match_session("zzz", [{"id": "s1", "title": "abc"}]))


class DelegateTests(unittest.TestCase):
    def setUp(self):
        self.cfg = default_config(Path("/tmp/ws-test"))
        self.cfg.agent.visible_only = True

    def test_delegate_opencode_resolves_session(self):
        captured = {}
        original_sessions = workspace.opencode_sessions
        original_run = workspace._run
        workspace.opencode_sessions = lambda directory, timeout=30: [
            {"id": "ses_abc", "title": "Fix the thing", "directory": "/home/me/proj"}
        ]
        workspace._run = lambda command, cwd, timeout: captured.update(
            command=command, cwd=cwd
        ) or "done"
        self.addCleanup(lambda: setattr(workspace, "opencode_sessions", original_sessions))
        self.addCleanup(lambda: setattr(workspace, "_run", original_run))

        window = {"kind": "opencode", "title": "Fix the thing"}
        reply = workspace.delegate(window, "please fix it", self.cfg)
        self.assertEqual(reply, "done")
        self.assertIn("ses_abc", captured["command"])
        self.assertIn("please fix it", captured["command"])
        self.assertEqual(captured["cwd"], "/home/me/proj")

    def test_delegate_antigravity_continue(self):
        captured = {}
        original_run = workspace._run
        workspace._run = lambda command, cwd, timeout: captured.update(command=command) or "ok"
        self.addCleanup(lambda: setattr(workspace, "_run", original_run))

        reply = workspace.delegate({"kind": "antigravity", "title": "foot"}, "do it", self.cfg)
        self.assertEqual(reply, "ok")
        self.assertIn("--continue", captured["command"])


class WorkspaceAgentTests(unittest.TestCase):
    def test_available_reads_windows(self):
        cfg = default_config(Path("/tmp/ws-test"))
        agent = WorkspaceAgent(cfg)
        original = workspace.agent_windows
        workspace.agent_windows = lambda _cfg: [{"kind": "opencode", "title": "t"}]
        self.addCleanup(lambda: setattr(workspace, "agent_windows", original))
        self.assertTrue(agent.available())

    def test_run_raises_without_windows(self):
        cfg = default_config(Path("/tmp/ws-test"))
        agent = WorkspaceAgent(cfg)
        original = workspace.agent_windows
        workspace.agent_windows = lambda _cfg: []
        self.addCleanup(lambda: setattr(workspace, "agent_windows", original))
        from assistant.agent import AgentUnavailable

        with self.assertRaises(AgentUnavailable):
            agent.run("do something")

    def test_run_delegates_to_picked_window(self):
        cfg = default_config(Path("/tmp/ws-test"))
        agent = WorkspaceAgent(cfg)
        window = {"kind": "opencode", "title": "Fix the thing", "on_active": True}
        calls = {}
        originals = (workspace.agent_windows, workspace.delegate)
        workspace.agent_windows = lambda _cfg: [window]
        workspace.delegate = lambda w, task, c: calls.update(window=w, task=task) or "reply"
        self.addCleanup(lambda: setattr(workspace, "agent_windows", originals[0]))
        self.addCleanup(lambda: setattr(workspace, "delegate", originals[1]))

        self.assertEqual(agent.run("fix the thing"), "reply")
        self.assertIs(calls["window"], window)
        self.assertEqual(calls["task"], "fix the thing")


    def test_run_skips_busy_window(self):
        cfg = default_config(Path("/tmp/ws-test"))
        agent = WorkspaceAgent(cfg)
        windows = [
            {"kind": "opencode", "title": "busy one", "on_active": True, "focused": False},
            {"kind": "opencode", "title": "free one", "on_active": False, "focused": False},
        ]
        originals = (workspace.agent_windows, workspace.delegate)
        workspace.agent_windows = lambda _cfg: windows

        def deleg(window, task, c):
            if window["title"] == "busy one":
                raise workspace.AgentBusy("busy")
            return "ok:" + window["title"]

        workspace.delegate = deleg
        self.addCleanup(lambda: setattr(workspace, "agent_windows", originals[0]))
        self.addCleanup(lambda: setattr(workspace, "delegate", originals[1]))

        self.assertEqual(agent.run("do it"), "ok:free one")


    def test_run_falls_back_when_candidate_fails(self):
        cfg = default_config(Path("/tmp/ws-test"))
        agent = WorkspaceAgent(cfg)
        windows = [
            {"kind": "opencode", "title": "failing opencode", "on_active": True, "focused": False},
            {"kind": "antigravity", "title": "working antigravity", "on_active": False, "focused": False},
        ]
        originals = (workspace.agent_windows, workspace.delegate)
        workspace.agent_windows = lambda _cfg: windows

        def deleg(window, task, c):
            if window["kind"] == "opencode":
                raise RuntimeError("opencode session failed")
            return "antigravity ok: " + window["title"]

        workspace.delegate = deleg
        self.addCleanup(lambda: setattr(workspace, "agent_windows", originals[0]))
        self.addCleanup(lambda: setattr(workspace, "delegate", originals[1]))

        self.assertEqual(agent.run("do it"), "antigravity ok: working antigravity")


if __name__ == "__main__":
    unittest.main()
