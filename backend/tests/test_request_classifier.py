from app.services.request_classifier import is_status_request


def test_a_status_question_is_a_status_request():
    assert is_status_request("Current status of my complaint about this pothole")


def test_a_records_request_is_not_a_status_request():
    assert not is_status_request("Copy of the work order sanctioning repair of the road")


def test_matching_is_case_insensitive_and_ignores_punctuation():
    assert is_status_request("Has my grievance been RESOLVED?")


def test_an_unrelated_title_is_not_a_status_request():
    assert not is_status_request("Details of amount spent on the repair")


def test_a_procedure_question_naming_grievance_is_not_a_status_request():
    """A question about PWD's published grievance-handling procedure is a records request
    (it can genuinely live in the static corpus), not a request about one case's progress."""
    assert not is_status_request("Grievance redressal mechanism for works")
    assert not is_status_request("Copy of the complaint handling procedure")


def test_my_case_phrasing_is_a_status_request_even_without_a_keyword():
    assert is_status_request("What happened to my complaint")
    assert is_status_request("Update on my grievance")
