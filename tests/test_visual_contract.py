from assistant.visual.native_author import assemble
from assistant.visual.visual_contract import base_contract, contract_prompt, enrich_contract


def story():
    return {
        "title": "A lesson",
        "question": "Why?",
        "representation": "shared stage",
        "beats": [
            {"id": "a", "title": "A", "layout": "diagram", "years": "1861", "retain": []},
            {"id": "b", "title": "B", "layout": "comparison", "years": "1872", "retain": ["stage"]},
            {"id": "c", "title": "C", "layout": "timeline", "years": "1896", "retain": ["stage"]},
        ],
    }


def test_base_contract_has_shared_stage_and_fades():
    contract = base_contract(story())
    assert contract["palette"]["blue"] == "#8BD0DF"
    assert "left" in contract["zones"] and "right" in contract["zones"]
    assert contract["opening"]["type"] == "fade"
    assert contract["closing"]["duration"] > 0
    assert len(contract["transitions"]) == 2
    assert contract["persistent"] == ["stage"]


def test_enrich_contract_adds_directed_nodes_and_exits():
    contract = base_contract(story())
    candidate = {"chapters": [
        {"id": "a", "visual": {"nodes": [{"id": "left"}, {"id": "arrow"}]}},
        {"id": "b", "visual": {"nodes": [{"id": "right"}]}},
        {"id": "c", "visual": {"nodes": []}},
    ]}
    enriched = enrich_contract(contract, candidate)
    beats = {row["id"]: row for row in enriched["beats"]}
    assert beats["a"]["enter"] == ["left", "arrow"]
    assert beats["b"]["exit"] == ["left", "arrow"]
    assert beats["c"]["enter"] == []


def test_contract_prompt_carries_palette_zones_and_transitions():
    text = "\n".join(contract_prompt(base_contract(story())))
    assert "SHARED VISUAL CONTRACT" in text
    assert "Palette:" in text and "#8BD0DF" in text
    assert "zone=left" in text
    assert "Opening:" in text and "Closing:" in text


def test_assemble_attaches_a_fade_to_each_chapter_boundary():
    lesson = {"chapters": [
        {"id": "a", "start": 0, "end": 4},
        {"id": "b", "start": 4, "end": 8},
        {"id": "c", "start": 8, "end": 12},
    ]}
    manifest = {"sceneId": "gen_test", "beats": [
        {"id": "a", "start": 0, "end": 4},
        {"id": "b", "start": 4, "end": 8},
        {"id": "c", "start": 8, "end": 12},
    ]}
    result = assemble(lesson, story(), manifest, ["a", "b"], contract=base_contract(story()))
    assert result["chapters"][0]["transition"]["type"] == "fade"
    assert result["chapters"][1]["transition"]["type"] == "fade"
    assert result["chapters"][2]["transition"]["duration"] >= 0.35
