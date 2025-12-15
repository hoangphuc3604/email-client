from app.api.mail.service import MailService


def test_build_search_pipeline_filters_by_user_and_paths():
    svc = MailService.__new__(MailService)
    pipeline = svc._build_search_pipeline("marketing", "user1", None, limit=10, page=1)
    search_stage = pipeline[0]["$search"]
    compound = search_stage["compound"]
    filters = compound["filter"]
    assert {"equals": {"path": "user_id", "value": "user1"}} in filters
    should = compound["should"]
    paths = [clause["autocomplete"]["path"] for clause in should]
    assert "subject" in paths
    assert "from_name" in paths
    assert "from_email" in paths
    assert "snippet" in paths


def test_build_search_pipeline_adds_label_filter_when_present():
    svc = MailService.__new__(MailService)
    pipeline = svc._build_search_pipeline("abc", "user1", "INBOX", limit=5, page=2)
    filters = pipeline[0]["$search"]["compound"]["filter"]
    assert {"equals": {"path": "labels", "value": "INBOX"}} in filters
    assert pipeline[2]["$sort"] == {"score": -1, "received_on": -1}

