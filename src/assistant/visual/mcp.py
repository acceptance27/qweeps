"""Optional MCP facade over the same studio state and controls as QWEEPS.

Run: uv run --extra visual-mcp omarchy-assistant visual mcp
"""
from __future__ import annotations

from .runner import VisualRunner, ensure_studio_server, studio_request


def main():
    try:
        from mcp.server.fastmcp import FastMCP
    except ImportError as exc:
        raise SystemExit("Install the MCP extra: uv run --extra visual-mcp omarchy-assistant visual mcp") from exc
    server = FastMCP("QWEEPS Visual Learning")

    @server.tool()
    def visual_open(topic: str = "astar_heuristic") -> dict:
        """Open a visual lesson in the desktop studio. Other topics generate a new plan."""
        runner = VisualRunner(tts=True)
        runner.launch_studio(topic)
        return {"opened": True, "topic": topic}

    @server.tool()
    def visual_state() -> dict:
        """Read the active paused time, camera, selection, live scores and conversation."""
        ensure_studio_server()
        return studio_request("state")

    @server.tool()
    def visual_ask(question: str, branch: bool = False) -> dict:
        """Ask about the active selection, optionally creating a new visual branch."""
        ensure_studio_server()
        state = studio_request("state")
        if not state.get("sessionId") or state.get("closed"):
            raise ValueError("Open a visual window first.")
        sid = state["sessionId"]
        studio_request("control", {"command": "pause", "sessionId": sid})
        reply = studio_request("ask", {"sessionId": sid, "question": question,
                                       "mode": "branch" if branch else "question"})
        studio_request("reply", {"sessionId": sid, "question": question, "reply": reply})
        return reply

    @server.tool()
    def visual_control(command: str) -> dict:
        """Control the active window: pause, resume, next, previous, branch or close."""
        ensure_studio_server()
        return studio_request("control", {"command": command})

    @server.tool()
    def visual_render(scene: dict) -> dict:
        """Render a validated scene plan with Manim CE. Returns a local video URL."""
        ensure_studio_server()
        result = studio_request("render", {"scene": scene}, timeout=190)
        result["url"] = "http://127.0.0.1:4174" + result["url"]
        return result

    server.run(transport="stdio")


if __name__ == "__main__":
    main()
