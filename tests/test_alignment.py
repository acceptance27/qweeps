from assistant.visual.alignment import script_word_times, tokens


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
