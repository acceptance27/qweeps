import json

import pytest

from assistant.visual.hybrid_review import review_frames
from assistant.visual.plan import PlanError

LESSON = {"title": "T", "chapters": [{"id": "c1", "title": "One", "visual": {
    "layout": "diagram", "presentation": {"textMode": "labels"},
    "nodes": [{"id": "n1", "title": "N", "body": "b", "tag": "t", "artwork": []}],
    "takeaway": "k"}}]}


class Reviewer:
    def __init__(self, payload):
        self.payload = payload
        self.calls = []

    def review_images(self, instruction, frames):
        self.calls.append((instruction, frames))
        return json.dumps(self.payload)


def test_frame_review_accepts_a_clean_review():
    reviewer = Reviewer({"approved": True, "findings": [],
                         "observations": [{"chapter": "c1", "visible": "v", "inference": "i"}]})
    result = review_frames(reviewer, LESSON, [b"png"], [{"chapter": "c1", "position": "finished"}])
    assert result["approved"] is True
    assert "labels" in reviewer.calls[0][0]


def test_frame_review_surfaces_findings():
    reviewer = Reviewer({"approved": False,
                         "findings": [{"chapter": "c1", "problem": "hidden value", "revision": "show it"}],
                         "observations": []})
    result = review_frames(reviewer, LESSON, [b"png"])
    assert result["approved"] is False
    assert result["findings"][0]["problem"] == "hidden value"


@pytest.mark.parametrize("payload, message", [
    ({"approved": True, "findings": [{"chapter": "c1", "problem": "p", "revision": "r"}]},
     "cannot carry findings"),
    ({"approved": False, "findings": []}, "needs findings"),
    ({"approved": False, "findings": [{"chapter": "c1"}]}, "chapter, problem and revision"),
])
def test_frame_review_rejects_inconsistent_verdicts(payload, message):
    with pytest.raises(PlanError, match=message):
        review_frames(Reviewer(payload), LESSON, [b"png"])


def test_frame_review_requires_image_support():
    class NoVision:
        pass
    with pytest.raises(PlanError, match="image review"):
        review_frames(NoVision(), LESSON, [b"png"])
