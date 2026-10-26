import importlib.util
from pathlib import Path

spec = importlib.util.spec_from_file_location(
    "crop_fusion", Path(__file__).with_name("crop_fusion.py")
)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
fuse_crop_targets = module.fuse_crop_targets


def sample():
    autoflip = {
        "schema_version": 1,
        "source": {"width": 1280, "height": 720, "duration_sec": 4},
        "output": {"aspect_ratio": "9:16"},
        "crop_targets": [
            {"timestamp_sec": 1, "crop": {"x": 0, "y": 0, "width": 405, "height": 720},
             "source": "autoflip"},
        ],
    }
    talknet = {"speakers": [{"frames": [
        {"timestamp_sec": 1, "bbox": [700, 250, 800, 350], "is_speaking": True},
    ]}]}
    return autoflip, talknet


def test_speaking_face_adjusts_crop_and_preserves_size():
    auto, talk = sample()
    result = fuse_crop_targets(auto, talk)
    crop = result["crop_targets"][0]["crop"]
    assert crop["x"] > 0
    assert crop["width"] == 405 and crop["height"] == 720
    assert result["crop_targets"][0]["source"] == "speaker"


def test_no_speaking_detection_preserves_autoflip():
    auto, talk = sample()
    talk["speakers"][0]["frames"][0]["is_speaking"] = False
    assert fuse_crop_targets(auto, talk) == auto


def test_detection_outside_time_window_preserves_autoflip():
    auto, talk = sample()
    talk["speakers"][0]["frames"][0]["timestamp_sec"] = 3
    assert fuse_crop_targets(auto, talk) == auto


def test_invalid_bbox_is_ignored():
    auto, talk = sample()
    talk["speakers"][0]["frames"][0]["bbox"] = [1, 2, 1, 2]
    assert fuse_crop_targets(auto, talk) == auto


def test_input_is_not_mutated():
    auto, talk = sample()
    original_x = auto["crop_targets"][0]["crop"]["x"]
    fuse_crop_targets(auto, talk)
    assert auto["crop_targets"][0]["crop"]["x"] == original_x


def test_invalid_autoflip_data_fails_clearly():
    try:
        fuse_crop_targets({}, {"speakers": []})
    except ValueError:
        return
    raise AssertionError("Expected invalid AutoFlip data to raise ValueError")
