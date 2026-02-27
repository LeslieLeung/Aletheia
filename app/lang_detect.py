from lingua import Language, LanguageDetectorBuilder

_detector = LanguageDetectorBuilder.from_all_languages().build()


def detect_language(text: str) -> str:
    """Return a language code for the given text.

    Returns ``"zh"`` for Chinese text and the ISO 639-1 code for everything
    else (e.g. ``"en"``, ``"fr"``). Falls back to ``"en"`` when detection
    is not reliable.
    """
    language = _detector.detect_language_of(text)
    if language is None:
        return "en"
    if language == Language.CHINESE:
        return "zh"
    return language.iso_code_639_1.name.lower()
