"""Compile a ManimCE scene into the RecordedScene native runtime.

Structural work only: import swap, base class swap, and one autoregister call at
the end of construct(). Everything else stays exactly as the CE source wrote it.
"""
from __future__ import annotations

import ast
from pathlib import Path

COMPAT_MODULE = "assistant.visual.recorded_scene"
SCENE_BASES = {"Scene", "MovingCameraScene", "ThreeDScene"}


class _NativePass(ast.NodeTransformer):
    def visit_ImportFrom(self, node: ast.ImportFrom) -> ast.AST:
        if node.module == "manim":
            node.module = COMPAT_MODULE
        return node

    def visit_ClassDef(self, node: ast.ClassDef) -> ast.AST:
        self.generic_visit(node)
        for index, base in enumerate(node.bases):
            if isinstance(base, ast.Name) and base.id in SCENE_BASES:
                node.bases[index] = ast.Name(id="RecordedScene", ctx=ast.Load())
        for item in node.body:
            if isinstance(item, ast.FunctionDef) and item.name == "construct":
                item.body.append(
                    ast.Expr(
                        value=ast.Call(
                            func=ast.Attribute(value=ast.Name(id="self"), attr="autoregister", ctx=ast.Load()),
                            args=[ast.Call(func=ast.Name(id="locals"), args=[], keywords=[])],
                            keywords=[],
                        )
                    )
                )
        return node

    def visit_Call(self, node: ast.Call) -> ast.AST:
        self.generic_visit(node)
        func = node.func
        if isinstance(func, ast.Attribute) and func.attr == "set":
            names = [kw.arg for kw in node.keywords]
            if len(node.keywords) == 1 and not node.args and names[0] in ("width", "height"):
                node.func = ast.copy_location(
                    ast.Attribute(value=func.value, attr=f"set_{names[0]}", ctx=ast.Load()), func)
                node.args = [node.keywords[0].value]
                node.keywords = []
        return node


def compile_native_source(source: str) -> str:
    tree = ast.parse(source)
    tree = _NativePass().visit(tree)
    ast.fix_missing_locations(tree)
    return "# Compiled for RecordedScene by assistant.visual.ce_native\n" + ast.unparse(tree) + "\n"


def load_native_scene(path: str | Path):
    source = Path(path).read_text()
    namespace: dict = {"__name__": "recorded_scene", "__file__": str(path)}
    exec(compile(compile_native_source(source), str(path), "exec"), namespace)
    scene_cls = namespace.get("GenScene")
    if scene_cls is None:
        raise RuntimeError(f"{path} has no GenScene class")
    return scene_cls()
