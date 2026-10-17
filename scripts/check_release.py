#!/usr/bin/env python3
"""Static checks for a synthetic, no-build candidate; not privacy certification.

Scans all candidate files (including extensionless and hidden files) except
fresh Git internals. Git history and provenance still require human review.
Synthetic fixtures are regenerated in a temporary directory, never in place.
"""

import json
import os
import re
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
failures = []
notes = []
files = []


def fail(message):
    failures.append(message)


def rel(path):
    return str(path.relative_to(ROOT))


def inventory():
    forbidden_names = {".DS_Store", "Thumbs.db", ".netrc", ".env", ".env.local"}
    forbidden_dirs = {"node_modules", "__pycache__", ".venv", "venv"}
    for directory, dirs, names in os.walk(ROOT, followlinks=False):
        folder = Path(directory)
        if folder == ROOT and ".git" in dirs:
            dirs.remove(".git")
        for name in list(dirs):
            path = folder / name
            if path.is_symlink():
                fail("{}: symlink requires manual review".format(rel(path)))
                dirs.remove(name)
            elif name in forbidden_dirs:
                fail("{}: excluded directory exists".format(rel(path)))
                dirs.remove(name)
        for name in names:
            path = folder / name
            if path.is_symlink():
                fail("{}: symlink requires manual review".format(rel(path)))
                continue
            if name in forbidden_names or name.endswith((".pyc", ".pem", ".key")):
                fail("{}: excluded file exists".format(rel(path)))
                continue
            try:
                content = path.read_bytes()
                if b"\0" in content:
                    raise ValueError("binary content")
                source = content.decode("utf-8")
            except (OSError, ValueError, UnicodeDecodeError):
                fail("{}: binary or unreadable file requires manual review".format(rel(path)))
                continue
            files.append((path, source))
    notes.append("inventoried {} text files, including hidden and extensionless files".format(len(files)))


def privacy_scan():
    patterns = [
        (re.compile(r"[/]Users[/][^/\s]+[/]", re.I), "local home path"),
        (re.compile(r"[/]home[/][^/\s]+[/]", re.I), "local home path"),
        (re.compile(r"[A-Z]:\\Users\\[^\\\s]+\\", re.I), "local home path"),
        (re.compile(r"[\w.+-]+@[\w-]+\.[\w.-]+"), "email-like identifier"),
        (re.compile(r"-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----"), "private key"),
        (re.compile(r"\b(?:api[_-]?key|access[_-]?token|secret[_-]?key|password)\s*[:=]\s*['\"][^'\"]{8,}", re.I), "credential-like assignment"),
    ]
    for path, source in files:
        for number, line in enumerate(source.splitlines(), 1):
            for pattern, label in patterns:
                if pattern.search(line):
                    fail("{}:{}: possible {}".format(rel(path), number, label))
    notes.append("pattern-scanned all candidate text files; provenance needs manual review")


def imports_and_assets():
    static = re.compile(r"""(?:\bimport|\bexport)\s+(?:[^;'"\n]*?\s+from\s*)?['"]([^'"]+)['"]""")
    dynamic = re.compile(r"""\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)""")
    count = 0
    for path, source in files:
        if path.suffix != ".js":
            continue
        for spec in static.findall(source) + dynamic.findall(source):
            if not spec.startswith("."):
                fail("{}: non-relative module import {!r}".format(rel(path), spec))
                continue
            target = (path.parent / spec).resolve()
            if not target.is_relative_to(ROOT) or not target.is_file():
                fail("{}: unresolved module import {!r}".format(rel(path), spec))
            count += 1
    html = (ROOT / "index.html").read_text(encoding="utf-8")
    for ref in re.findall(r"""(?:href|src)\s*=\s*["']([^"']+)["']""", html):
        if ref.startswith(("data:", "#")):
            continue
        if ref.startswith(("/", "http:", "https:", "//")):
            fail("index.html: external or root-absolute asset reference")
            continue
        target = (ROOT / ref.split("#", 1)[0].split("?", 1)[0]).resolve()
        if not target.is_relative_to(ROOT) or not target.is_file():
            fail("index.html: unresolved asset {!r}".format(ref))
    for path, source in files:
        if path.suffix not in (".js", ".css"):
            continue
        if re.search(r"""(?:from\s+|url\()\s*["']?/(?!/)""", source):
            fail("{}: root-absolute runtime reference".format(rel(path)))
        if re.search(r"""(?:fetch|import)\s*\(\s*['"]https?://""", source):
            fail("{}: external runtime request or import".format(rel(path)))
        if path.suffix == ".css" and re.search(r"""url\(\s*['"]?https?://""", source):
            fail("{}: external CSS resource".format(rel(path)))
    notes.append("checked {} local module imports and HTML assets".format(count))


def release_configuration():
    package = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))
    if package.get("dependencies") or package.get("devDependencies"):
        fail("package.json declares runtime or development dependencies")
    if not (ROOT / ".nojekyll").is_file():
        fail(".nojekyll is missing")
    workflows = ROOT / ".github" / "workflows"
    if workflows.exists():
        for workflow in workflows.iterdir():
            if workflow.suffix.lower() not in (".yml", ".yaml"):
                continue
            content = workflow.read_text(encoding="utf-8").lower()
            if "pages" in workflow.stem.lower() or re.search(
                r"actions/(?:deploy-pages|upload-pages-artifact)|actions-gh-pages", content
            ):
                fail("{}: deployment workflow is not allowed in this candidate".format(rel(workflow)))
    notes.append("no Pages deployment workflow or package dependencies detected")


def synthetic_fixture():
    generator = ROOT / "reference" / "generate_reference.py"
    fixture = ROOT / "reference" / "synthetic_cases.js"
    if not generator.is_file() or not fixture.is_file():
        fail("independent synthetic generator or fixture is missing")
        return
    with tempfile.TemporaryDirectory() as directory:
        output = Path(directory) / "synthetic_cases.js"
        result = subprocess.run(
            [sys.executable, str(generator), "--output", str(output)],
            cwd=ROOT, capture_output=True, text=True,
        )
        if result.returncode:
            fail("synthetic fixture regeneration failed: {}".format(result.stderr.strip()))
        elif output.read_bytes() != fixture.read_bytes():
            fail("synthetic fixture differs from regenerated output")
        else:
            notes.append("synthetic oracle fixture reproduces byte-for-byte")


def main():
    inventory()
    privacy_scan()
    imports_and_assets()
    release_configuration()
    synthetic_fixture()
    for note in notes:
        print("  ok   {}".format(note))
    for failure in failures:
        print("  FAIL {}".format(failure))
    if failures:
        print("\n{} check(s) failed".format(len(failures)))
        return 1
    print("\nAll automated checks passed. Privacy and provenance still require human review.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
