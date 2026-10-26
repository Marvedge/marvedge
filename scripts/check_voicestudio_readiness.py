#!/usr/bin/env python3
"""
VoiceStudio Readiness and Health Verification Script (Task-00103)
Enforces a 10-minute timeout, verifies OmniVoice model installation,
and gates execution on CUDA device readiness.
"""

import json
import os
import sys
import time
import urllib.error
import urllib.request

TIMEOUT_SECONDS = 600  # 10 minutes hard timeout
BASE_URL = os.environ.get("VOICESTUDIO_URL", "http://127.0.0.1:3900").rstrip("/")
API_KEY = os.environ.get("VOICESTUDIO_API_KEY", "")
MODEL_REPO_ID = "k2-fsa/OmniVoice"

def make_request(path: str, method: str = "GET", data: dict = None):
    url = f"{BASE_URL}{path}"
    headers = {"User-Agent": "Marvedge-Readiness-Check/1.0"}
    if API_KEY:
        headers["Authorization"] = f"Bearer {API_KEY}"

    body = None
    if data is not None:
        headers["Content-Type"] = "application/json"
        body = json.dumps(data).encode("utf-8")

    req = urllib.request.Request(url, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            content = resp.read().decode("utf-8")
            return resp.status, json.loads(content) if content else {}
    except urllib.error.HTTPError as e:
        content = e.read().decode("utf-8")
        try:
            parsed = json.loads(content)
        except Exception:
            parsed = {"raw": content}
        return e.code, parsed
    except Exception as e:
        return 0, {"error": str(e)}

def check_readiness():
    start_time = time.time()
    print(f"[readiness] Starting VoiceStudio readiness probe against {BASE_URL}")
    print(f"[readiness] Hard timeout: {TIMEOUT_SECONDS}s (10 minutes)")

    install_triggered = False

    while True:
        elapsed = time.time() - start_time
        if elapsed > TIMEOUT_SECONDS:
            print(f"[readiness] ERROR: Timed out after {int(elapsed)}s waiting for VoiceStudio readiness.", file=sys.stderr)
            sys.exit(1)

        # Probe Health Endpoint
        status_code, body = make_request("/health")

        if status_code == 200:
            status = body.get("status", "")
            device = body.get("device", "")
            version = body.get("version", "")

            if status == "ok":
                print(f"[readiness] HTTP 200 received: status={status}, device={device}, version={version}")
                # Strict CUDA Gate
                if "cuda" not in device.lower():
                    print(f"[readiness] FATAL ERROR: Service is running on '{device}', NOT CUDA! Aborting.", file=sys.stderr)
                    sys.exit(2)

                # Verify Model Status
                m_code, m_body = make_request("/models")
                if m_code == 200 and isinstance(m_body, list):
                    installed = [m.get("id", "") for m in m_body if m.get("installed") is True]
                    print(f"[readiness] Installed models: {installed}")

                print(f"[readiness] SUCCESS: VoiceStudio is fully operational with CUDA acceleration ({device}).")
                sys.exit(0)

        elif status_code == 503:
            step = body.get("step", "starting")
            label = body.get("label", "Loading weights...")
            print(f"[readiness] ({int(elapsed)}s elapsed) Starting up: step={step}, label='{label}'")

        elif status_code == 0:
            err = body.get("error", "connection error")
            print(f"[readiness] ({int(elapsed)}s elapsed) Waiting for port 3900 to accept connections ({err})...")

        else:
            print(f"[readiness] ({int(elapsed)}s elapsed) HTTP {status_code}: {body}")

        # If server is up and responsive, trigger model install if not yet done
        if status_code in (200, 503) and not install_triggered and API_KEY:
            inst_code, inst_resp = make_request("/models/install", method="POST", data={"repo_id": MODEL_REPO_ID})
            print(f"[readiness] Triggered model install for '{MODEL_REPO_ID}': HTTP {inst_code} {inst_resp}")
            install_triggered = True

        time.sleep(5)

if __name__ == '__main__':
    check_readiness()
