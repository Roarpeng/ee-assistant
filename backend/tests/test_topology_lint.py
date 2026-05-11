from app.core.topology_lint import lint_topology


def test_lint_ok_minimal():
    snap = {
        'nodes': [
            {'id': 'ps1', 'type': 'power_supply'},
            {'id': 'plc1', 'type': 'plc'},
        ],
        'edges': [
            {'id': 'e1', 'source': 'ps1', 'target': 'plc1', 'protocol': '24vdc'}
        ]
    }
    violations = lint_topology(snap)
    assert not [v for v in violations if v['severity'] == 'error']


def test_lint_dangling_edge_error():
    snap = {
        'nodes': [{'id': 'n1', 'type': 'plc'}],
        'edges': [{'id': 'e1', 'source': 'n1', 'target': 'missing', 'protocol': 'pn'}]
    }
    violations = lint_topology(snap)
    assert any(v['rule'] == 'dangling_edge' and v['severity'] == 'error' for v in violations)
