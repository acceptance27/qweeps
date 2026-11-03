from assistant.visual.alignment import script_word_times, tokens, detect_language


def test_spoken_numbers_match_digit_transcripts():
    assert tokens("zero point seven") == tokens("0.7") == ["0", "7"]
    assert tokens("minus zero point five") == tokens("minus 0.5") == ["minus", "0", "5"]


def test_spoken_number_script_aligns_to_digit_words():
    script = "The first two is scaled by plus zero point seven to make one point four."
    words = [("the", 0.0), ("first", 0.2), ("2", 0.4), ("is", 0.6),
             ("scaled", 0.8), ("by", 1.0), ("plus", 1.2), ("0", 1.4),
             ("7", 1.6), ("to", 1.8), ("make", 2.0), ("1", 2.2), ("4", 2.4)]
    alignment = {"words": [{"text": text, "start": at, "end": at + 0.15}
                           for text, at in words]}
    times, coverage = script_word_times(script, alignment, 3.0)
    assert coverage == 1.0
    assert all(time is not None for time in times)


def test_detect_language():
    assert detect_language("The system produces clear visual diagrams.") == "en"
    assert detect_language("Uumpisahan natin sa pinili ni Rizal na kaso ayon sa mga tala.") == "tl"
    assert detect_language("En el libro de Morga sobre las islas de Filipinas.") == "es"


def test_multilingual_compounded_and_phonetic_alignment():
    # Tests matching when Whisper contracts words ('nakaso' for 'na kaso'),
    # splits words ('ebidin siya' for 'ebidensya'), and has slight phonetic differences.
    script = "Uumpisahan natin sa pinili ni Rizal na kaso tungkol sa pananaw at ebidensya."
    # Heard words from STT:
    # 'nakaso' combines 'na' + 'kaso'
    # 'panano' is phonetic variant of 'pananaw'
    # 'ebidin', 'siya' splits 'ebidensya'
    words = [
        ("Uumpisahan", 0.0), ("natin", 0.3), ("sa", 0.5), ("pinili", 0.7),
        ("ni", 0.9), ("Rizal", 1.1), ("nakaso", 1.4), ("tungkol", 1.8),
        ("sa", 2.1), ("panano", 2.3), ("at", 2.6), ("ebidin", 2.8), ("siya", 3.0)
    ]
    alignment = {"words": [{"text": t, "start": s, "end": s + 0.2} for t, s in words]}
    times, coverage = script_word_times(script, alignment, 3.5)
    assert coverage >= 0.85
    assert all(t is not None for t in times)

