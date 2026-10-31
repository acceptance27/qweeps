from assistant.visual.geometry import chart_fractions, resolve_text_layout, separate_text, separate_text_from_links


def test_separate_text_moves_only_the_free_label():
    child = {"id": "curve_l0", "kind": "text", "x": 0, "y": 0, "width": 1, "height": 0.5,
             "parentId": "curve"}
    free = {"id": "readout", "kind": "text", "x": 0, "y": 0, "width": 1, "height": 0.5}
    moved = separate_text([child, free])
    assert moved >= 1
    assert child["y"] == 0
    assert free["y"] != 0


def test_separate_text_leaves_parented_label_pairs_to_the_gate():
    first = {"id": "a", "kind": "text", "x": 0, "y": 0, "width": 1, "height": 0.5, "parentId": "p"}
    second = {"id": "b", "kind": "text", "x": 0, "y": 0, "width": 1, "height": 0.5, "parentId": "q"}
    assert separate_text([first, second]) == 0
    assert first["y"] == second["y"] == 0


def test_a_label_on_a_connector_line_is_shifted_off_it():
    start = {"id": "bias", "kind": "box", "x": 0, "y": 2, "width": 1, "height": 0.5}
    end = {"id": "sum", "kind": "circle", "x": 0, "y": 0, "width": 2, "height": 1}
    arrow = {"id": "bias_arrow", "kind": "arrow", "from": "bias", "to": "sum",
             "x": 0, "y": 1, "width": 0.2, "height": 2}
    label = {"id": "product", "kind": "text", "x": 0, "y": 1, "width": 1.6, "height": 0.4}
    moved = separate_text_from_links([start, end, arrow, label])
    assert moved >= 1
    assert abs(label["x"]) > 0.7


def test_a_connector_endpoint_label_is_not_pushed_away():
    start = {"id": "bias", "kind": "text", "x": 0, "y": 2, "width": 1.2, "height": 0.4}
    end = {"id": "sum", "kind": "circle", "x": 0, "y": 0, "width": 2, "height": 1}
    arrow = {"id": "bias_arrow", "kind": "arrow", "from": "bias", "to": "sum",
             "x": 0, "y": 1, "width": 0.2, "height": 2}
    assert separate_text_from_links([start, end, arrow]) == 0
    assert start["x"] == 0


def test_a_label_inside_a_shape_is_not_pushed_by_a_connector_ending_there():
    node = {"id": "sum", "kind": "circle", "x": 0, "y": 0, "width": 2, "height": 1}
    total = {"id": "total", "kind": "text", "x": 0, "y": 0, "width": 1.2, "height": 0.4}
    bias = {"id": "bias", "kind": "box", "x": 0, "y": 1, "width": 1, "height": 0.4}
    arrow = {"id": "arrow", "kind": "arrow", "from": "bias", "to": "sum",
             "x": 0, "y": 0.5, "width": 0.2, "height": 1}
    assert separate_text_from_links([node, total, bias, arrow]) == 0
    assert total["x"] == 0 and total["y"] == 0


def test_global_layout_moves_a_product_label_off_the_bias_arrow_and_keeps_it_clear():
    node = {"id": "sum", "kind": "circle", "x": 0, "y": 0, "width": 2, "height": 1}
    bias = {"id": "bias", "kind": "text", "x": 0, "y": -2, "width": 1.2, "height": 0.4}
    arrow = {"id": "bias_arrow", "kind": "arrow", "from": "bias", "to": "sum",
             "x": 0, "y": -1, "width": 0.2, "height": 2}
    total = {"id": "total", "kind": "text", "x": 0, "y": 0, "width": 1.2, "height": 0.4}
    product = {"id": "product", "kind": "text", "x": 0, "y": -0.95, "width": 1.6, "height": 0.4}
    moved = resolve_text_layout([node, bias, arrow, total, product])
    assert moved >= 1
    assert abs(product["x"]) > 0.5


def test_chart_fractions_use_numeric_keys_as_the_x_domain():
    bars = [{"label": "0", "value": 0}, {"label": "0.5", "value": 0.5},
            {"label": "2", "value": 1.0}]
    x_at, y_at = chart_fractions(bars)
    assert abs(x_at(1) - 0.25) < 1e-9
    assert abs(x_at(2) - 1.0) < 1e-9
    assert abs(y_at(0.5) - 0.5) < 1e-9
