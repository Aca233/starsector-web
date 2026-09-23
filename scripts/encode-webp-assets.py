#!/usr/bin/env python3
"""Encode original public assets into an isolated, verified lossless WebP cache.

Prerequisites: Python >= 3.10; Pillow >= 12.1 with libwebp and LittleCMS2.
    python -m pip install --upgrade "Pillow>=12.1"
Usage (all relative cache/manifest paths are resolved against the caller's cwd):
    python scripts/encode-webp-assets.py --public ABS_PUBLIC --cache CACHE \
        --manifest CACHE/manifest.json

Only the cache is written. Sources and destination URLs are never written. The
schema-1 manifest lists only strictly smaller, decoded-RGBA-identical WebPs in
images; skipped sources remain original. destination = source + '.webp'.

Color policy: never transform pixel samples or apply EXIF orientation. Preserve
RGB ICC verbatim and EXIF TIFF payload/orientation (the optional Exif\\0\\0 wrapper
is container-specific). Untagged images remain untagged (browser sRGB default).
Explicit PNG sRGB or standard sRGB cHRM is represented by an embedded sRGB ICC,
with sRGB rendering intent preserved. A lone nominal-sRGB gAMA=45455 (optionally
with standard cHRM) uses those primaries with its power-law TRC, not the subtly
different sRGB transfer curve; no samples are transformed. Nonstandard gAMA/cHRM, HDR color
chunks, non-RGB ICC, high bit depth, CMYK, and animation retain the original.
JPEG losslessness is relative to Pillow's decoded original, NOT its JPEG stream;
decoder versions participate in the cache key. Metadata other than ICC/EXIF/XMP
is not migrated; detected attribution and opaque Photoshop metadata cause a skip.

Cache layout: payloads/<key>.webp and records/<key>.json. key is SHA256 of the
canonical JSON {sourceSha256, encoder}; encoder includes implementation, library
versions, settings, and generated color-profile hashes. Every cache hit re-reads
and hashes the source and payload, validates the record, and decodes/compares
pixels, dimensions, ICC, EXIF, orientation and XMP. Invalid entries are rebuilt.
The final manifest is atomic; fatal path/I/O errors exit 1 without publishing a
new manifest. Per-image unsupported/decode/encode cases go in skipped[]. No
cache eviction, recursive deletion, build integration, or application imports.
"""

import argparse
import hashlib
import io
import json
import os
from pathlib import Path
import re
import struct
import sys
import tempfile
import warnings
import zlib


IMPLEMENTATION_VERSION = 1
SETTINGS = {"lossless": True, "exact": True, "quality": 75, "method": 4}
PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"
SRGB_CHROMATICITY = (31270, 32900, 64000, 33000, 30000, 60000, 15000, 6000)
ATTRIBUTION = re.compile(rb"copyright|author|licen[cs]e|(?:dc:|xmp)rights", re.I)


class EncoderError(Exception):
    """Fatal prerequisites, configuration, or cache I/O error."""


class SkipImage(Exception):
    """Stable machine-readable per-image reason."""


def sha256(data):
    return hashlib.sha256(data).hexdigest()


def canonical_json(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"),
                      ensure_ascii=True, allow_nan=False).encode("utf-8")


def png_gamma_profile(srgb_profile):
    """Keep sRGB/D50-adapted primaries; express PNG's 1/gAMA decoding exponent."""
    profile = bytearray(srgb_profile)
    count = struct.unpack_from(">I", profile, 128)[0]
    replaced = set()
    for index in range(count):
        tag, offset, size = struct.unpack_from(">4sII", profile, 132 + index * 12)
        if tag in (b"rTRC", b"gTRC", b"bTRC"):
            if size < 16 or offset + size > len(profile):
                raise ValueError("Unexpected LittleCMS TRC layout")
            # ICC parametricCurveType function 0: Y = X**g, signed 16.16 g.
            curve = struct.pack(">4sIHHI", b"para", 0, 0, 0,
                                round((100000 / 45455) * 65536))
            profile[offset:offset + size] = curve + bytes(size - len(curve))
            replaced.add(tag)
    if len(replaced) != 3:
        raise ValueError("Missing RGB TRC tags in LittleCMS profile")
    return bytes(profile)


def prerequisites():
    install = 'Run this Python interpreter with -m pip install --upgrade "Pillow>=12.1" (use an official wheel).'
    if sys.version_info < (3, 10):
        raise EncoderError("Python 3.10 or newer is required. " + install)
    try:
        import PIL
        from PIL import Image, ImageCms, features
    except ImportError as exc:
        raise EncoderError("Pillow with WebP and LittleCMS2 is required. " + install) from exc
    version = tuple(int(x) for x in re.findall(r"\d+", PIL.__version__)[:2])
    if version < (12, 1):
        raise EncoderError("Pillow >=12.1 is required for this encoder's exact-alpha contract. " + install)
    missing = [name for name in ("webp", "littlecms2", "jpg", "zlib") if not features.check(name)]
    if missing:
        raise EncoderError("Pillow is missing required codec support: " + ", ".join(missing) + ". " + install)
    Image.init()
    if "WEBP" not in Image.SAVE or "WEBP" not in Image.OPEN:
        raise EncoderError("Pillow cannot both read and write WebP. " + install)
    try:
        profile = bytearray(ImageCms.ImageCmsProfile(ImageCms.createProfile("sRGB")).tobytes())
        # LittleCMS stamps creation time; normalize it for reproducible cache keys.
        profile[24:36] = struct.pack(">6H", 2000, 1, 1, 0, 0, 0)
        profile[84:100] = bytes(16)  # Optional profile ID: unspecified after edits.
        profiles = {}
        for intent in range(4):
            profile[64:68] = struct.pack(">I", intent)
            profiles[intent] = bytes(profile)
        profiles["gamma45455"] = png_gamma_profile(profiles[0])
        encoder = {
            "name": "pillow-libwebp-lossless",
            "implementationVersion": IMPLEMENTATION_VERSION,
            "pillow": PIL.__version__,
            "libwebp": features.version("webp"),
            "libjpeg": features.version("jpg"),
            "libjpegTurbo": features.version_feature("libjpeg_turbo"),
            "zlib": features.version("zlib"),
            "littlecms2": features.version("littlecms2"),
            "settings": dict(SETTINGS),
            "pixelVerification": "unoriented-decoded-RGBA8-exact",
            "colorPolicyVersion": 1,
            "colorProfileSha256": {str(k): sha256(v) for k, v in profiles.items()},
        }
    except (OSError, ValueError, AttributeError) as exc:
        raise EncoderError("Pillow color-profile support is unusable. " + install) from exc
    return Image, ImageCms, profiles, encoder


def inside(path, root):
    return path == root or root in path.parents


def absolute(path):
    return Path(os.path.abspath(os.fspath(path)))


def checked_paths(public, cache, manifest):
    public_arg = Path(public)
    if not public_arg.is_absolute():
        raise EncoderError("--public must be an absolute directory path.")
    public_lexical, cache_lexical, manifest_lexical = map(absolute, (public, cache, manifest))
    public, cache, manifest = (p.resolve() for p in (public_lexical, cache_lexical, manifest_lexical))
    if not public.is_dir():
        raise EncoderError("--public must name an existing directory.")
    if (inside(cache, public) or inside(public, cache)
            or inside(cache_lexical, public_lexical) or inside(public_lexical, cache_lexical)):
        raise EncoderError("--cache must be isolated: it cannot be inside or contain --public.")
    if inside(manifest, public) or inside(manifest_lexical, public_lexical):
        raise EncoderError("--manifest must not be under --public.")
    if not inside(manifest, cache) or manifest == cache:
        raise EncoderError("--manifest must be a JSON file inside --cache.")
    if manifest.suffix.lower() != ".json":
        raise EncoderError("--manifest must have a .json extension.")
    if any(inside(manifest, cache / name) for name in ("payloads", "records")):
        raise EncoderError("--manifest must not use the reserved payloads/ or records/ directories.")
    graphics = public / "game-assets" / "graphics"
    if not graphics.is_dir() or linked(graphics) or linked(graphics.parent) or not inside(graphics.resolve(), public):
        raise EncoderError("--public must contain a real game-assets/graphics directory (no symlink/junction).")
    if cache.exists() and not cache.is_dir():
        raise EncoderError("--cache is not a directory.")
    if manifest.exists() and not manifest.is_file():
        raise EncoderError("--manifest is not a file.")
    return public, cache, manifest, graphics


def checked_cache_path(path, cache):
    path = absolute(path)
    if cache.resolve() != cache or not inside(path, cache) or not inside(path.resolve(), cache) or path == cache:
        raise EncoderError("Refusing a write/read outside the resolved cache: " + str(path))
    return path


def atomic_write(path, data, cache):
    path = checked_cache_path(path, cache)
    path.parent.mkdir(parents=True, exist_ok=True)
    checked_cache_path(path, cache)
    temporary = None
    try:
        fd, name = tempfile.mkstemp(prefix=".webp-", suffix=".tmp", dir=str(path.parent))
        temporary = checked_cache_path(Path(name), cache)
        with os.fdopen(fd, "wb") as handle:
            handle.write(data)
            handle.flush()
            os.fsync(handle.fileno())
        checked_cache_path(path, cache)
        checked_cache_path(temporary, cache)
        os.replace(temporary, path)
        temporary = None
        if path.read_bytes() != data:
            raise EncoderError("Cache write verification failed: " + str(path))
    finally:
        if temporary is not None and temporary.exists():
            checked_cache_path(temporary, cache).unlink()  # Only our single temp file.


def linked(path):
    return path.is_symlink() or getattr(path, "is_junction", lambda: False)()


def sources(graphics):
    def fail(error):
        raise error
    for parent, directories, files in os.walk(graphics, followlinks=False, onerror=fail):
        directories[:] = sorted(name for name in directories if not linked(Path(parent) / name))
        for name in sorted(files):
            path = Path(parent) / name
            if path.suffix.lower() in (".png", ".jpg", ".jpeg"):
                yield path


def png_metadata(data):
    if not data.startswith(PNG_SIGNATURE):
        raise SkipImage("format_mismatch")
    chunks = {}
    offset, saw_idat, ended_idat, ended = 8, False, False, False
    while offset < len(data):
        if offset + 12 > len(data):
            raise SkipImage("invalid_png_bounds")
        size = struct.unpack_from(">I", data, offset)[0]
        tag = data[offset + 4:offset + 8]
        end = offset + 12 + size
        if size > 0x7fffffff or end > len(data):
            raise SkipImage("invalid_png_bounds")
        payload = data[offset + 8:end - 4]
        if not re.fullmatch(rb"[A-Za-z]{4}", tag) or tag[2] & 32:
            raise SkipImage("invalid_png_chunk")
        if zlib.crc32(tag + payload) != struct.unpack_from(">I", data, end - 4)[0]:
            raise SkipImage("invalid_png_crc")
        if not chunks and tag != b"IHDR":
            raise SkipImage("invalid_png_structure")
        if tag in (b"acTL", b"fcTL", b"fdAT"):
            raise SkipImage("animation")
        if tag in (b"cICP", b"mDCv", b"cLLi"):
            raise SkipImage("unsupported_hdr_color_metadata")
        if tag[0] < 97 and tag not in (b"IHDR", b"PLTE", b"IDAT", b"IEND"):
            raise SkipImage("unknown_png_critical_chunk")
        if tag in (b"IHDR", b"PLTE", b"IEND", b"gAMA", b"cHRM", b"sRGB", b"iCCP", b"eXIf", b"tRNS") and tag in chunks:
            raise SkipImage("invalid_png_structure")
        if tag == b"IHDR":
            if size != 13:
                raise SkipImage("invalid_png_structure")
            width, height, depth, color, compression, filtering, interlace = struct.unpack(">IIBBBBB", payload)
            if depth > 8:
                raise SkipImage("high_bit_depth")
            allowed = {0: (1, 2, 4, 8), 2: (8,), 3: (1, 2, 4, 8), 4: (8,), 6: (8,)}
            if not width or not height or depth not in allowed.get(color, ()) or compression or filtering or interlace > 1:
                raise SkipImage("invalid_png_structure")
        if tag == b"IDAT":
            if ended_idat:
                raise SkipImage("invalid_png_structure")
            saw_idat = True
        elif saw_idat:
            ended_idat = True
        if tag in (b"gAMA", b"cHRM", b"sRGB", b"iCCP", b"PLTE", b"tRNS") and saw_idat:
            raise SkipImage("invalid_png_structure")
        # Only retain small policy-relevant chunks, not a second copy of IDAT.
        chunks[tag] = payload if tag in (b"gAMA", b"cHRM", b"sRGB") else b""
        offset = end
        if tag == b"IEND":
            if size or not saw_idat or offset != len(data):
                raise SkipImage("invalid_png_structure")
            ended = True
            break
    if not ended:
        raise SkipImage("invalid_png_structure")
    gamma, chroma, srgb = (chunks.get(key) for key in (b"gAMA", b"cHRM", b"sRGB"))
    if gamma is not None and gamma != struct.pack(">I", 45455):
        raise SkipImage("non_srgb_gamma")
    if chroma is not None and chroma != struct.pack(">8I", *SRGB_CHROMATICITY):
        raise SkipImage("non_srgb_chromaticity")
    if srgb is not None and (len(srgb) != 1 or srgb[0] > 3):
        raise SkipImage("invalid_srgb_intent")
    if b"iCCP" in chunks and srgb is not None:
        raise SkipImage("conflicting_color_metadata")
    return chunks


def jpeg_precision(data):
    """Bounded header walk; check sample precision before Pillow can down-convert."""
    if not data.startswith(b"\xff\xd8"):
        raise SkipImage("format_mismatch")
    offset, saw_frame = 2, False
    sof = {0xC0, 0xC1, 0xC2, 0xC3, 0xC5, 0xC6, 0xC7, 0xC9, 0xCA, 0xCB, 0xCD, 0xCE, 0xCF}
    while offset < len(data):
        if data[offset] != 0xFF:
            raise SkipImage("invalid_jpeg_structure")
        while offset < len(data) and data[offset] == 0xFF:
            offset += 1
        if offset >= len(data):
            raise SkipImage("invalid_jpeg_bounds")
        marker = data[offset]
        offset += 1
        if marker in (0, 0xD8, 0xD9) or 0xD0 <= marker <= 0xD7:
            raise SkipImage("invalid_jpeg_structure")
        if marker == 1:
            continue
        if offset + 2 > len(data):
            raise SkipImage("invalid_jpeg_bounds")
        size = struct.unpack_from(">H", data, offset)[0]
        if size < 2 or offset + size > len(data):
            raise SkipImage("invalid_jpeg_bounds")
        if marker in sof:
            if size < 8 or saw_frame:
                raise SkipImage("invalid_jpeg_structure")
            if data[offset + 2] != 8:
                raise SkipImage("high_bit_depth")
            saw_frame = True
        if marker == 0xDA:
            if not saw_frame:
                raise SkipImage("invalid_jpeg_structure")
            return  # Pillow validates/decompresses all scans; never edit their bytes.
        offset += size
    raise SkipImage("invalid_jpeg_structure")


def lossless_webp_container(data):
    if len(data) < 12 or data[:4] != b"RIFF" or data[8:12] != b"WEBP":
        return False
    if struct.unpack_from("<I", data, 4)[0] + 8 != len(data):
        return False
    offset, lossless = 12, 0
    while offset < len(data):
        if offset + 8 > len(data):
            return False
        tag = data[offset:offset + 4]
        size = struct.unpack_from("<I", data, offset + 4)[0]
        offset += 8 + size + (size & 1)
        if offset > len(data) or tag in (b"VP8 ", b"ANIM", b"ANMF"):
            return False
        if tag == b"VP8L":
            lossless += 1
    return lossless == 1


def exif_payload(value):
    if not isinstance(value, bytes):
        raise SkipImage("unsupported_exif")
    return value[6:] if value.startswith(b"Exif\x00\x00") else value


def prepare_source(data, suffix, env):
    Image, ImageCms, profiles, _ = env
    metadata = png_metadata(data) if suffix.lower() == ".png" else {}
    expected_format = "PNG" if suffix.lower() == ".png" else "JPEG"
    if expected_format == "JPEG":
        jpeg_precision(data)
    try:
        # Treat decoder warnings as unsupported instead of silently repairing input.
        with warnings.catch_warnings():
            warnings.simplefilter("error")
            with Image.open(io.BytesIO(data)) as image:
                if getattr(image, "is_animated", False) or getattr(image, "n_frames", 1) != 1:
                    raise SkipImage("animation")
                if image.format != expected_format:
                    raise SkipImage("format_mismatch")
                if image.mode not in ("1", "L", "LA", "P", "RGB", "RGBA"):
                    raise SkipImage("unsupported_pixel_mode")
                if max(image.size) > 16383:
                    raise SkipImage("webp_dimension_limit")
                image.load()  # Also makes PNG EXIF and trailing textual chunks available.
                icc = image.info.get("icc_profile", b"") or b""
                exif = image.info.get("exif", b"") or b""
                xmp = image.info.get("xmp", b"") or b""
                if isinstance(xmp, str):
                    xmp = xmp.encode("utf-8")
                png_xmp = getattr(image, "text", {}).get("XML:com.adobe.xmp")
                if png_xmp is not None:
                    png_xmp = png_xmp.encode("utf-8")
                    # Pillow exposes the SAME PNG packet through info and text.
                    if xmp and xmp != png_xmp:
                        raise SkipImage("ambiguous_xmp")
                    xmp = png_xmp
                for key, value in getattr(image, "text", {}).items():
                    if key != "XML:com.adobe.xmp" and ATTRIBUTION.search((key + " " + str(value)).encode("utf-8")):
                        raise SkipImage("attribution_metadata")
                app_list = getattr(image, "applist", [])
                if sum(marker == "APP1" and payload.startswith(b"Exif\x00\x00") for marker, payload in app_list) > 1:
                    raise SkipImage("ambiguous_exif")
                if sum(marker == "APP1" and payload.startswith(b"http://ns.adobe.com/xap/1.0/\x00") for marker, payload in app_list) > 1:
                    raise SkipImage("ambiguous_xmp")
                if any(marker == "APP2" and payload.startswith(b"ICC_PROFILE\x00") for marker, payload in app_list) and not icc:
                    raise SkipImage("invalid_icc")
                for marker, payload in app_list:
                    # APP13 may contain binary copyright IPTC; don't guess at stripping it.
                    if marker == "APP13":
                        raise SkipImage("opaque_photoshop_metadata")
                    if marker == "COM" and ATTRIBUTION.search(payload):
                        raise SkipImage("attribution_metadata")
                    if marker == "APP1" and payload.startswith(b"http://ns.adobe.com/xmp/extension/\x00"):
                        raise SkipImage("extended_xmp")
                if b"iCCP" in metadata and not icc:
                    raise SkipImage("invalid_icc")
                if b"eXIf" in metadata and not exif:
                    raise SkipImage("invalid_exif")
                if icc:
                    if not isinstance(icc, bytes) or len(icc) < 128 or icc[16:20] != b"RGB ":
                        raise SkipImage("unsupported_icc_color_space")
                    if struct.unpack_from(">I", icc)[0] != len(icc):
                        raise SkipImage("invalid_icc")
                    try:
                        ImageCms.ImageCmsProfile(io.BytesIO(icc))
                    except (OSError, ValueError) as exc:
                        raise SkipImage("invalid_icc") from exc
                    color_policy = "embedded-rgb-icc-preserved"
                elif any(key in metadata for key in (b"sRGB", b"gAMA", b"cHRM")):
                    intent = metadata.get(b"sRGB", b"\x00")[0]
                    if b"sRGB" not in metadata and b"gAMA" in metadata:
                        icc = profiles["gamma45455"]
                        color_policy = "standard-png-gamma-chromaticity-to-icc"
                    else:
                        icc = profiles[intent]
                        color_policy = "standard-srgb-metadata-to-icc"
                else:
                    color_policy = "untagged-assume-srgb"
                orientation = image.getexif().get(274) if exif else None
                if orientation is not None and (not isinstance(orientation, int) or not 1 <= orientation <= 8):
                    raise SkipImage("invalid_exif_orientation")
                exif = exif_payload(exif)
                rgba = image.convert("RGBA")
                return {
                    "image": rgba, "pixels": rgba.tobytes(), "width": image.width,
                    "height": image.height, "icc": icc, "exif": exif, "xmp": xmp,
                    "orientation": orientation, "colorPolicy": color_policy,
                }
    except SkipImage:
        raise
    except (OSError, ValueError, SyntaxError, TypeError, IndexError, struct.error, Warning, Image.DecompressionBombError) as exc:
        raise SkipImage("decode_or_metadata_error") from exc


def verify_webp(data, prepared, env):
    Image = env[0]
    if not lossless_webp_container(data):
        return False
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error")
            with Image.open(io.BytesIO(data)) as image:
                if image.format != "WEBP" or getattr(image, "n_frames", 1) != 1:
                    return False
                image.load()
                return (
                    image.size == (prepared["width"], prepared["height"])
                    and image.convert("RGBA").tobytes() == prepared["pixels"]
                    and (image.info.get("icc_profile") or b"") == prepared["icc"]
                    and exif_payload(image.info.get("exif") or b"") == prepared["exif"]
                    and image.getexif().get(274) == prepared["orientation"]
                    and (image.info.get("xmp") or b"") == prepared["xmp"]
                )
    except (OSError, ValueError, SyntaxError, TypeError, IndexError, struct.error, Warning, SkipImage, Image.DecompressionBombError):
        return False


def encode_image(prepared):
    output = io.BytesIO()
    # Fresh RGBA image: all retained metadata is supplied explicitly below.
    prepared["image"].save(output, format="WEBP", **SETTINGS,
                           icc_profile=prepared["icc"], exif=prepared["exif"], xmp=prepared["xmp"])
    return output.getvalue()


def cache_key(source_hash, encoder):
    return sha256(canonical_json({"sourceSha256": source_hash, "encoder": encoder}))


def expected_record(source_hash, source_size, prepared, encoder, key):
    return {
        "schema": 1, "cacheKey": key, "encoder": encoder,
        "sourceSha256": source_hash, "sourceBytes": source_size,
        "width": prepared["width"], "height": prepared["height"],
        "pixelSha256": sha256(prepared["pixels"]), "colorPolicy": prepared["colorPolicy"],
        "iccSha256": sha256(prepared["icc"]) if prepared["icc"] else None,
        "exifSha256": sha256(prepared["exif"]) if prepared["exif"] else None,
        "xmpSha256": sha256(prepared["xmp"]) if prepared["xmp"] else None,
        "orientation": prepared["orientation"],
    }


def read_cache(payload_path, record_path, expected, prepared, cache, env):
    checked_cache_path(payload_path, cache)
    checked_cache_path(record_path, cache)
    try:
        if record_path.stat().st_size > 65536:
            return None
        record = json.loads(record_path.read_bytes())
        if not isinstance(record, dict) or any(record.get(key) != value for key, value in expected.items()):
            return None
        if not 0 < payload_path.stat().st_size < expected["sourceBytes"]:
            return None
        payload = payload_path.read_bytes()
        if record.get("bytes") != len(payload) or record.get("sha256") != sha256(payload):
            return None
        return (payload, record) if verify_webp(payload, prepared, env) else None
    except (OSError, ValueError, UnicodeError):
        return None


def run(public, cache, manifest, env=None):
    public, cache, manifest, graphics = checked_paths(public, cache, manifest)
    env = prerequisites() if env is None else env
    encoder = env[3]
    cache.mkdir(parents=True, exist_ok=True)
    images, skipped = [], []
    summary = {"scanned": 0, "converted": 0, "skipped": 0, "cacheHits": 0,
               "encoded": 0, "sourceBytes": 0, "outputBytes": 0, "savedBytes": 0}
    for path in sources(graphics):
        source = path.relative_to(public).as_posix()
        summary["scanned"] += 1
        if linked(path) or not inside(path.resolve(), graphics):
            skipped.append({"source": source, "reason": "linked_source"})
            continue
        original = path.read_bytes()  # Read failures are fatal: never publish a partial scan.
        source_hash = sha256(original)
        summary["sourceBytes"] += len(original)
        summary["outputBytes"] += len(original)
        prepared = None
        try:
            if path.with_name(path.name + ".webp").exists():
                raise SkipImage("destination_exists")
            prepared = prepare_source(original, path.suffix, env)
            key = cache_key(source_hash, encoder)
            payload_path = checked_cache_path(cache / "payloads" / (key + ".webp"), cache)
            record_path = checked_cache_path(cache / "records" / (key + ".json"), cache)
            expected = expected_record(source_hash, len(original), prepared, encoder, key)
            cached = read_cache(payload_path, record_path, expected, prepared, cache, env)
            if cached is not None:
                payload, record = cached
                hit = True
            else:
                try:
                    payload = encode_image(prepared)
                except (OSError, ValueError, TypeError) as exc:
                    raise SkipImage("webp_encode_error") from exc
                if len(payload) >= len(original):
                    raise SkipImage("not_smaller")
                if not verify_webp(payload, prepared, env):
                    raise SkipImage("webp_verification_failed")
                record = {**expected, "bytes": len(payload), "sha256": sha256(payload)}
                atomic_write(payload_path, payload, cache)
                atomic_write(record_path, canonical_json(record) + b"\n", cache)
                hit = False
            # Reject a source changed concurrently during this encode/cache verification.
            if linked(path) or not inside(path.resolve(), graphics) or sha256(path.read_bytes()) != source_hash:
                raise EncoderError("Source changed during encoding; retry after asset import finishes: " + source)
            images.append({
                "source": source, "destination": source + ".webp",
                **{k: v for k, v in record.items() if k not in ("schema", "encoder")},
                "cacheFile": str(payload_path), "cacheHit": hit,
            })
            summary["cacheHits" if hit else "encoded"] += 1
            summary["outputBytes"] += len(payload) - len(original)
        except SkipImage as exc:
            skipped.append({"source": source, "reason": str(exc),
                            "sourceBytes": len(original), "sourceSha256": source_hash})
        finally:
            if prepared is not None:
                prepared["image"].close()
    summary["converted"], summary["skipped"] = len(images), len(skipped)
    summary["savedBytes"] = summary["sourceBytes"] - summary["outputBytes"]
    result = {"schema": 1, "encoder": encoder, "images": images, "skipped": skipped, "summary": summary}
    atomic_write(manifest, canonical_json(result) + b"\n", cache)
    return result


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n", 1)[0])
    parser.add_argument("--public", required=True, help="Absolute original public directory (read-only)")
    parser.add_argument("--cache", required=True, help="Isolated cache directory, outside public")
    parser.add_argument("--manifest", required=True, help="JSON path inside cache; relative paths use cwd")
    args = parser.parse_args(argv)
    try:
        result = run(args.public, args.cache, args.manifest)
    except (EncoderError, OSError, ValueError) as exc:
        print("WebP encoder error: " + str(exc), file=sys.stderr)
        return 1
    summary = result["summary"]
    print("WebP: {scanned} scanned, {converted} converted ({cacheHits} cached), "
          "{skipped} kept original, {savedBytes} bytes saved.".format(**summary))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
