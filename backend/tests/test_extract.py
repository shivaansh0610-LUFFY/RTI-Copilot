import pytest
from corpus_support import clause, make_pdf

from ingest.extract import (
    MAX_CHARS,
    MIN_CHARS,
    TARGET_CHARS,
    ExtractionError,
    extract_pages,
    html_text,
    split_paragraphs,
)


# --- split_paragraphs -------------------------------------------------------------------------


def test_empty_page_has_no_paragraphs():
    assert split_paragraphs("") == []
    assert split_paragraphs("  \n\n \n") == []


def test_short_page_is_one_paragraph_with_lines_joined():
    page = "(1) A person who desires\nto obtain information\nshall make a request."
    assert split_paragraphs(page) == ["(1) A person who desires to obtain information shall make a request."]


def test_clauses_are_split_apart_once_they_are_big_enough():
    first, second, third = clause("a", 400), clause("b", 400), clause("c", 400)
    # No blank lines, like pypdf's output: the clause markers are the only structure.
    page = "\n".join([first, second, third])

    assert split_paragraphs(page) == [first, second, third]


def test_small_clauses_are_merged_into_one_paragraph():
    page = "(a) first thing;\n(b) second thing;\n(c) third thing."

    assert split_paragraphs(page) == ["(a) first thing; (b) second thing; (c) third thing."]


@pytest.mark.parametrize(
    "marker", ["(e) word", "(iv) word", "(12) word", "10.8 word", "10.8.1 word", "6. word", "(a)"]
)
def test_clause_markers_start_a_new_piece(marker):
    before, after = clause("z", TARGET_CHARS - 20), marker + " " + "x" * (TARGET_CHARS // 2)

    paragraphs = split_paragraphs(before + "\n" + after)

    assert len(paragraphs) == 2
    assert paragraphs[1].startswith(marker)


def test_blank_lines_separate_pieces_too():
    first, second = "x" * (TARGET_CHARS - 100), "y" * (TARGET_CHARS - 100)

    assert split_paragraphs(f"{first}\n\n{second}") == [first, second]


def test_a_long_unbroken_page_is_cut_at_sentence_ends_under_the_limit():
    sentence = "The authority shall dispose of the request within thirty days. "
    page = "\n".join([sentence * 12] * 4)  # no clause markers, nothing but sentences

    paragraphs = split_paragraphs(page)

    assert len(paragraphs) > 1
    assert all(len(paragraph) <= MAX_CHARS for paragraph in paragraphs)
    assert all(paragraph.endswith("days.") for paragraph in paragraphs)  # cut between sentences
    assert " ".join(paragraphs) == " ".join(page.split())  # nothing lost, nothing repeated


def test_one_enormous_word_run_is_still_cut():
    paragraphs = split_paragraphs("word " * 1000)

    assert all(len(paragraph) <= MAX_CHARS for paragraph in paragraphs)
    assert " ".join(paragraphs).split() == ["word"] * 1000


def test_a_page_number_is_merged_into_the_text_that_follows():
    # Page 12 of the RTI Act starts with its number, then a clause that only just fits.
    page = "12\n" + clause("a", TARGET_CHARS - 1)

    paragraphs = split_paragraphs(page)

    assert len(paragraphs) == 1
    assert paragraphs[0].startswith("12 (a)")
    assert len(paragraphs[0]) <= MAX_CHARS


def test_a_page_with_only_a_number_has_no_paragraphs():
    assert split_paragraphs("16\n") == []


def test_short_paragraph_is_kept_when_it_follows_a_full_one():
    full, tail = clause("a", TARGET_CHARS - 10), "(b) Short but real."
    assert len(tail) < MIN_CHARS

    assert split_paragraphs(full + "\n" + tail) == [full, tail]


def test_text_that_postgres_cannot_store_is_cleaned():
    page = "(a) before\x00after \x01bullet\n(b) lone \ud800 surrogate"

    paragraphs = split_paragraphs(page)

    text = " ".join(paragraphs)
    assert "\x00" not in text and "\x01" not in text
    assert "\ud800" not in text
    assert "before after" in text and "bullet" in text
    text.encode("utf-8")  # what psycopg does before sending it


def test_paragraph_sizes_on_realistic_text():
    page = "\n".join(clause(str(index), 120 + index * 7) for index in range(1, 40))

    paragraphs = split_paragraphs(page)

    assert all(len(paragraph) <= MAX_CHARS for paragraph in paragraphs)
    assert all(len(paragraph) >= MIN_CHARS for paragraph in paragraphs[:-1])
    assert all(len(paragraph) <= TARGET_CHARS for paragraph in paragraphs)


# --- extract_pages ----------------------------------------------------------------------------


def test_pdf_pages_come_back_in_order(tmp_path):
    path = tmp_path / "act.pdf"
    path.write_bytes(make_pdf([["First page line one", "line two"], [], ["Third page"]]))

    pages = extract_pages(path)

    assert len(pages) == 3
    assert "First page line one" in pages[0] and "line two" in pages[0]
    assert pages[1].strip() == ""
    assert "Third page" in pages[2]


def test_pdf_with_parentheses_in_the_text(tmp_path):
    path = tmp_path / "act.pdf"
    path.write_bytes(make_pdf([["Section 4(1)(b) of the Act"]]))

    assert "4(1)(b)" in extract_pages(path)[0]


def test_a_file_that_is_not_a_pdf_is_reported(tmp_path):
    path = tmp_path / "broken.pdf"
    path.write_bytes(b"this is not a pdf at all")

    with pytest.raises(ExtractionError, match="broken.pdf"):
        extract_pages(path)


def test_unsupported_file_types_are_reported(tmp_path):
    path = tmp_path / "scan.png"
    path.write_bytes(b"\x89PNG")

    with pytest.raises(ExtractionError, match="unsupported file type .png"):
        extract_pages(path)


def test_missing_file_is_an_os_error(tmp_path):
    with pytest.raises(OSError):
        extract_pages(tmp_path / "missing.pdf")


# --- HTML -------------------------------------------------------------------------------------

PAGE = b"""<html><head><title>Site title</title><style>p {color: red}</style></head>
<body>
<nav><a href="/">Home</a><a href="/about">About Us</a></nav>
<header>Toll free 1908</header>
<script>var tracking = 1;</script>
<h1>MANUAL - 5</h1>
<p>Rules and manuals for discharging <b>functions</b>.</p>
<table>
  <tr><th>S. No.</th><th>Name of the manual</th></tr>
  <tr><td>3</td><td>CPWD Works Manual 2014</td></tr>
  <tr><td>4</td><td>CPWD Maintenance Manual 2012</td></tr>
</table>
<div class="modal"><div>List of Cheque DDO's</div></div>
<footer>copyright Sparx IT</footer>
</body></html>"""


def test_html_keeps_the_content_and_drops_the_page_chrome():
    text = html_text(PAGE)

    for kept in ["MANUAL - 5", "Rules and manuals for discharging", "CPWD Works Manual 2014"]:
        assert kept in text
    for dropped in ["Home", "About Us", "Toll free", "tracking", "color: red", "Site title", "DDO", "Sparx"]:
        assert dropped not in text


def test_html_table_rows_stay_on_one_line():
    paragraphs = split_paragraphs(html_text(PAGE))

    assert len(paragraphs) == 1
    assert "3 | CPWD Works Manual 2014 4 | CPWD Maintenance Manual 2012" in paragraphs[0]
    assert "S. No. | Name of the manual" in paragraphs[0]


def test_html_file_is_a_single_page(tmp_path):
    path = tmp_path / "page.html"
    path.write_bytes(PAGE)

    assert extract_pages(path) == [html_text(PAGE)]


def test_html_in_another_encoding_is_decoded(tmp_path):
    path = tmp_path / "page.htm"
    path.write_bytes('<html><head><meta charset="utf-8"></head><body><p>नमस्ते Delhi</p></body></html>'.encode())

    assert "नमस्ते Delhi" in extract_pages(path)[0]
