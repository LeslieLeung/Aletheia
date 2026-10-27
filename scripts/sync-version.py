#!/usr/bin/env python3
"""Keep Aletheia versions aligned with pyproject.toml.

The project version in pyproject.toml is the source. Passing a version writes
it there, then copies it into uv.lock and extension/manifest.json. Dependency
resolution is left untouched. The API reads pyproject.toml at startup, and the
release workflows refuse a tag that does not match.

Examples:
  python3 scripts/sync-version.py 0.1.2
  python3 scripts/sync-version.py --check
  python3 scripts/sync-version.py --check --tag v0.1.2
"""

from __future__ import annotations

import argparse
import json
import re
import tomllib
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PYPROJECT = ROOT / "pyproject.toml"
LOCK = ROOT / "uv.lock"
MANIFEST = ROOT / "extension" / "manifest.json"
VERSION_RE = re.compile(r"^\d+\.\d+\.\d+$")
PYPROJECT_VERSION_RE = re.compile(r'^(version = ")[^"]+(")$', re.MULTILINE)
MANIFEST_VERSION_RE = re.compile(r'^(  "version": ")[^"]+(",)$', re.MULTILINE)


def parse_version(value: str) -> str:
    version = value[1:] if value.startswith("v") else value
    if not VERSION_RE.fullmatch(version):
        raise SystemExit(f"version must look like 0.1.2, got {value!r}")
    return version


def version_key(version: str) -> tuple[int, int, int]:
    return tuple(int(part) for part in version.split("."))


def project_version() -> str:
    with PYPROJECT.open("rb") as handle:
        version = tomllib.load(handle)["project"]["version"]
    return parse_version(version)


def lock_version() -> str:
    with LOCK.open("rb") as handle:
        packages = tomllib.load(handle)["package"]
    for package in packages:
        if package.get("name") == "aletheia":
            return parse_version(package["version"])
    raise SystemExit("uv.lock has no aletheia package")


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


def write_lock(version: str) -> None:
    text = LOCK.read_text()
    updated, count = re.subn(
        r'(name = "aletheia"\nversion = ")[^"]+(")',
        rf"\g<1>{version}\2",
        text,
        count=1,
    )
    if count != 1:
        raise SystemExit("uv.lock has no aletheia package version")
    if updated != text:
        LOCK.write_text(updated)


def write_pyproject(version: str) -> None:
    text = PYPROJECT.read_text()
    updated, count = PYPROJECT_VERSION_RE.subn(rf"\g<1>{version}\2", text, count=1)
    if count != 1:
        raise SystemExit("pyproject.toml has no project version")
    if updated != text:
        PYPROJECT.write_text(updated)


def set_project_version(version: str) -> None:
    current = manifest_version()
    if version_key(version) < version_key(current):
        raise SystemExit(
            f"refusing to move extension/manifest.json from {current} to {version}; "
            "Firefox will not install a lower version over one already signed"
        )
    write_pyproject(version)


def check(tag: str | None) -> None:
    found = {
        "pyproject.toml": project_version(),
        "uv.lock": lock_version(),
        "extension/manifest.json": manifest_version(),
    }
    expected = next(iter(found.values()))
    mismatches = [f"{name}={value}" for name, value in found.items() if value != expected]
    if tag is not None:
        tag_version = parse_version(tag)
        if tag_version != expected:
            mismatches.append(f"tag {tag}={tag_version}")
    if mismatches:
        raise SystemExit(f"versions differ from {expected}: " + ", ".join(mismatches))
    print(expected)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("version", nargs="?", help="version to set, such as 0.1.2 or v0.1.2")
    parser.add_argument("--check", action="store_true", help="fail unless every version matches")
    parser.add_argument("--tag", help="git tag to compare, such as v0.1.2")
    args = parser.parse_args()

    if args.check and args.version:
        parser.error("pass a version or --check, not both")
    if args.tag and not args.check:
        parser.error("--tag requires --check")

    if args.check:
        check(args.tag)
        return

    version = parse_version(args.version) if args.version else project_version()
    if args.version:
        set_project_version(version)
    elif version_key(project_version()) < version_key(manifest_version()):
        raise SystemExit(
            f"pyproject.toml is {project_version()} but extension/manifest.json is "
            f"{manifest_version()}. Set the higher version explicitly: "
            f"python3 scripts/sync-version.py {manifest_version()}"
        )

    write_manifest(version)
    write_lock(version)
    check(None)


if __name__ == "__main__":
    main()
