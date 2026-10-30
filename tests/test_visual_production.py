"""Accounting and code/data boundaries of the interactive production lesson."""
import ast
import json
from pathlib import Path
import pytest
from assistant.visual.production import experiment,interval_union,native_source,token_cost
from assistant.visual.plan import PlanError
ROOT=Path(__file__).resolve().parents[1]
REPORT=json.loads((ROOT/'visual-studio/public/production/report.json').read_text())


def test_counterfactual_value_uses_actual_response_usage_and_context_tiers():
    settings=experiment(REPORT)
    assert token_cost(REPORT,settings)['total']==pytest.approx(1.8925104)
    value=token_cost(REPORT,experiment(REPORT,{'scope':'five_examples'}))
    assert value['total']==pytest.approx(4.2466,abs=.0001)
    assert value['longRequests']==34
    assert token_cost(REPORT,{**settings,'fast':True})['total']==pytest.approx(2*token_cost(REPORT,settings)['total'])


@pytest.mark.parametrize('bad',[{'scope':'unknown'},{'cache':1},{'fps':float('nan')},{'contextFraction':2},{'avoidRender':-.5}])
def test_controls_cannot_insert_unbounded_data_into_native_render(bad):
    with pytest.raises(PlanError):experiment(REPORT,bad)


def test_overlapping_job_intervals_are_not_added_twice():
    assert interval_union([(0,10),(5,12),(20,22)])==14


def test_native_export_retains_source_text_as_data_and_uses_svg_geometry():
    report=json.loads(json.dumps(REPORT));report['turns'][-1]['label']="'); __import__('os').system('false'); #"
    svg=(ROOT/'visual-studio/public/production/stopwatch.svg').read_text()
    source=native_source(report,{},svg)
    tree=ast.parse(source)
    assignments={n.targets[0].id:n.value for n in tree.body if isinstance(n,ast.Assign)}
    data=json.loads(ast.literal_eval(assignments['D'].args[0]))
    assert data['title']==report['turns'][-1]['label']
    assert ast.literal_eval(assignments['CLOCK_SVG'])==svg
    assert len([n for n in tree.body if isinstance(n,ast.ClassDef)])==1
