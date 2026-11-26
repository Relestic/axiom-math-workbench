"""Packaging guarantees are checked against an installed wheel's actual metadata."""

import importlib.util
from pathlib import Path

import pytest

SCRIPT = Path(__file__).resolve().parents[2] / "frontend/scripts/portable_python.py"


def helper():
    assert SCRIPT.is_file(), "portable runtime builder is missing"
    spec = importlib.util.spec_from_file_location("portable_python", SCRIPT)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def installed(tmp, name, version, tag="py3-none-any"):
    folder = tmp / (name + "-" + version + ".dist-info")
    folder.mkdir()
    (folder / "METADATA").write_text(f"Metadata-Version: 2.1\nName: {name}\nVersion: {version}\n")
    (folder / "WHEEL").write_text(f"Wheel-Version: 1.0\nRoot-Is-Purelib: true\nTag: {tag}\n")
    (folder / "LICENSE").write_text("Example license")
    return {
        "metadata": {"name": name, "version": version},
        "download_info": {
            "url": f"https://example.test/{name}-{version}-{tag}.whl",
            "archive_info": {"hashes": {"sha256": "a" * 64}},
        },
    }


def test_old_flask_cache_and_unreported_wheels_cannot_be_shipped(tmp_path):
    package = helper()
    flask = installed(tmp_path, "flask", "3.0.3")
    pins = {"flask": "3.0.3", "pypdf": "7.1.1"}
    with pytest.raises(ValueError, match="pypdf"):
        package.verify_install(tmp_path, [flask], pins)
    pdf = installed(tmp_path, "pypdf", "7.1.1")
    assert any(
        item["name"] == "pypdf" and item["licenses"] == ["pypdf-7.1.1.dist-info/LICENSE"]
        for item in package.verify_install(tmp_path, [flask, pdf], pins)
    )
    extra = installed(tmp_path, "Pillow", "1.0")
    with pytest.raises(ValueError):
        package.verify_install(tmp_path, [flask, pdf], pins)
    with pytest.raises(ValueError, match="pillow|Pillow"):
        package.verify_install(tmp_path, [flask, pdf, extra], pins)


def test_pdf_requires_pure_wheel_tag_and_a_bundled_license(tmp_path):
    package = helper()
    pdf = installed(tmp_path, "pypdf", "7.1.1", "cp312-cp312-win_amd64")
    with pytest.raises(ValueError):
        package.verify_install(tmp_path, [pdf], {"pypdf": "7.1.1"})
    pdf["download_info"]["url"] = "https://example.test/pypdf-7.1.1-py3-none-any.whl"
    folder = tmp_path / "pypdf-7.1.1.dist-info"
    (folder / "WHEEL").write_text("Root-Is-Purelib: true\nTag: py3-none-any\n")
    (folder / "LICENSE").unlink()
    with pytest.raises(ValueError, match="license"):
        package.verify_install(tmp_path, [pdf], {"pypdf": "7.1.1"})
