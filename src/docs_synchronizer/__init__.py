import markdown2

class Md2HtmlConverter:
    def convert(self, markdown_str: str) -> str:
        return markdown2.markdown(markdown_str)