"""
Hermetic tests for the ml-worker Gradio launch policy (M8).

gradio itself is not installed in the lightweight test environment, so a stub
module is installed before app.py is loaded. The UI graph is built at import
time, but none of these tests execute the video pipeline.
"""

import importlib.util
import os
import sys
from pathlib import Path
from unittest.mock import MagicMock

import pytest

CURRENT_DIR = Path(__file__).resolve().parent
if str(CURRENT_DIR) not in sys.path:
    sys.path.insert(0, str(CURRENT_DIR))

# Stub optional heavy imports that are only needed to build the demo graph.
if "gradio" not in sys.modules:
    sys.modules["gradio"] = MagicMock()
try:
    import cv2  # noqa: F401
except ImportError:  # pragma: no cover - depends on local environment
    sys.modules["cv2"] = MagicMock()


def _load_worker_app():
    spec = importlib.util.spec_from_file_location(
        "ml_worker_app_under_test", CURRENT_DIR / "app.py"
    )
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


worker_app = _load_worker_app()


def test_credentials_are_required_by_default():
    with pytest.raises(SystemExit, match="GRADIO_USERNAME and GRADIO_PASSWORD"):
        worker_app.resolve_gradio_launch_config({})


@pytest.mark.parametrize(
    "env",
    [
        {"GRADIO_USERNAME": "alice"},
        {"GRADIO_PASSWORD": "secret"},
        {"GRADIO_USERNAME": "alice", "GRADIO_PASSWORD": "   "},
    ],
)
def test_partial_credentials_are_rejected(env):
    with pytest.raises(SystemExit):
        worker_app.resolve_gradio_launch_config(env)


def test_false_insecure_flag_does_not_disable_credentials():
    auth, server_name, _ = worker_app.resolve_gradio_launch_config(
        {
            "GRADIO_USERNAME": "alice",
            "GRADIO_PASSWORD": "secret",
            "GRADIO_ALLOW_INSECURE": "0",
        }
    )
    assert auth == ("alice", "secret")
    assert server_name == "127.0.0.1"


def test_authenticated_config_defaults_to_loopback():
    auth, server_name, server_port = worker_app.resolve_gradio_launch_config(
        {"GRADIO_USERNAME": "alice", "GRADIO_PASSWORD": "secret"}
    )
    assert auth == ("alice", "secret")
    assert server_name == "127.0.0.1"
    assert server_port == 8080


def test_authenticated_config_honours_explicit_bind_and_port():
    auth, server_name, server_port = worker_app.resolve_gradio_launch_config(
        {
            "GRADIO_USERNAME": "alice",
            "GRADIO_PASSWORD": "secret",
            "GRADIO_SERVER_NAME": "0.0.0.0",
            "GRADIO_SERVER_PORT": "9090",
        }
    )
    assert auth == ("alice", "secret")
    assert server_name == "0.0.0.0"
    assert server_port == 9090


@pytest.mark.parametrize("flag", ["1", "true", "TRUE", "True"])
def test_explicit_insecure_flag_allows_unauthenticated_loopback_only(flag):
    auth, server_name, server_port = worker_app.resolve_gradio_launch_config(
        {
            "GRADIO_ALLOW_INSECURE": flag,
            "GRADIO_SERVER_NAME": "0.0.0.0",
        }
    )
    assert auth is None
    assert server_name == "127.0.0.1"
    assert server_port == 8080


@pytest.mark.parametrize("flag", ["0", "false", "yes", "", "   "])
def test_non_accepting_insecure_flag_still_fails_closed(flag):
    with pytest.raises(SystemExit):
        worker_app.resolve_gradio_launch_config({"GRADIO_ALLOW_INSECURE": flag})


def test_invalid_port_is_rejected():
    with pytest.raises(SystemExit, match="GRADIO_SERVER_PORT"):
        worker_app.resolve_gradio_launch_config(
            {
                "GRADIO_USERNAME": "alice",
                "GRADIO_PASSWORD": "secret",
                "GRADIO_SERVER_PORT": "not-a-port",
            }
        )


def test_launch_demo_passes_authenticated_config():
    demo = MagicMock()
    worker_app.launch_demo(
        demo,
        {
            "GRADIO_USERNAME": "alice",
            "GRADIO_PASSWORD": "secret",
            "GRADIO_SERVER_PORT": "9090",
        },
    )
    demo.queue.return_value.launch.assert_called_once_with(
        server_name="127.0.0.1",
        server_port=9090,
        auth=("alice", "secret"),
    )


def test_launch_demo_insecure_mode_never_binds_public():
    demo = MagicMock()
    worker_app.launch_demo(
        demo,
        {
            "GRADIO_ALLOW_INSECURE": "1",
            "GRADIO_SERVER_NAME": "0.0.0.0",
        },
    )
    kwargs = demo.queue.return_value.launch.call_args.kwargs
    assert kwargs["auth"] is None
    assert kwargs["server_name"] == "127.0.0.1"


def test_launch_demo_refuses_without_credentials():
    with pytest.raises(SystemExit):
        worker_app.launch_demo(MagicMock(), {"GRADIO_SERVER_NAME": "0.0.0.0"})


def test_compose_publishes_gradio_loopback_only():
    compose_text = (CURRENT_DIR / "docker-compose.yml").read_text(encoding="utf-8")
    assert '"127.0.0.1:8080:8080"' in compose_text
    assert '"8080:8080"' not in compose_text
    assert "GRADIO_SERVER_NAME=0.0.0.0" in compose_text
