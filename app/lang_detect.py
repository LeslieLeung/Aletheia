from langdetect import detect
from langdetect.lang_detect_exception import LangDetectException


def detect_language(text: str) -> str:
    """Return a language code for the given text.

    Returns ``"zh"`` for Chinese text (zh-cn, zh-tw, etc.) and the raw
    langdetect code for everything else (e.g. ``"en"``, ``"fr"``).
    """
    try:
        lang = detect(text)
    except LangDetectException:
        return "en"
    if lang.startswith("zh"):
        return "zh"
    return lang
