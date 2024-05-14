from docs_synchronizer import Md2HtmlConverter

def test_given_markdown_str_when_convert_to_html_then_return_html_str():
    # Given
    markdown_str = "# Title"

    # When
    html_str = Md2HtmlConverter().convert(markdown_str)

    # Then
    assert html_str == "<h1>Title</h1>\n"