from app.services.drafting import mock


def test_a_stated_period_is_resolved_and_not_asked_again():
    result = mock.generate_clarify_result("The streetlight has been out since 3 months")

    assert result.answers["period"] == "Last 6 months"
    assert "period" not in [q.key for q in result.questions]


def test_a_long_stated_period_buckets_to_more_than_two_years():
    result = mock.generate_clarify_result("This pothole has been there for 5 years")

    assert result.answers["period"] == "More than 2 years"


def test_no_stated_period_still_asks_the_question():
    result = mock.generate_clarify_result("There is a pothole outside my house")

    assert "period" not in result.answers
    assert "period" in [q.key for q in result.questions]


def test_a_named_authority_is_resolved_and_not_asked_again():
    result = mock.generate_clarify_result("PWD has not repaired the road outside my house")

    assert result.answers["knowsAuthority"] == "Yes, I know the department"
    assert "knowsAuthority" not in [q.key for q in result.questions]


def test_no_named_authority_still_asks_the_question():
    result = mock.generate_clarify_result("The road outside my house is broken")

    assert "knowsAuthority" not in result.answers
    assert "knowsAuthority" in [q.key for q in result.questions]


def test_record_type_options_narrow_to_what_the_wording_points_to():
    result = mock.generate_clarify_result("I want to know how much was spent on this repair")

    record_question = next(q for q in result.questions if q.key == mock.RECORD_TYPES_KEY)
    assert record_question.options == ["Budget/expenditure details"]
    assert record_question.multi is True


def test_record_type_options_combine_every_type_the_wording_points_to():
    result = mock.generate_clarify_result("I complained about the cost of the contractor's work order")

    record_question = next(q for q in result.questions if q.key == mock.RECORD_TYPES_KEY)
    assert set(record_question.options) == {
        "Work order for repair",
        "Budget/expenditure details",
        "Correspondence regarding the issue",
    }


def test_record_type_options_fall_back_to_the_full_menu_when_nothing_matches():
    result = mock.generate_clarify_result("The road near my house has a problem")

    record_question = next(q for q in result.questions if q.key == mock.RECORD_TYPES_KEY)
    assert set(record_question.options) == set(mock.RECORD_TYPE_REQUESTS)


def test_everything_resolved_leaves_only_the_record_type_question():
    result = mock.generate_clarify_result("PWD has ignored this pothole since 8 months")

    assert result.answers == {"period": "Last 1 year", "knowsAuthority": "Yes, I know the department"}
    assert [q.key for q in result.questions] == [mock.RECORD_TYPES_KEY]
