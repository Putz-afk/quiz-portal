# This is a simple test just to prove the CI works
def test_math_works():
    assert 1 + 1 == 2

def test_config_structure():
    # Verify we aren't doing something crazy
    x = {"mode": "topic"}
    assert "mode" in x