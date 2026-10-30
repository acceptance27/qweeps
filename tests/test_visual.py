import os
import tempfile
import time
import unittest
from unittest.mock import MagicMock, patch

from assistant.config import Config
from assistant.skills.base import SkillContext
from assistant.skills.visual import VisualExplainerSkill
from assistant.visual.beats import Beat, Timeline
from assistant.visual.ipc import VisualIPCClient, VisualIPCServer


class TestBeatsAndTimeline(unittest.TestCase):
    def test_beat_initialization(self):
        beat = Beat(
            name="test_beat",
            narration="Explaining Euclidean distance.",
            absorption_pause=1.5,
        )
        self.assertEqual(beat.name, "test_beat")
        self.assertEqual(beat.narration, "Explaining Euclidean distance.")
        self.assertEqual(beat.absorption_pause, 1.5)

    def test_timeline_stepping(self):
        beats = [
            Beat(name="beat0", narration="Zero"),
            Beat(name="beat1", narration="One"),
            Beat(name="beat2", narration="Two"),
        ]
        timeline = Timeline(beats)
        self.assertEqual(timeline.current_index, 0)
        self.assertTrue(timeline.has_next())
        self.assertFalse(timeline.has_prev())

        timeline.step_forward()
        self.assertEqual(timeline.current_index, 1)
        self.assertTrue(timeline.has_prev())

        timeline.step_forward()
        self.assertEqual(timeline.current_index, 2)
        self.assertFalse(timeline.has_next())

        timeline.step_backward()
        self.assertEqual(timeline.current_index, 1)

    def test_checkpoint_recording(self):
        class MockFrame:
            def get_center(self):
                return [1.0, 2.0, 0.0]
            def get_width(self):
                return 16.0
            def get_height(self):
                return 9.0

        class MockCamera:
            def __init__(self):
                self.frame = MockFrame()

        class MockScene:
            def __init__(self):
                self.camera = MockCamera()
                self.mobjects = []

        timeline = Timeline([Beat(name="b0", narration="")])
        scene = MockScene()
        cp = timeline.record_checkpoint(scene)

        self.assertEqual(cp.beat_index, 0)
        self.assertEqual(cp.camera_state["center"], [1.0, 2.0, 0.0])
        self.assertEqual(cp.camera_state["width"], 16.0)


class TestVisualIPC(unittest.TestCase):
    def test_ipc_communication(self):
        temp_dir = tempfile.mkdtemp()
        sock_path = os.path.join(temp_dir, "test.sock")

        server = VisualIPCServer(socket_path=sock_path)
        server.start()

        client = VisualIPCClient(socket_path=sock_path)
        connected = client.connect(timeout=2.0)
        self.assertTrue(connected)

        received_events = []
        server.on("test_event", lambda msg: received_events.append(msg))

        client.send("test_event", payload="hello_world")
        time.sleep(0.1)

        self.assertEqual(len(received_events), 1)
        self.assertEqual(received_events[0].get("payload"), "hello_world")

        # Test server to client emit
        client_events = []
        client.on("inspect", lambda msg: client_events.append(msg))

        server.emit("inspect", id="node_a", label="Node A", cost="g=2, h=4")
        time.sleep(0.1)

        self.assertEqual(len(client_events), 1)
        self.assertEqual(client_events[0].get("id"), "node_a")

        client.close()
        server.close()
        if os.path.exists(sock_path):
            os.unlink(sock_path)
        os.rmdir(temp_dir)


class TestVisualExplainerSkill(unittest.TestCase):
    def setUp(self):
        self.skill = VisualExplainerSkill()
        self.ctx = SkillContext(cfg=Config())

    def test_matching_astar_queries(self):
        queries = [
            "Explain how A* pathfinding calculates the heuristic.",
            "explain how a* pathfinding works",
            "show me how the a star heuristic algorithm calculates",
            "visualize a* pathfinding",
            "explain a* heuristic",
        ]
        for q in queries:
            matched = self.skill.match(q)
            self.assertIsNotNone(matched, f"Failed to match: {q}")
            self.assertEqual(matched.get("action"), "launch")
            self.assertEqual(matched.get("topic"), "astar")

    def test_matching_controls(self):
        self.assertEqual(self.skill.match("pause the visual")["command"], "pause")
        self.assertEqual(self.skill.match("resume animation")["command"], "resume")
        self.assertEqual(self.skill.match("next beat")["command"], "next")
        self.assertEqual(self.skill.match("previous beat")["command"], "previous")
        self.assertEqual(self.skill.match("branch visual")["command"], "branch")
        self.assertEqual(self.skill.match("branch out")["command"], "branch")
        self.assertEqual(self.skill.match("close the visual")["command"], "close")

    def test_matching_animation_queries(self):
        queries = [
            ("generate a manim animation about the nitrogen", "nitrogen"),
            ("make a manim animation about nitrogen", "nitrogen"),
            ("create an animation of nitrogen", "nitrogen"),
            ("generate an animation about photosynthesis", "photosynthesis"),
            ("visualize binary search", "binary search"),
        ]
        for q, expected_topic in queries:
            matched = self.skill.match(q)
            self.assertIsNotNone(matched, f"Failed to match: {q}")
            self.assertEqual(matched.get("action"), "launch")
            self.assertEqual(matched.get("topic"), expected_topic)

    def test_matching_concept_queries(self):
        queries = [
            "whats node A and Start S for",
            "what is start S",
            "what is node A",
            "why is node A prioritized",
            "what is admissibility",
        ]
        for q in queries:
            matched = self.skill.match(q)
            self.assertIsNotNone(matched, f"Failed to match: {q}")
            self.assertEqual(matched.get("action"), "explain_concept")
            with patch("assistant.skills.visual.get_active_runner") as get_runner:
                get_runner.return_value.ask.return_value = "A model answer grounded in the selected visual state."
                res = self.skill.run(matched, self.ctx)
                get_runner.return_value.ask.assert_called_once_with(q)
                self.assertEqual(res.text, "A model answer grounded in the selected visual state.")


if __name__ == "__main__":
    unittest.main()
