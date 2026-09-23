#!/usr/bin/env python3
"""Narrow synthetic-fixture tests; never reads/encodes real game assets.

Run once with: python -B scripts/check-webp-encoder.py
Uses only unittest and the encoder's Pillow prerequisites. All fixture/cache
writes are isolated in the OS temp directory, never in the project or public.
"""

import contextlib
import importlib.util
import io
import json
from pathlib import Path
import struct
import sys
import tempfile
import unittest
from unittest import mock
import zlib

sys.dont_write_bytecode = True
spec = importlib.util.spec_from_file_location("webp_encoder", Path(__file__).with_name("encode-webp-assets.py"))
codec = importlib.util.module_from_spec(spec)
spec.loader.exec_module(codec)


def chunk(tag, data):
    return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data))


def with_chunks(data, *chunks):
    return data[:33] + b"".join(chunk(tag, payload) for tag, payload in chunks) + data[33:]


class EncoderTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.env = codec.prerequisites()
        cls.Image, cls.ImageCms, cls.profiles, cls.encoder = cls.env

    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="webp-encoder-check-")
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name).resolve()
        self.public = self.root / "public"
        self.graphics = self.public / "game-assets" / "graphics"
        self.graphics.mkdir(parents=True)
        self.cache = self.root / "cache"
        self.manifest = self.cache / "manifest.json"

    def image_bytes(self, image=None, format="PNG", **kwargs):
        if image is None:
            image = self.Image.new("RGBA", (80, 64))
            image.putdata([((x * 19) % 256, (y * 29) % 256, 123,
                            0 if x % 3 == 0 else (101 if y % 3 == 0 else 255))
                           for y in range(64) for x in range(80)])
        stream = io.BytesIO()
        if format == "PNG":
            kwargs.setdefault("compress_level", 0)
        image.save(stream, format=format, **kwargs)
        return stream.getvalue()

    def write(self, name, data):
        path = self.graphics / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)
        return path

    def run_encoder(self):
        return codec.run(self.public, self.cache, self.manifest, self.env)

    def assert_pixels(self, source_data, entry):
        payload = Path(entry["cacheFile"]).read_bytes()
        with self.Image.open(io.BytesIO(source_data)) as original, self.Image.open(io.BytesIO(payload)) as result:
            self.assertEqual(original.size, result.size)
            self.assertEqual(original.convert("RGBA").tobytes(), result.convert("RGBA").tobytes())
            self.assertEqual(entry["pixelSha256"], codec.sha256(result.convert("RGBA").tobytes()))
        self.assertLess(len(payload), len(source_data))
        self.assertEqual(entry["bytes"], len(payload))
        self.assertEqual(entry["sha256"], codec.sha256(payload))
        self.assertEqual(entry["sourceSha256"], codec.sha256(source_data))
        self.assertTrue(Path(entry["cacheFile"]).is_absolute())
        self.assertTrue(codec.inside(Path(entry["cacheFile"]).resolve(), self.cache))
        self.assertRegex(Path(entry["cacheFile"]).name, r"^[0-9a-f]{64}\.webp$")
        self.assertTrue(codec.lossless_webp_container(payload))

    def test_rgba_hidden_rgb_palette_alpha_and_no_source_writes(self):
        rgba = self.image_bytes()
        palette = self.Image.new("P", (80, 64))
        palette.putpalette([value for index in range(256) for value in (index, 255 - index, index // 2)])
        palette.putdata([index % 16 for index in range(80 * 64)])
        paletted = self.image_bytes(palette, transparency=bytes([0, 30, 90, 255] * 64))
        files = {self.write("nested/透明.PNG", rgba): rgba, self.write("palette.png", paletted): paletted}
        before = {p.relative_to(self.public).as_posix(): p.read_bytes() for p in self.public.rglob("*") if p.is_file()}
        result = self.run_encoder()
        self.assertEqual(result["summary"]["converted"], 2)
        self.assertEqual(result["schema"], 1)
        self.assertEqual(json.loads(self.manifest.read_bytes()), result)
        for entry in result["images"]:
            self.assert_pixels(files[self.public / entry["source"]], entry)
            self.assertEqual(entry["destination"], entry["source"] + ".webp")
            self.assertNotIn("\\", entry["source"])
            self.assertEqual(entry["colorPolicy"], "untagged-assume-srgb")
            self.assertIsNone(entry["iccSha256"])
        after = {p.relative_to(self.public).as_posix(): p.read_bytes() for p in self.public.rglob("*") if p.is_file()}
        self.assertEqual(before, after)
        self.assertEqual(result["summary"]["sourceBytes"] - result["summary"]["outputBytes"], result["summary"]["savedBytes"])

    def test_png_and_progressive_jpeg_icc_exif_xmp(self):
        exif = self.Image.Exif()
        exif[274], exif[315] = 6, "Fixture author"
        icc = self.profiles[0]
        xmp = b'<x:xmpmeta xmlns:x="adobe:ns:meta/"><dc:rights>Fixture license</dc:rights></x:xmpmeta>'
        from PIL.PngImagePlugin import PngInfo
        info = PngInfo()
        info.add_itxt("XML:com.adobe.xmp", xmp.decode("utf-8"))
        png = self.image_bytes(icc_profile=icc, exif=exif, pnginfo=info)
        jpg = self.image_bytes(self.Image.new("RGB", (128, 80), (22, 61, 83)), format="JPEG",
                               quality=93, progressive=True, icc_profile=icc, exif=exif, xmp=xmp)
        files = {"same.png": png, "same.JPEG": jpg}
        for name, data in files.items():
            self.write(name, data)
        result = self.run_encoder()
        self.assertEqual(result["summary"]["converted"], 2, result["skipped"])
        self.assertEqual(len({entry["destination"] for entry in result["images"]}), 2)
        for entry in result["images"]:
            self.assert_pixels(files[Path(entry["source"]).name], entry)
            self.assertEqual(entry["orientation"], 6)
            self.assertEqual(entry["colorPolicy"], "embedded-rgb-icc-preserved")
            with self.Image.open(entry["cacheFile"]) as image:
                self.assertEqual(image.size, (128, 80) if entry["source"].endswith(".JPEG") else (80, 64))
                self.assertEqual(image.info["icc_profile"], icc)
                self.assertEqual(codec.exif_payload(image.info["exif"]), codec.exif_payload(exif.tobytes()))
                self.assertEqual(image.getexif()[274], 6)  # No orientation baking/double rotation.
                self.assertEqual(image.info["xmp"], xmp)

    def test_standard_srgb_chromaticity_gamma_and_intent_policy(self):
        original = self.image_bytes()
        chroma = (b"cHRM", struct.pack(">8I", *codec.SRGB_CHROMATICITY))
        gamma = (b"gAMA", struct.pack(">I", 45455))
        self.write("chroma.png", with_chunks(original, chroma))
        self.write("gamma.png", with_chunks(original, gamma, chroma))
        self.write("intent.png", with_chunks(original, (b"sRGB", b"\x02"), gamma, chroma))
        result = self.run_encoder()
        self.assertEqual(result["summary"]["converted"], 3, result["skipped"])
        for entry in result["images"]:
            name = Path(entry["source"]).name
            expected = self.profiles["gamma45455"] if name == "gamma.png" else self.profiles[2 if name == "intent.png" else 0]
            self.assertEqual(entry["iccSha256"], codec.sha256(expected))
            self.assertEqual(entry["colorPolicy"], "standard-png-gamma-chromaticity-to-icc" if name == "gamma.png"
                             else "standard-srgb-metadata-to-icc")
            self.assert_pixels((self.public / entry["source"]).read_bytes(), entry)
            self.ImageCms.ImageCmsProfile(io.BytesIO(expected))
        self.assertEqual(codec.prerequisites()[3], self.encoder)  # Timestamp-independent profile keys.
        gamma_profile = self.profiles["gamma45455"]
        count = struct.unpack_from(">I", gamma_profile, 128)[0]
        for index in range(count):
            tag, offset, _ = struct.unpack_from(">4sII", gamma_profile, 132 + index * 12)
            if tag == b"rTRC":
                self.assertEqual(struct.unpack_from(">H", gamma_profile, offset + 8)[0], 0)
                self.assertAlmostEqual(struct.unpack_from(">I", gamma_profile, offset + 12)[0] / 65536, 100000 / 45455, places=4)
                break
        else:
            self.fail("Missing gamma TRC")

    def test_unsupported_inputs_keep_original(self):
        original = self.image_bytes()
        chroma = list(codec.SRGB_CHROMATICITY)
        chroma[0] += 1
        highbit = self.image_bytes(self.Image.new("I;16", (8, 8), 1025))
        animated = self.image_bytes(self.Image.new("RGBA", (16, 16), "red"), save_all=True,
                                    append_images=[self.Image.new("RGBA", (16, 16), "blue")], duration=100, loop=0)
        cases = {
            "animated.png": (animated, "animation"),
            "highbit.png": (highbit, "high_bit_depth"),
            "gamma.png": (with_chunks(original, (b"gAMA", struct.pack(">I", 100000))), "non_srgb_gamma"),
            "chroma.png": (with_chunks(original, (b"cHRM", struct.pack(">8I", *chroma))), "non_srgb_chromaticity"),
            "hdr.png": (with_chunks(original, (b"cICP", bytes((9, 16, 0, 1)))), "unsupported_hdr_color_metadata"),
            "cmyk.jpg": (self.image_bytes(self.Image.new("CMYK", (16, 16)), format="JPEG"), "unsupported_pixel_mode"),
            "format.jpg": (original, "format_mismatch"),
            "rights.png": (with_chunks(original, (b"tEXt", b"Copyright\x00Fixture license")), "attribution_metadata"),
        }
        for name, (data, _) in cases.items():
            self.write(name, data)
        self.write("ignored.txt", b"not an image")
        self.write("ignored.webp", b"not scanned")
        result = self.run_encoder()
        self.assertEqual(result["images"], [])
        self.assertEqual(result["summary"]["scanned"], len(cases))
        reasons = {Path(entry["source"]).name: entry["reason"] for entry in result["skipped"]}
        self.assertEqual(reasons, {name: reason for name, (_, reason) in cases.items()})
        for name, (data, _) in cases.items():
            self.assertEqual((self.graphics / name).read_bytes(), data)
        self.assertEqual(result["summary"]["savedBytes"], 0)

    def test_malformed_crc_bounds_jpeg_precision_and_icc(self):
        original = self.image_bytes()
        bad_crc = bytearray(original)
        bad_crc[29] ^= 1
        self.write("crc.png", bytes(bad_crc))
        self.write("bounds.png", original[:-2])
        self.write("jpeg-bounds.jpg", b"\xff\xd8\xff\xe1\xff\xfftruncated")
        self.write("precision.jpg", b"\xff\xd8\xff\xc0\x00\x08\x0c\x00\x08\x00\x08\x01")
        self.write("icc.png", with_chunks(original, (b"iCCP", b"broken\x00\x00bad zlib")))
        profile = bytearray(self.profiles[0])
        profile[16:20] = b"GRAY"
        self.write("gray-icc.png", self.image_bytes(icc_profile=bytes(profile)))
        result = self.run_encoder()
        self.assertEqual(result["images"], [])
        self.assertEqual({Path(entry["source"]).name: entry["reason"] for entry in result["skipped"]}, {
            "crc.png": "invalid_png_crc", "bounds.png": "invalid_png_bounds",
            "jpeg-bounds.jpg": "invalid_jpeg_bounds", "precision.jpg": "high_bit_depth",
            "icc.png": "invalid_icc", "gray-icc.png": "unsupported_icc_color_space",
        })

    def test_no_enlargement_and_destination_collision(self):
        # Tiny PNG + explicit sRGB requires an ICC that cannot fit more compactly.
        tiny = self.image_bytes(self.Image.new("RGB", (1, 1), "red"), compress_level=9)
        tiny = with_chunks(tiny, (b"sRGB", b"\x00"))
        self.write("tiny.png", tiny)
        self.write("collision.png", self.image_bytes())
        self.write("collision.png.webp", b"original pre-existing webp asset")
        result = self.run_encoder()
        self.assertEqual(result["images"], [])
        self.assertEqual({item["reason"] for item in result["skipped"]}, {"not_smaller", "destination_exists"})
        self.assertEqual(result["summary"]["savedBytes"], 0)
        self.assertFalse((self.cache / "payloads").exists())

    def test_cache_reuse_verification_corruption_and_source_invalidation(self):
        source = self.write("asset.png", self.image_bytes())
        first = self.run_encoder()["images"][0]
        payload = Path(first["cacheFile"])
        record_path = self.cache / "records" / (first["cacheKey"] + ".json")
        with mock.patch.object(codec, "encode_image", side_effect=AssertionError("cache hit must not encode")):
            with mock.patch.object(codec, "verify_webp", wraps=codec.verify_webp) as verify:
                second = self.run_encoder()["images"][0]
                self.assertEqual(verify.call_count, 1)
        self.assertTrue(second["cacheHit"])
        self.assertEqual({k: v for k, v in first.items() if k != "cacheHit"},
                         {k: v for k, v in second.items() if k != "cacheHit"})
        for corruption in ("payload-hash", "record-json", "pixels-with-matching-hash"):
            with self.subTest(corruption=corruption):
                if corruption == "payload-hash":
                    payload.write_bytes(b"invalid cached payload")
                elif corruption == "record-json":
                    record_path.write_text("not json", encoding="utf-8")
                else:
                    stream = io.BytesIO()
                    self.Image.new("RGBA", (80, 64), "magenta").save(stream, format="WEBP", **codec.SETTINGS)
                    wrong_pixels = stream.getvalue()
                    payload.write_bytes(wrong_pixels)
                    record = json.loads(record_path.read_bytes())
                    record.update({"sha256": codec.sha256(wrong_pixels), "bytes": len(wrong_pixels)})
                    record_path.write_bytes(codec.canonical_json(record))
                with mock.patch.object(codec, "encode_image", wraps=codec.encode_image) as encode:
                    rebuilt = self.run_encoder()["images"][0]
                    self.assertEqual(encode.call_count, 1)
                    self.assertFalse(rebuilt["cacheHit"])
                    self.assert_pixels(source.read_bytes(), rebuilt)
        source.write_bytes(self.image_bytes(self.Image.new("RGBA", (80, 64), (75, 49, 101, 0))))
        changed = self.run_encoder()["images"][0]
        self.assertNotEqual(first["sourceSha256"], changed["sourceSha256"])
        self.assertNotEqual(first["cacheFile"], changed["cacheFile"])
        self.assertTrue(payload.exists())  # No deletion/eviction of prior payloads.
        changed_settings = {**self.encoder, "settings": {**codec.SETTINGS, "method": 5}}
        self.assertNotEqual(codec.cache_key(changed["sourceSha256"], self.encoder),
                            codec.cache_key(changed["sourceSha256"], changed_settings))

    def test_failed_decoded_verification_keeps_original(self):
        self.write("asset.png", self.image_bytes())
        with mock.patch.object(codec, "verify_webp", return_value=False):
            result = self.run_encoder()
        self.assertEqual(result["images"], [])
        self.assertEqual(result["skipped"][0]["reason"], "webp_verification_failed")
        self.assertFalse((self.cache / "payloads").exists())

    def test_refuse_unsafe_paths_before_writing(self):
        cases = [
            ("relative-public", self.cache, self.manifest),
            (self.public, self.public / "cache", self.public / "cache" / "manifest.json"),
            (self.public, self.cache, self.public / "manifest.json"),
            (self.public, self.cache, self.root / "outside.json"),
            (self.public, self.root, self.root / "manifest.json"),
            (self.public, self.cache, self.cache / "records" / "manifest.json"),
        ]
        for public, cache, manifest in cases:
            with self.subTest(public=public, cache=cache, manifest=manifest):
                with self.assertRaises(codec.EncoderError):
                    codec.run(public, cache, manifest, self.env)
        self.assertFalse(self.cache.exists())
        with self.assertRaises(codec.EncoderError):
            codec.atomic_write(self.public / "no.json", b"no", self.cache)
        self.assertFalse((self.public / "no.json").exists())

    def test_atomic_failure_keeps_previous_manifest_and_cleans_own_temp(self):
        self.cache.mkdir()
        self.manifest.write_bytes(b"previous manifest")
        with mock.patch.object(codec.os, "replace", side_effect=OSError("simulated interruption")):
            with self.assertRaises(OSError):
                codec.atomic_write(self.manifest, b"replacement", self.cache)
        self.assertEqual(self.manifest.read_bytes(), b"previous manifest")
        self.assertEqual(list(self.cache.iterdir()), [self.manifest])

    def test_symlink_escape_is_refused(self):
        self.cache.mkdir()
        try:
            (self.cache / "payloads").symlink_to(self.public, target_is_directory=True)
        except (OSError, NotImplementedError):
            self.skipTest("OS does not grant symlink creation permission")
        self.write("asset.png", self.image_bytes())
        with self.assertRaises(codec.EncoderError):
            self.run_encoder()
        self.assertFalse(self.manifest.exists())
        self.assertFalse(any(self.public.glob("*.webp")))

    def test_prerequisite_error_and_short_cli_summary(self):
        from PIL import features
        real_check = features.check
        with mock.patch.object(features, "check", side_effect=lambda name: False if name == "webp" else real_check(name)):
            with self.assertRaisesRegex(codec.EncoderError, r"webp.*pip install"):
                codec.prerequisites()
        self.write("fixture.png", self.image_bytes())
        stdout, stderr = io.StringIO(), io.StringIO()
        with contextlib.redirect_stdout(stdout), contextlib.redirect_stderr(stderr):
            result = codec.main(["--public", str(self.public), "--cache", str(self.cache), "--manifest", str(self.manifest)])
        self.assertEqual(result, 0)
        self.assertEqual(stderr.getvalue(), "")
        self.assertEqual(len(stdout.getvalue().splitlines()), 1)
        self.assertIn("1 scanned, 1 converted", stdout.getvalue())


if __name__ == "__main__":
    unittest.main(verbosity=1)
