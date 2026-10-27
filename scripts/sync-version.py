#!/usr/bin/env python3
"""Keep the extension manifest version aligned with release tags.

Examples:
  python3 scripts/sync-version.py 0.4.0
  python3 scripts/sync-version.py --check
  python3 scripts/sync-version.py --check --tag v0.4.0
"""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MANIFEST = ROOT / "extension" / "manifest.json"
VERSION_RE = re.compile(r"^\d+\.\d+\.\d+$")
MANIFEST_VERSION_RE = re.compile(r'^(  "version": ")[^"]+(",)$', re.MULTILINE)


def parse_version(value: str) -> str:
    version = value[1:] if value.startswith("v") else value
    if not VERSION_RE.fullmatch(version):
        raise SystemExit(f"version must look like 0.1.2, got {value!r}")
    return version


def version_key(version: str) -> tuple[int, int, int]:
    return tuple(int(part) for part in version.split("."))


def manifest_version() -> str:
    data = json.loads(MANIFEST.read_text())
    return parse_version(data["version"])


def write_manifest(version: str) -> None:
    text = MANIFEST.read_text()
    updated, count = MANIFEST_VERSION_RE.subn(rf"\g<1>{version}\2", text, count=1)
    if count != 1:
        raise SystemExit("extension/manifest.json has no top-level version field")
    if updated != text:
        MANIFEST.write_text(updated)


def set_manifest_version(version: str) -> None:
    current = manifest_version()
    if version_key(version) < version_key(current):
        raise SystemExit(
            f"refusing to move extension/manifest.json from {current} to {version}; "
            "Firefox will not install a lower version over one already signed"
        )
    write_manifest(version)


def check(tag: str | None) -> None:
    version = manifest_version()
    if tag is not None:
        tag_version = parse_version(tag)
        if tag_version != version:
            raise SystemExit(
                f"manifest version {version} does not match tag {tag_version}"
            )
    print(version)


def main() -> None:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument("version", nargs="?", help="version to set, such as 0.1.2 or v0.1.2")
    parser.add_argument("--check", action="store_true", help="fail unless the tag matches the manifest")
    parser.add_argument("--tag", help="git tag to compare, such as v0.1.2")
    args = parser.parse_args()

    if args.check and args.version:
        parser.error("pass a version or --check, not both")
    if args.tag and not args.check:
        parser.error("--tag requires --check")

    if args.check:
        check(args.tag)
        return

    if args.version:
        set_manifest_version(parse_version(args.version))
    print(manifest_version())


if __name__ == "__main__":
    main()
