"""Tests for the release checker's narrowly scoped screenshot policy."""

import importlib.util
import struct
import sys
import tempfile
import unittest
import zlib
from pathlib import Path
from unittest.mock import patch


SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "check_release.py"
SPEC = importlib.util.spec_from_file_location("release_checker", SCRIPT)
checker = importlib.util.module_from_spec(SPEC)
# Import the checker without creating bytecode files in the release candidate.
old_dont_write_bytecode = sys.dont_write_bytecode
sys.dont_write_bytecode = True
try:
    SPEC.loader.exec_module(checker)
finally:
    sys.dont_write_bytecode = old_dont_write_bytecode

SIGNATURE = b"\x89PNG\r\n\x1a\n"


def chunk(kind, data):
    return (struct.pack(">I", len(data)) + kind + data +
            struct.pack(">I", zlib.crc32(kind + data)))


def png(*, color_type=6, raw=None, extra=b"", tail=b""):
    channels = 4 if color_type == 6 else 3
    header = struct.pack(">IIBBBBB", 2, 1, 8, color_type, 0, 0, 0)
    if raw is None:
        raw = b"\x00" + b"\xff" * (2 * channels)
    return (SIGNATURE + chunk(b"IHDR", header) + extra +
            chunk(b"IDAT", zlib.compress(raw)) + chunk(b"IEND", b"") + tail)


class ScreenshotPngTests(unittest.TestCase):
    def test_valid_rgb_and_rgba_screenshots(self):
        for color_type in (2, 6):
            with self.subTest(color_type=color_type):
                checker.check_screenshot_png(png(color_type=color_type))

    def test_numeric_color_chunk_is_allowed(self):
        checker.check_screenshot_png(png(extra=chunk(b"sRGB", b"\x00")))

    def test_metadata_and_unknown_chunks_are_rejected(self):
        for kind in (b"tEXt", b"iTXt", b"zTXt", b"eXIf", b"iCCP", b"pHYs", b"tIME", b"abCD"):
            with self.subTest(kind=kind):
                with self.assertRaisesRegex(ValueError, "unapproved PNG chunk"):
                    checker.check_screenshot_png(png(extra=chunk(kind, b"example")))

    def test_bad_signature_is_rejected(self):
        with self.assertRaisesRegex(ValueError, "signature"):
            checker.check_screenshot_png(b"!" + png()[1:])

    def test_bad_crc_is_rejected(self):
        data = png()
        with self.assertRaisesRegex(ValueError, "CRC"):
            checker.check_screenshot_png(data[:-1] + bytes([data[-1] ^ 1]))

    def test_truncation_and_trailing_data_are_rejected(self):
        for data in (png()[:-1], png(tail=b"extra")):
            with self.subTest(data=data):
                with self.assertRaises(ValueError):
                    checker.check_screenshot_png(data)

    def test_bad_compressed_stream_is_rejected(self):
        header = struct.pack(">IIBBBBB", 2, 1, 8, 6, 0, 0, 0)
        data = (SIGNATURE + chunk(b"IHDR", header) +
                chunk(b"IDAT", b"not a zlib stream") + chunk(b"IEND", b""))
        with self.assertRaisesRegex(ValueError, "image data"):
            checker.check_screenshot_png(data)

    def test_wrong_decompressed_size_or_filter_is_rejected(self):
        for raw in (b"\x00\xff", b"\x05" + b"\xff" * 8):
            with self.subTest(raw=raw):
                with self.assertRaises(ValueError):
                    checker.check_screenshot_png(png(raw=raw))

    def test_duplicate_header_is_rejected(self):
        header = chunk(b"IHDR", struct.pack(">IIBBBBB", 2, 1, 8, 6, 0, 0, 0))
        with self.assertRaisesRegex(ValueError, "duplicate PNG chunk"):
            checker.check_screenshot_png(png(extra=header))

    def test_rejects_other_binary_files_in_isolated_inventory(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            asset = root / "docs" / "assets" / "application.png"
            asset.parent.mkdir(parents=True)
            asset.write_bytes(png())
            (root / "unexpected.bin").write_bytes(b"\x00binary")
            (root / "notes.txt").write_text("ordinary text", encoding="utf-8")
            with patch.object(checker, "ROOT", root), patch.multiple(
                    checker, failures=[], notes=[], files=[]):
                checker.inventory()
                self.assertEqual(len(checker.failures), 1)
                self.assertIn("unexpected.bin: binary or unreadable", checker.failures[0])
                self.assertTrue(any("screenshot structure" in note for note in checker.notes))
                self.assertEqual([p.name for p, _ in checker.files], ["notes.txt"])

    def test_reports_a_missing_screenshot(self):
        with tempfile.TemporaryDirectory() as directory:
            with patch.object(checker, "ROOT", Path(directory)), patch.multiple(
                    checker, failures=[], notes=[], files=[]):
                checker.inventory()
                self.assertTrue(any("required screenshot is missing" in item
                                    for item in checker.failures))


if __name__ == "__main__":
    unittest.main()
