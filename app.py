from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import json
import re
import ssl
import time
import ftplib
import base64
import io
import mimetypes
import urllib.parse
import urllib.request
import sys
import socket
from datetime import datetime, timezone

ROOT = Path(__file__).resolve().parent
_BASE = Path(getattr(sys, "_MEIPASS", "")) if getattr(sys, "_MEIPASS", None) else ROOT
WEB = _BASE / "web" if (_BASE / "web").is_dir() else ROOT / "web"
HOST, PORT = "127.0.0.1", 8765
SERVER_PORT = PORT
VERSION = "0.4.2"

def presets_dir():
    base = Path(sys.executable).resolve().parent if getattr(sys, "frozen", False) else ROOT
    d = base / "data" / "presets"
    d.mkdir(parents=True, exist_ok=True)
    return d

def preset_path(name):
    safe = re.sub(r"[^\w\-. ]", "", str(name)).strip().rstrip(".")
    if not safe or len(safe) > 64:
        raise ValueError("Invalid preset name")
    return presets_dir() / (safe + ".json")

def data_dir():
    base = Path(sys.executable).resolve().parent if getattr(sys, "frozen", False) else ROOT
    d = base / "data"
    d.mkdir(parents=True, exist_ok=True)
    return d

def connections_file():
    return data_dir() / "connections.json"

def load_connections():
    try:
        raw = json.loads(connections_file().read_text(encoding="utf-8"))
        return raw if isinstance(raw, dict) else {}
    except (OSError, json.JSONDecodeError):
        return {}

def save_connections(data):
    connections_file().write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")

def icons_dir():
    d = data_dir() / "icons"
    d.mkdir(parents=True, exist_ok=True)
    return d

ICON_EXTS = {".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp"}
ICON_URL_TYPES = {"image/png": ".png", "image/jpeg": ".jpg", "image/webp": ".webp", "image/gif": ".gif", "image/bmp": ".bmp"}
ITEM_ID_RE = re.compile(r"^[A-Za-z0-9_\-]{1,120}$")

def custom_items_file():
    return data_dir() / "custom-items.json"

def load_custom_items():
    try:
        raw = json.loads(custom_items_file().read_text(encoding="utf-8"))
        return raw if isinstance(raw, list) else []
    except (OSError, json.JSONDecodeError):
        return []

def server_files_dir():
    d = data_dir() / "server-files"
    d.mkdir(parents=True, exist_ok=True)
    return d

def find_icon_file(item_id):
    safe = item_id.lower()
    try:
        for f in icons_dir().iterdir():
            if f.is_file() and f.suffix.lower() in ICON_EXTS and f.stem.lower() == safe:
                return f
    except OSError:
        pass
    return None

def write_icon_file(item_id, ext, raw):
    safe = re.sub(r"[^A-Za-z0-9_\-]", "", str(item_id))
    if not safe:
        raise ValueError("Invalid item id")
    ext = str(ext or ".png").lower()
    if ext not in ICON_EXTS:
        raise ValueError("Unsupported image type: " + ext)
    if len(raw) < 8:
        raise ValueError("Image file is too small")
    if len(raw) > 2 * 1024 * 1024:
        raise ValueError("Image exceeds 2 MB limit")
    for f in icons_dir().iterdir():
        if f.is_file() and f.stem.lower() == safe.lower():
            try:
                f.unlink()
            except OSError:
                pass
    out = icons_dir() / (safe + ext)
    out.write_bytes(raw)
    return out

class _EPSVMixin:
    def makepasv(self, *args):
        try:
            return super().makepasv(*args)
        except ftplib.error_proto as exc:
            if "227" in str(exc):
                try:
                    resp = self.sendcmd("EPSV")
                    m = re.search(r"\|\|\|(\d+)", resp)
                    if m:
                        return (self.host, int(m.group(1)))
                except (ftplib.error_perm, ftplib.error_proto):
                    pass
            raise

class FTP_TLS_E(_EPSVMixin, ftplib.FTP_TLS):
    pass

class FTP_E(_EPSVMixin, ftplib.FTP):
    pass

def connect_ftp(data):
    errors = []
    for attempt in range(2):
        try:
            ftp = FTP_TLS_E(timeout=12)
            ftp.connect(data["host"], int(data.get("port", 21)))
            ftp.login(data["username"], data["password"])
            ftp.prot_p()
            return ftp, True
        except ftplib.error_perm as exc:
            msg = str(exc).lower()
            if any(k in msg for k in ("auth", "tls", "ssl")):
                errors.append("TLS отклонён сервером: " + str(exc)[:160])
                break
            raise
        except (ssl.SSLError, ConnectionError, TimeoutError, OSError) as exc:
            errors.append("TLS-рукопожатие прервано: " + str(exc)[:160])
            if attempt == 0:
                time.sleep(1.2)
                continue
            break
    try:
        ftp = FTP_E(timeout=12)
        ftp.connect(data["host"], int(data.get("port", 21)))
        ftp.login(data["username"], data["password"])
        return ftp, False
    except Exception as exc:
        errors.append("Plain FTP: " + str(exc)[:160])
        raise ValueError(" | ".join(errors))

class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(WEB), **kwargs)

    def send_json(self, code, data):
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path == "/api/health":
            return self.send_json(200, {"ok": True, "name": "MIDWAY Economy Control", "version": VERSION})
        if self.path == "/api/presets":
            items = []
            for f in sorted(presets_dir().glob("*.json")):
                try:
                    raw = json.loads(f.read_text(encoding="utf-8"))
                    doc = raw.get("doc") or {}
                    traders = doc.get("traders") or {}
                    items.append({
                        "name": raw.get("name") or f.stem,
                        "savedAt": raw.get("savedAt", ""),
                        "traders": len(traders) if isinstance(traders, dict) else 0,
                        "items": sum(len(r) for r in traders.values() if isinstance(r, list)),
                    })
                except (json.JSONDecodeError, UnicodeDecodeError, OSError):
                    continue
            return self.send_json(200, {"ok": True, "presets": items})
        if self.path == "/api/connections":
            return self.send_json(200, {"ok": True, "connections": load_connections()})
        if self.path == "/api/custom-items":
            return self.send_json(200, {"ok": True, "items": load_custom_items()})
        if self.path.startswith("/api/icon/"):
            name = urllib.parse.unquote(self.path[len("/api/icon/"):].split("?", 1)[0])
            safe = re.sub(r"[^A-Za-z0-9_\-]", "", name)
            if not safe:
                return self.send_json(400, {"ok": False, "error": "Invalid icon id"})
            f = find_icon_file(safe)
            if not f:
                return self.send_json(404, {"ok": False, "error": "Icon not found"})
            try:
                body = f.read_bytes()
            except OSError:
                return self.send_json(404, {"ok": False, "error": "Icon not found"})
            ctype = mimetypes.types_map.get(f.suffix.lower(), "application/octet-stream")
            self.send_response(200)
            self.send_header("Content-Type", ctype)
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(body)
            return
        return super().do_GET()

    def do_POST(self):
        origin = self.headers.get("Origin")
        if origin and origin not in (f"http://{HOST}:{SERVER_PORT}", f"http://localhost:{SERVER_PORT}"):
            return self.send_json(403, {"ok": False, "error": "Cross-origin requests are not allowed"})
        if self.path not in ("/api/economy/validate", "/api/ftp/list", "/api/ftp/download", "/api/ftp/upload", "/api/presets/save", "/api/presets/load", "/api/presets/delete", "/api/connections/save", "/api/connections/delete", "/api/icons/scan_ftp", "/api/custom-items/save", "/api/icons/upload", "/api/icons/delete", "/api/icons/fetch_url", "/api/snapshots/save"):
            return self.send_json(404, {"ok": False, "error": "Unknown API route"})
        size = int(self.headers.get("Content-Length", "0"))
        if size > 8 * 1024 * 1024:
            return self.send_json(413, {"ok": False, "error": "Request too large"})
        try:
            doc = json.loads(self.rfile.read(size) or b"{}")
        except (json.JSONDecodeError, UnicodeDecodeError):
            return self.send_json(400, {"ok": False, "error": "Invalid JSON"})
        if self.path.startswith("/api/ftp/"):
            return self.handle_ftp(self.path, doc)
        if self.path.startswith("/api/presets/"):
            return self.handle_presets(self.path, doc)
        if self.path.startswith("/api/connections/"):
            return self.handle_connections(self.path, doc)
        if self.path == "/api/icons/scan_ftp":
            return self.handle_icon_scan(doc)
        if self.path in ("/api/icons/upload", "/api/icons/delete", "/api/icons/fetch_url"):
            return self.handle_icon_ops(self.path, doc)
        if self.path == "/api/custom-items/save":
            return self.handle_custom_items_save(doc)
        if self.path == "/api/snapshots/save":
            return self.handle_snapshot_save(doc)
        issues = []
        warnings = []
        if not isinstance(doc, dict):
            issues.append("Root must be an object")
        else:
            traders = doc.get("traders", {})
            if not isinstance(traders, dict):
                issues.append("traders must be an object")
            else:
                for name, rows in traders.items():
                    if not isinstance(rows, list):
                        issues.append(f"{name}: goods must be an array")
                        continue
                    seen = {}
                    for i, row in enumerate(rows):
                        if not isinstance(row, dict):
                            issues.append(f"{name} row {i + 1}: expected object")
                            continue
                        code = row.get("tradeable-code")
                        if not isinstance(code, str) or not code.strip():
                            issues.append(f"{name} row {i + 1}: missing tradeable-code")
                        else:
                            seen[code] = seen.get(code, 0) + 1
                            if seen[code] == 2:
                                warnings.append(f"{name}: duplicate code {code}")
                        for key, value in row.items():
                            if not isinstance(value, str):
                                issues.append(f"{name} row {i + 1}: {key} should be a string")
                        for key in ("can-be-purchased", "available-after-sale-only"):
                            value = row.get(key)
                            if isinstance(value, str) and value not in ("default", "true", "false"):
                                issues.append(f"{name} row {i + 1}: {key} must be default, true or false")
        return self.send_json(200, {"ok": not issues, "issues": issues, "warnings": warnings})

    def handle_custom_items_save(self, data):
        items = data.get("items") if isinstance(data, dict) else None
        if not isinstance(items, list):
            return self.send_json(400, {"ok": False, "error": "items array is required"})
        if len(items) > 500:
            return self.send_json(400, {"ok": False, "error": "Too many items (max 500)"})
        clean, seen = [], set()
        for it in items:
            if not isinstance(it, dict):
                continue
            iid = str(it.get("id", "")).strip()
            if not ITEM_ID_RE.match(iid) or iid in seen:
                continue
            seen.add(iid)
            clean.append({
                "id": iid,
                "name": str(it.get("name", "")).strip()[:120],
                "category": str(it.get("category", "")).strip()[:60],
            })
        try:
            custom_items_file().write_text(json.dumps(clean, ensure_ascii=False), encoding="utf-8")
        except OSError as exc:
            return self.send_json(500, {"ok": False, "error": str(exc)[:300]})
        return self.send_json(200, {"ok": True, "count": len(clean)})

    def handle_icon_ops(self, route, data):
        try:
            if route == "/api/icons/upload":
                raw = base64.b64decode(str(data.get("dataB64", "")), validate=True)
                out = write_icon_file(data.get("id", ""), data.get("ext", ".png"), raw)
                return self.send_json(200, {"ok": True, "icon": out.stem})
            if route == "/api/icons/delete":
                safe = re.sub(r"[^A-Za-z0-9_\-]", "", str(data.get("id", "")))
                removed = 0
                for f in icons_dir().iterdir():
                    if f.is_file() and f.stem.lower() == safe.lower():
                        try:
                            f.unlink()
                            removed += 1
                        except OSError:
                            pass
                return self.send_json(200, {"ok": True, "removed": removed})
            if route == "/api/icons/fetch_url":
                url = str(data.get("url", "")).strip()
                if not url.lower().startswith(("http://", "https://")):
                    return self.send_json(400, {"ok": False, "error": "Only http/https image URLs are allowed"})
                req = urllib.request.Request(url, headers={"User-Agent": "MIDWAY-Economy-Control/" + VERSION})
                with urllib.request.urlopen(req, timeout=10) as resp:
                    ctype = (resp.headers.get("Content-Type") or "").split(";")[0].strip().lower()
                    raw = resp.read(2 * 1024 * 1024 + 1)
                ext = ICON_URL_TYPES.get(ctype)
                if not ext:
                    return self.send_json(400, {"ok": False, "error": "URL is not a supported image (png, jpeg, webp, gif, bmp)"})
                out = write_icon_file(data.get("id", ""), ext, raw)
                return self.send_json(200, {"ok": True, "icon": out.stem})
        except ValueError as exc:
            return self.send_json(400, {"ok": False, "error": str(exc)[:300]})
        except OSError as exc:
            return self.send_json(502, {"ok": False, "error": str(exc)[:300]})
        return self.send_json(404, {"ok": False, "error": "Unknown icon route"})

    def handle_snapshot_save(self, data):
        name = str(data.get("fileName", "")).strip()
        if not name or any(c in name for c in "\r\n/\\") or name in (".", ".."):
            return self.send_json(400, {"ok": False, "error": "A file name is required"})
        try:
            raw = base64.b64decode(str(data.get("content", "")), validate=True)
        except ValueError:
            return self.send_json(400, {"ok": False, "error": "Invalid base64 content"})
        if len(raw) > 5 * 1024 * 1024:
            return self.send_json(413, {"ok": False, "error": "File exceeds 5 MB limit"})
        safe = re.sub(r"[^\w\-. ]", "", name).strip() or "file.json"
        stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        out = server_files_dir() / (stamp + "_" + safe)
        try:
            out.write_bytes(raw)
        except OSError as exc:
            return self.send_json(500, {"ok": False, "error": str(exc)[:300]})
        return self.send_json(200, {"ok": True, "path": out.name})

    def handle_presets(self, route, data):
        if not isinstance(data, dict):
            return self.send_json(400, {"ok": False, "error": "Body must be an object"})
        try:
            if route == "/api/presets/save":
                doc = data.get("doc")
                if not isinstance(doc, dict):
                    return self.send_json(400, {"ok": False, "error": "A document object is required"})
                path = preset_path(data.get("name", ""))
                path.write_text(json.dumps({
                    "name": path.stem,
                    "savedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
                    "doc": doc,
                }, ensure_ascii=False), encoding="utf-8")
                return self.send_json(200, {"ok": True, "name": path.stem})
            name_only = ("name" in data and not isinstance(data.get("name"), str)) or (isinstance(data.get("name"), str) and not data["name"])
            if name_only:
                return self.send_json(400, {"ok": False, "error": "A preset name is required"})
            path = preset_path(data["name"])
            if route == "/api/presets/load":
                if not path.is_file():
                    return self.send_json(404, {"ok": False, "error": "Preset not found"})
                raw = json.loads(path.read_text(encoding="utf-8"))
                return self.send_json(200, {"ok": True, "name": path.stem, "doc": raw.get("doc") or {}})
            if route == "/api/presets/delete":
                if not path.is_file():
                    return self.send_json(404, {"ok": False, "error": "Preset not found"})
                path.unlink()
                return self.send_json(200, {"ok": True, "name": path.stem})
        except ValueError as exc:
            return self.send_json(400, {"ok": False, "error": str(exc)})
        except (OSError, json.JSONDecodeError) as exc:
            return self.send_json(500, {"ok": False, "error": str(exc)[:300]})
        return self.send_json(404, {"ok": False, "error": "Unknown preset route"})

    def handle_connections(self, route, data):
        if not isinstance(data, dict):
            return self.send_json(400, {"ok": False, "error": "Body must be an object"})
        ctype = data.get("type")
        if ctype not in ("ftp", "rcon"):
            return self.send_json(400, {"ok": False, "error": "type must be ftp or rcon"})
        conn = load_connections()
        if route == "/api/connections/save":
            payload = data.get("data")
            if not isinstance(payload, dict):
                return self.send_json(400, {"ok": False, "error": "data object is required"})
            clean = {}
            for k, v in payload.items():
                if isinstance(v, (str, int, float, bool)):
                    clean[str(k)[:64]] = str(v) if isinstance(v, str) else v
            conn[ctype] = clean
            try:
                save_connections(conn)
            except OSError as exc:
                return self.send_json(500, {"ok": False, "error": str(exc)[:300]})
            return self.send_json(200, {"ok": True, "type": ctype})
        if route == "/api/connections/delete":
            conn.pop(ctype, None)
            try:
                save_connections(conn)
            except OSError as exc:
                return self.send_json(500, {"ok": False, "error": str(exc)[:300]})
            return self.send_json(200, {"ok": True, "type": ctype})
        return self.send_json(404, {"ok": False, "error": "Unknown connections route"})

    def handle_icon_scan(self, data):
        required = ("host", "username", "password")
        if not isinstance(data, dict) or any(not isinstance(data.get(k), str) or not data[k] for k in required):
            return self.send_json(400, {"ok": False, "error": "Host, username and password are required"})
        ids = []
        if isinstance(data.get("ids"), list):
            for i in data["ids"][:400]:
                if isinstance(i, str) and i.strip():
                    ids.append(i.strip().lower())
        if not ids:
            return self.send_json(400, {"ok": False, "error": "A list of item ids is required"})
        wanted = set(ids)
        found, downloaded, stats = {}, 0, {"dirs": 0, "errors": 0}
        deadline = time.monotonic() + 22
        try:
            ftp, tls = connect_ftp(data)
        except (ValueError, ftplib.error_perm, ftplib.error_proto, OSError) as exc:
            return self.send_json(502, {"ok": False, "error": str(exc)[:400]})
        def walk(path, depth):
            nonlocal downloaded
            if depth > 4 or len(found) >= len(wanted) or time.monotonic() > deadline or stats["dirs"] > 400:
                return
            stats["dirs"] += 1
            entries = []
            try:
                for name, facts in ftp.mlsd(path):
                    if name in (".", ".."):
                        continue
                    entries.append((name, (facts.get("type", "file") == "dir")))
            except (ftplib.error_perm, ftplib.error_proto):
                try:
                    for name in ftp.nlst(path):
                        base = name.rstrip("/").rsplit("/", 1)[-1]
                        if base and base not in (".", ".."):
                            entries.append((name, False))
                except (ftplib.error_perm, ftplib.error_proto, OSError):
                    stats["errors"] += 1
                    return
            except OSError:
                stats["errors"] += 1
                return
            for name, is_dir in entries:
                if time.monotonic() > deadline:
                    return
                base = name.rstrip("/").rsplit("/", 1)[-1]
                if is_dir:
                    child = (path.rstrip("/") or "") + "/" + base
                    walk(child, depth + 1)
                    continue
                stem, ext = base.rsplit(".", 1)[0], ("." + base.rsplit(".", 1)[1]) if "." in base else ""
                if ext.lower() in ICON_EXTS and stem.lower() in wanted and stem.lower() not in found:
                    found[stem.lower()] = (path.rstrip("/") or "") + "/" + base
                    if downloaded < 100:
                        try:
                            buf = io.BytesIO()
                            ftp.retrbinary("RETR " + found[stem.lower()], buf.write)
                            out = icons_dir() / (base if len(base) < 120 else base[:115] + ext)
                            out.write_bytes(buf.getvalue())
                            downloaded += 1
                        except (ftplib.error_perm, ftplib.error_proto, OSError):
                            stats["errors"] += 1
        try:
            walk(data.get("remotePath", "/") or "/", 0)
        finally:
            try:
                ftp.quit()
            except Exception:
                ftp.close()
        return self.send_json(200, {"ok": True, "tls": tls, "found": found, "downloaded": downloaded, "stats": stats})

    def handle_ftp(self, route, data):
        required = ("host", "username", "password", "remotePath")
        if not isinstance(data, dict) or any(not isinstance(data.get(k), str) or not data[k] for k in required):
            return self.send_json(400, {"ok": False, "error": "Host, username, password and remote path are required"})
        if any(c in data["remotePath"] for c in "\r\n"):
            return self.send_json(400, {"ok": False, "error": "Invalid remote path"})
        try:
            ftp, tls = connect_ftp(data)
        except (ValueError, ftplib.error_perm, ftplib.error_proto, OSError) as exc:
            return self.send_json(502, {"ok": False, "error": str(exc)[:400]})
        try:
            if route == "/api/ftp/list":
                note = None
                target = data["remotePath"]
                try:
                    ftp.cwd(target)
                    path = target
                except ftplib.error_perm as exc:
                    path = None
                    for alt in ("/", "."):
                        try:
                            ftp.cwd(alt)
                            path = alt
                            note = "Папка " + target + " не найдена (" + str(exc)[:120] + "); показан " + ("корень" if path == "/" else "текущая папка") + ". Выберите нужную папку в списке."
                            break
                        except ftplib.error_perm:
                            continue
                    if path is None:
                        raise
                rows = []
                try:
                    for name, facts in ftp.mlsd():
                        rows.append({"name": name, "type": facts.get("type", "file"), "size": facts.get("size", ""), "modified": facts.get("modify", "")})
                except (ftplib.error_perm, AttributeError):
                    rows = [{"name": n, "type": "unknown", "size": ""} for n in ftp.nlst()]
                return self.send_json(200, {"ok": True, "tls": tls, "path": path, "note": note, "files": rows})
            remote = data.get("fileName", "")
            if not remote or any(c in remote for c in "\r\n/\\") or remote in (".", ".."):
                return self.send_json(400, {"ok": False, "error": "A file name (not a path) is required"})
            remote_path = data["remotePath"].rstrip("/") + "/" + remote
            if route == "/api/ftp/download":
                out = io.BytesIO()
                ftp.retrbinary("RETR " + remote_path, out.write)
                return self.send_json(200, {"ok": True, "fileName": remote, "content": base64.b64encode(out.getvalue()).decode("ascii")})
            if route == "/api/ftp/upload":
                if data.get("confirm") is not True:
                    return self.send_json(400, {"ok": False, "error": "Upload requires explicit confirmation"})
                raw = base64.b64decode(data.get("content", ""), validate=True)
                if len(raw) > 5 * 1024 * 1024:
                    return self.send_json(413, {"ok": False, "error": "File exceeds 5 MB limit"})
                backup_created = False
                backup = io.BytesIO()
                try:
                    ftp.retrbinary("RETR " + remote_path, backup.write)
                    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
                    ftp.storbinary("STOR " + remote_path + ".backup-" + stamp, io.BytesIO(backup.getvalue()))
                    backup_created = True
                except ftplib.error_perm:
                    pass
                ftp.storbinary("STOR " + remote_path, io.BytesIO(raw))
                return self.send_json(200, {"ok": True, "backupCreated": backup_created, "fileName": remote})
        except (OSError, ValueError) + ftplib.all_errors as exc:
            return self.send_json(502, {"ok": False, "error": str(exc)[:300]})
        finally:
            try:
                ftp.quit()
            except Exception:
                ftp.close()

def make_server(port=None):
    global SERVER_PORT
    p = port or PORT
    try:
        srv = ThreadingHTTPServer((HOST, p), Handler)
    except OSError:
        tmp = socket.socket()
        tmp.bind((HOST, 0))
        p = tmp.getsockname()[1]
        tmp.close()
        srv = ThreadingHTTPServer((HOST, p), Handler)
    SERVER_PORT = srv.server_address[1]
    return srv

if __name__ == "__main__":
    if not WEB.is_dir():
        raise SystemExit("Missing web directory")
    srv = make_server()
    print(f"MIDWAY Economy Control: http://{HOST}:{SERVER_PORT}")
    srv.serve_forever()
