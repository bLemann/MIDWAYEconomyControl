import os
import sys
import time
import threading
from pathlib import Path
import webview
import app


def cleanup_old_exe(name):
    name = str(name or "").strip()
    if not name.lower().endswith(".exe") or any(c in name for c in "\\/") or ".." in name:
        return
    base = Path(sys.executable).resolve().parent if getattr(sys, "frozen", False) else Path(__file__).resolve().parent
    target = base / name
    for _ in range(360):
        try:
            target.unlink()
            return
        except FileNotFoundError:
            return
        except PermissionError:
            time.sleep(0.5)
        except OSError as exc:
            if exc.winerror in (32, 33):
                time.sleep(0.5)
            else:
                return


def warm_icon_cache():
    for _ in range(6):
        if app.bundled_icon_index():
            return
        time.sleep(5)


def setup_logging():
    if not getattr(sys, "frozen", False):
        return
    base = Path(sys.executable).resolve().parent
    try:
        fh = open(base / "server.log", "a", buffering=1, encoding="utf-8", errors="replace")
        sys.stdout = fh
        sys.stderr = fh
    except OSError:
        pass


def main():
    setup_logging()
    for arg in sys.argv[1:]:
        if arg.startswith("--cleanup="):
            threading.Thread(target=cleanup_old_exe, args=(arg.split("=", 1)[1],), daemon=True).start()
            break
    if not app.WEB.is_dir():
        raise SystemExit("Missing web directory")
    srv = app.make_server()
    url = f"http://{app.HOST}:{app.SERVER_PORT}"
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    threading.Thread(target=warm_icon_cache, daemon=True).start()
    webview.create_window(
        "MIDWAY Economy Control",
        url,
        width=1280,
        height=840,
        min_size=(980, 600),
        background_color="#0d0f13",
    )
    webview.start()
    srv.shutdown()


if __name__ == "__main__":
    main()
