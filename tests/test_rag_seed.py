from assistant.visual.architecture_flow import validate_architecture
from assistant.visual.rag_seed import rag_architecture


def seeded():
    return validate_architecture(rag_architecture())


def test_rag_seed_keeps_reference_hierarchy_and_compound_contract():
    architecture = seeded()
    nodes = architecture['graph']['nodes']
    assert len(nodes) == 8
    assert len(architecture['graph']['edges']) == 9
    assert architecture['renderContract'] == 'reference'

    containers = {node['id']: node for node in nodes if node.get('compoundContainer')}
    assert set(containers) == {'embed', 'retrieve', 'context', 'prompt', 'model'}
    assert containers['retrieve']['compoundContainer']['leftPortsY'] == [66, 120]
    assert containers['retrieve']['compoundContainer']['children'][-1]['isDropBranch'] is True
    assert containers['prompt']['compoundContainer']['leftPortsY'] == [56, 112]
    assert containers['embed']['width'] == 416
    assert containers['retrieve']['height'] == 196
    assert architecture['graph']['compactRowAssignment']['context']['row'] == 1
    assert architecture['graph']['compactRowAssignment']['prompt']['row'] == 0


def test_rag_seed_worked_values_match_displayed_values():
    architecture = seeded()
    values = architecture['workedExample']['values']
    scores = {item['id']: round(item['score'], 2) for item in values['scores']}
    assert scores == {'refund-policy': 0.89, 'returns-guide': 0.64, 'shipping-guide': 0.18}

    answer_py = next(file for file in architecture['codeFiles'] if file['file'] == 'answer.py')
    lines = {line['lineNumber']: line for line in answer_py['lines']}
    assert lines[2]['resultText'] == '[0.1270, -0.4658, 0.0847, 0.7517, -0.2223, 0.3811]'
    assert lines[3]['resultText'] == '[refund-policy (0.89), returns-guide (0.64)]'
    assert '[refund-policy]' in lines[4]['resultText']
    assert '[returns-guide]' in lines[4]['resultText']

    assert '[refund-policy]' in values['context_text']
    assert 'SystemRules' in values['prompt_text']
    assert '[returns-guide]' in values['prompt_text']
