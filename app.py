from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import json
import re
import ssl
import time
import ftplib
import base64
import io
import hashlib
import mimetypes
import os
import urllib.parse
import urllib.request
import sys
import socket
import threading
import zipfile
import shutil
import subprocess
import html
from datetime import datetime, timezone

ROOT = Path(__file__).resolve().parent
_BASE = Path(getattr(sys, "_MEIPASS", "")) if getattr(sys, "_MEIPASS", None) else ROOT
WEB = _BASE / "web" if (_BASE / "web").is_dir() else ROOT / "web"
HOST, PORT = "127.0.0.1", 8765
SERVER_PORT = PORT
VERSION = "0.8.22"
REPO = "bLemann/MIDWAYEconomyControl"

def presets_dir():
    base = Path(sys.executable).resolve().parent if getattr(sys, "frozen", False) else ROOT
    d = base / "data" / "presets"
    d.mkdir(parents=True, exist_ok=True)
    return d

def updates_dir():
    base = Path(sys.executable).resolve().parent if getattr(sys, "frozen", False) else ROOT
    d = base / "updates"
    d.mkdir(parents=True, exist_ok=True)
    return d

UPDATE_DL = {"running": False, "done": False, "dl_ok": False, "error": None,
             "downloaded": 0, "total": 0, "percent": 0, "version": "", "path": "", "sha256": ""}

def exports_dir():
    base = Path(sys.executable).resolve().parent if getattr(sys, "frozen", False) else ROOT
    d = base / "exports"
    d.mkdir(parents=True, exist_ok=True)
    return d

def version_newer(candidate, current):
    pa = tuple(int(x) for x in re.findall(r"\d+", candidate)[:4])
    pb = tuple(int(x) for x in re.findall(r"\d+", current)[:4])
    return bool(pa) and bool(pb) and pa > pb

def ftp_ensure_dir(ftp, path):
    parts = [p for p in path.replace("\\", "/").split("/") if p not in ("", ".")]
    if path.startswith("/"):
        try:
            ftp.cwd("/")
        except ftplib.error_perm:
            pass
    created = []
    for part in parts:
        try:
            ftp.cwd(part)
            continue
        except ftplib.error_perm:
            pass
        try:
            ftp.mkd(part)
            created.append(part)
        except ftplib.error_perm as exc:
            s = str(exc).lower()
            if not ("exist" in s or "550" in s or "521" in s):
                raise
        ftp.cwd(part)
    return created

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


QUEST_NAME_RE = re.compile(r"^STORY_[A-Za-z0-9_\-]{1,96}\.json$")
QUEST_NPC = ("GeneralGoods", "Doctor", "Armorer", "Mechanic")
QUEST_TYPES = ("Elimination", "Fetch")
QUEST_TARGETS = ("Puppet",)
QUEST_TIER_REWARD = {1: (1000, 5000, 10, 20), 2: (2000, 3500, 15, 20), 3: (5000, 7500, 25, 30)}
QUEST_INT_KEYS = {"Tier", "SequenceIndex", "Amount", "RequiredNum", "CurrencyNormal", "Fame"}
QUEST_FLOAT_KEYS = {"TimeLimitHours", "MinAcceptedItemHealth"}


def quests_dir():
    d = data_dir() / "quests"
    d.mkdir(parents=True, exist_ok=True)
    return d


def quests_server_dir():
    d = data_dir() / "quests-server"
    d.mkdir(parents=True, exist_ok=True)
    return d


def quest_content_hash(path):
    try:
        raw = path.read_bytes()
    except OSError:
        return None, True
    try:
        doc = json.loads(raw.decode("utf-8"))
    except (json.JSONDecodeError, UnicodeDecodeError):
        return "raw:" + hashlib.sha256(raw).hexdigest(), True
    if not isinstance(doc, dict):
        return "raw:" + hashlib.sha256(raw).hexdigest(), True
    canon = json.dumps(doc, ensure_ascii=False, indent=2).encode("utf-8")
    return hashlib.sha256(canon).hexdigest(), False


def normalize_quest(doc):
    def coerce(key, value):
        if isinstance(value, bool) or value is None:
            return value
        if isinstance(value, str):
            s = value.strip()
            if re.fullmatch(r"-?\d+", s):
                value = int(s)
            elif re.fullmatch(r"-?\d*\.\d+", s):
                value = float(s)
            else:
                return value
        if isinstance(value, (int, float)):
            if key in QUEST_FLOAT_KEYS:
                return float(value)
            if key in QUEST_INT_KEYS:
                if isinstance(value, int) or (isinstance(value, float) and value.is_integer()):
                    return int(value)
        return value

    if isinstance(doc, list):
        return [normalize_quest(x) for x in doc]
    if isinstance(doc, dict):
        out = {}
        for k, v in doc.items():
            if isinstance(v, (list, dict)):
                out[k] = normalize_quest(v)
            else:
                out[k] = coerce(k, v)
        return out
    return doc


def validate_quest(doc):
    issues, warnings = [], []
    if not isinstance(doc, dict):
        return ["Root must be an object"], warnings

    def is_int(v):
        return isinstance(v, int) and not isinstance(v, bool)

    def is_num(v):
        return isinstance(v, (int, float)) and not isinstance(v, bool)

    npc = doc.get("AssociatedNPC")
    if not isinstance(npc, str) or not npc.strip():
        issues.append("AssociatedNPC: требуется строка с именем NPC")
    elif npc not in QUEST_NPC:
        warnings.append("AssociatedNPC '%s' не входит в подтверждённый список (%s) — корректность в игре не проверена" % (npc, ", ".join(QUEST_NPC)))

    tier = doc.get("Tier")
    if not is_int(tier):
        issues.append("Tier: требуется целое число")
    elif tier < 1 or tier > 3:
        issues.append("Tier: значение %s вне диапазона 1–3" % tier)

    title = doc.get("Title")
    if not isinstance(title, str) or not title.strip():
        issues.append("Title: требуется строка")
    elif " | " not in title:
        issues.append("Title: ожидается одна строка формата «RU | EN» с разделителем \" | \"")
    else:
        ru, en = title.split(" | ", 1)
        if not ru.strip():
            issues.append("Title: пустая русская часть перед « | »")
        if not en.strip():
            issues.append("Title: пустая английская часть после « | »")

    desc = doc.get("Description")
    if not isinstance(desc, str) or not desc.strip():
        issues.append("Description: требуется строка")
    elif "\nEN:" not in desc:
        warnings.append("Description: рекомендуется формат «RU: ...\nEN: ...» с переводом строки")

    tl = doc.get("TimeLimitHours")
    if not is_num(tl):
        issues.append("TimeLimitHours: требуется число (например 24.0)")
    elif tl <= 0:
        issues.append("TimeLimitHours: значение должно быть больше нуля")

    rp = doc.get("RewardPool")
    if not isinstance(rp, list) or not rp:
        issues.append("RewardPool: требуется непустой массив")
    else:
        for i, r in enumerate(rp, 1):
            if not isinstance(r, dict):
                issues.append("RewardPool[%d]: ожидается объект" % i)
                continue
            for key in ("CurrencyNormal", "Fame"):
                v = r.get(key)
                if not is_int(v):
                    issues.append("RewardPool[%d].%s: требуется целое число" % (i, key))
                elif v < 0:
                    warnings.append("RewardPool[%d].%s: отрицательное значение (%s) не подтверждено эталонами" % (i, key, v))
                elif is_int(tier) and tier in QUEST_TIER_REWARD:
                    lo_m, hi_m, lo_f, hi_f = QUEST_TIER_REWARD[tier]
                    lo, hi = (lo_m, hi_m) if key == "CurrencyNormal" else (lo_f, hi_f)
                    if v < lo or v > hi:
                        warnings.append("RewardPool[%d].%s: %s вне диапазона, типичного для Tier %d по эталонам (%d–%d)" % (i, key, v, tier, lo, hi))

    conds = doc.get("Conditions")
    if not isinstance(conds, list) or not conds:
        issues.append("Conditions: требуется непустой массив условий")
    else:
        seen_seq = {}
        for i, c in enumerate(conds, 1):
            if not isinstance(c, dict):
                issues.append("Conditions[%d]: ожидается объект" % i)
                continue
            ctype = c.get("Type")
            if ctype not in QUEST_TYPES:
                issues.append("Conditions[%d].Type: '%s' — тип не подтверждён форматом игры (известны: Elimination, Fetch)" % (i, ctype))
                continue
            tc = c.get("TrackingCaption")
            if not isinstance(tc, str) or not tc.strip():
                issues.append("Conditions[%d].TrackingCaption: требуется строка" % i)
            elif " | " not in tc:
                issues.append("Conditions[%d].TrackingCaption: ожидается формат «RU | EN»" % i)
            seq = c.get("SequenceIndex")
            if not is_int(seq):
                issues.append("Conditions[%d].SequenceIndex: требуется целое число" % i)
            else:
                if seq in seen_seq:
                    warnings.append("SequenceIndex %s повторяется в условиях %d и %d" % (seq, seen_seq[seq], i))
                seen_seq[seq] = i
            if not isinstance(c.get("CanBeAutoCompleted"), bool):
                issues.append("Conditions[%d].CanBeAutoCompleted: требуется true/false" % i)
            if ctype == "Elimination":
                targets = c.get("TargetCharacters")
                if not isinstance(targets, list) or not targets:
                    issues.append("Conditions[%d].TargetCharacters: требуется непустой массив" % i)
                else:
                    for t in targets:
                        if not isinstance(t, str) or not t.strip():
                            issues.append("Conditions[%d].TargetCharacters: элементы должны быть непустыми строками" % i)
                            break
                        if t not in QUEST_TARGETS:
                            warnings.append("Conditions[%d].TargetCharacters: '%s' не входит в подтверждённый список (Puppet)" % (i, t))
                amount = c.get("Amount")
                if not is_int(amount):
                    issues.append("Conditions[%d].Amount: требуется целое число" % i)
                elif amount <= 0:
                    issues.append("Conditions[%d].Amount: значение должно быть больше нуля" % i)
            else:
                req = c.get("RequiredItems")
                if not isinstance(req, list) or not req:
                    issues.append("Conditions[%d].RequiredItems: требуется непустой массив групп" % i)
                else:
                    for j, g in enumerate(req, 1):
                        if not isinstance(g, dict):
                            issues.append("Conditions[%d].RequiredItems[%d]: ожидается объект" % (i, j))
                            continue
                        acc = g.get("AcceptedItems")
                        if not isinstance(acc, list) or not acc or any(not isinstance(x, str) or not x.strip() for x in acc):
                            issues.append("Conditions[%d].RequiredItems[%d].AcceptedItems: требуется непустой массив строк" % (i, j))
                        rn = g.get("RequiredNum")
                        if not is_int(rn):
                            issues.append("Conditions[%d].RequiredItems[%d].RequiredNum: требуется целое число" % (i, j))
                        elif rn <= 0:
                            issues.append("Conditions[%d].RequiredItems[%d].RequiredNum: значение должно быть больше нуля" % (i, j))
                        mh = g.get("MinAcceptedItemHealth")
                        if not is_num(mh):
                            issues.append("Conditions[%d].RequiredItems[%d].MinAcceptedItemHealth: требуется число" % (i, j))
                        elif mh < 0:
                            issues.append("Conditions[%d].RequiredItems[%d].MinAcceptedItemHealth: не может быть отрицательным" % (i, j))
                        for flag in ("DisablePurchaseOfRequiredItems", "PlayerKeepsItems", "CanBeAutoCompleted"):
                            if flag in g and not isinstance(g[flag], bool):
                                issues.append("Conditions[%d].RequiredItems[%d].%s: требуется true/false" % (i, j, flag))
    return issues, warnings

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

def icon_zip_file():
    if getattr(sys, "frozen", False):
        ext = Path(sys.executable).resolve().parent / "assets" / "icons.zip"
        if ext.is_file():
            return ext
    base = Path(getattr(sys, "_MEIPASS", "")) if getattr(sys, "_MEIPASS", None) else ROOT
    return base / "assets" / "icons.zip"

_ICON_ZIP_CACHE = None

def bundled_icon_index():
    global _ICON_ZIP_CACHE
    if _ICON_ZIP_CACHE is not None:
        return _ICON_ZIP_CACHE
    idx = {}
    zf = icon_zip_file()
    if zf.is_file():
        for attempt in range(5):
            try:
                with zipfile.ZipFile(zf) as z:
                    for n in z.namelist():
                        p = Path(n)
                        if not n.endswith("/") and p.suffix.lower() in ICON_EXTS:
                            idx.setdefault(p.stem.lower(), n)
                _ICON_ZIP_CACHE = idx
                break
            except (OSError, zipfile.BadZipFile):
                idx = {}
                if attempt == 4:
                    break
                time.sleep(0.3)
    return idx

def removed_icons_file():
    return data_dir() / "icons" / "__removed.json"

def load_removed_icons():
    try:
        raw = json.loads(removed_icons_file().read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return set()
    return {str(x).strip().lower() for x in raw} if isinstance(raw, list) else set()

def save_removed_icons(ids):
    try:
        removed_icons_file().write_text(json.dumps(sorted(ids)), encoding="utf-8")
    except OSError:
        pass

def read_icon_bytes(item_id):
    safe = str(item_id).lower()
    f = find_icon_file(safe)
    if f:
        try:
            return f.read_bytes(), f.suffix.lower()
        except OSError:
            pass
    if safe in load_removed_icons():
        return None, ""
    zn = bundled_icon_index().get(safe)
    if zn:
        for attempt in range(5):
            try:
                with zipfile.ZipFile(icon_zip_file()) as z:
                    return z.read(zn), Path(zn).suffix.lower()
            except (OSError, KeyError, zipfile.BadZipFile):
                if attempt == 4:
                    break
                time.sleep(0.3)
    return None, ""

def release_notes_html(body):
    text = str(body or "")
    def inline(s):
        s = html.escape(s, quote=False)
        s = re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", s)
        s = re.sub(r"`([^`]+)`", r"<code>\1</code>", s)
        return s
    lines, in_list = [], False
    for raw_line in text.splitlines()[:400]:
        line = raw_line.strip()
        if not line:
            if in_list:
                lines.append("</ul>")
                in_list = False
            continue
        if line.startswith(("- ", "* ")):
            if not in_list:
                lines.append("<ul>")
                in_list = True
            lines.append("<li>" + inline(line[2:]) + "</li>")
            continue
        if in_list:
            lines.append("</ul>")
            in_list = False
        m = re.match(r"^#{1,4}\s+(.*)$", line)
        if m:
            lines.append("<h3>" + inline(m.group(1)) + "</h3>")
            continue
        lines.append("<p>" + inline(line) + "</p>")
    if in_list:
        lines.append("</ul>")
    out = "".join(lines)
    return out[:8000]

SSL_CTX = ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
SSL_CTX.check_hostname = False
SSL_CTX.verify_mode = ssl.CERT_NONE

SSL_CTX_TLS12 = ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
SSL_CTX_TLS12.check_hostname = False
SSL_CTX_TLS12.verify_mode = ssl.CERT_NONE
SSL_CTX_TLS12.maximum_version = ssl.TLSVersion.TLSv1_2

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
    def __init__(self, *args, **kwargs):
        kwargs.setdefault("context", SSL_CTX)
        super().__init__(*args, **kwargs)

    def ntransfercmd(self, cmd, rest=None):
        conn, size = ftplib.FTP.ntransfercmd(self, cmd, rest)
        if self._prot_p:
            session = getattr(self.sock, "session", None)
            conn = self.context.wrap_socket(conn, server_hostname=self.host, session=session)
        return conn, size

class FTP_E(_EPSVMixin, ftplib.FTP):
    pass

def ftp_err_text(exc):
    if isinstance(exc, EOFError):
        return "Сервер закрыл соединение до FTP-приветствия — проверьте доступность сервера и включён ли VPN"
    s = str(exc)
    if "SHUTDOWN_WHILE_IN_INIT" in s:
        return "Сервер отклонил TLS-сессию канала данных: FileZilla Server 1.x требует возобновления TLS-сессии на data-канале — проверьте настройки TLS вашего FTP-сервера (должен быть разрешён TLS 1.2)"
    if isinstance(exc, ssl.SSLEOFError) or "UNEXPECTED_EOF" in s:
        return "TLS-соединение оборвано сервером во время рукопожатия (частые причины: VPN выключен, порт фильтруется, сервер не отвечает)"
    if isinstance(exc, ssl.SSLError):
        return "Ошибка TLS: " + s[:160]
    if isinstance(exc, ConnectionRefusedError):
        return "Отказ в соединении — порт закрыт или сервер недоступен"
    if isinstance(exc, TimeoutError) or "timed out" in s:
        return "Таймаут: сервер не отвечает"
    if isinstance(exc, (ConnectionError, OSError)):
        return "Сетевая ошибка: " + s[:160]
    return type(exc).__name__ + ": " + s[:160]

def connect_ftp(data):
    errors = []
    host, port = data["host"], int(data.get("port", 21))
    for attempt in range(2):
        try:
            ftp = FTP_TLS_E(timeout=12, context=SSL_CTX_TLS12 if attempt == 0 else SSL_CTX)
            ftp.connect(host, port)
            ftp.login(data["username"], data["password"])
            ftp.prot_p()
            return ftp, True
        except ftplib.error_perm as exc:
            msg = str(exc).lower()
            if any(k in msg for k in ("auth", "tls", "ssl")):
                errors.append("TLS отклонён сервером: " + str(exc)[:160])
                break
            raise
        except (ssl.SSLError, ConnectionError, TimeoutError, OSError, EOFError) as exc:
            errors.append(ftp_err_text(exc))
            if attempt == 0:
                time.sleep(1.2)
                continue
            break
    try:
        ftp = FTP_E(timeout=12)
        ftp.connect(host, port)
        ftp.login(data["username"], data["password"])
        return ftp, False
    except Exception as exc:
        errors.append("Plain FTP: " + ftp_err_text(exc))
        raise ValueError(" | ".join(errors))


# ============================================================ SCUM Loot DB (module L)

LOOT_RARITIES = ("Abundant", "Common", "Uncommon", "Rare", "VeryRare", "ExtremelyRare")
LOOT_NODE_SCOPES = ("Default", "Current")
LOOT_TREE_CAP = 5000
LOOT_LOCATIONS = ("Coastal", "Continental", "Mountain")
LOOT_CANONICAL_KEYS = (
    "FixedItems", "Items", "Nodes", "Subpresets", "Probability", "QuantityMin", "QuantityMax",
    "AllowDuplicates", "ShouldFilterItemsByZone", "ShouldApplyLocationSpecificProbabilityModifier",
    "ShouldApplyLocationSpecificDamageModifier", "InitialDamage", "RandomDamage", "InitialUsage",
    "RandomUsage", "InitialStack", "RandomStack", "PostSpawnActions")
LOOT_ITEM_ORDER = (
    "Id", "IsDisabledForSpawning", "AllowedLocations", "CooldownPerSquadMemberMin",
    "CooldownPerSquadMemberMax", "CooldownGroup", "Variations",
    "ShouldOverrideInitialAndRandomUsage", "InitialUsageOverride", "RandomUsageOverride",
    "ShouldOverrideInitialAndRandomStack", "InitialStackOverride", "RandomStackOverride")
LOOT_ITEM_NUM = ("CooldownPerSquadMemberMin", "CooldownPerSquadMemberMax", "InitialUsageOverride",
                 "RandomUsageOverride", "InitialStackOverride", "RandomStackOverride")
LOOT_ITEM_BOOL = ("IsDisabledForSpawning", "ShouldOverrideInitialAndRandomUsage",
                  "ShouldOverrideInitialAndRandomStack")
LOOT_WORK_SECTIONS = ("presets", "items", "cooldowns", "nodes", "zones")
LOOT_MERGE_MODES = ("Replace", "Append")
LOOT_FILE_RE = re.compile(r"^[A-Za-z0-9_\- ()]{1,96}\.json$")
LOOT_MOD_RE = re.compile(r"^[A-Za-z0-9_\- .]{1,64}$")
LOOT_KNOWN_SPAWNER_KEYS = frozenset({
    "Items", "Nodes", "FixedItems", "Subpresets", "Probability", "QuantityMin", "QuantityMax",
    "AllowDuplicates", "InitialStack", "RandomStack", "InitialUsage", "RandomUsage",
    "InitialDamage", "RandomDamage", "ShouldFilterItemsByZone", "Zones",
    "ShouldApplyLocationSpecificProbabilityModifier", "ShouldApplyLocationSpecificDamageModifier",
    "PostSpawnActions", "MinCashAmount", "MaxCashAmount",
})
LOOT_LOCK = threading.Lock()
LOOT_CACHE = {"root": "", "db": None}


def loot_base_dir():
    return Path(sys.executable).resolve().parent if getattr(sys, "frozen", False) else ROOT


def loot_root():
    override = data_dir() / "loot-root.txt"
    try:
        txt = override.read_text(encoding="utf-8-sig").strip().strip('"').strip()
    except OSError:
        txt = ""
    if txt:
        p = Path(txt)
        if p.name.lower() != "lootbr" and ((p / "Loot").is_dir() or (p / "Spawners").is_dir() or (p / "Nodes").is_dir()):
            return p, "data\\loot-root.txt"
    base = loot_base_dir()
    for cand in (data_dir() / "loot-server", data_dir() / "LootBP", base / "LootBP", base.parent / "LootBP",
                 base.parent.parent / "LootBP"):
        if cand.name.lower() == "lootbr":
            continue
        if (cand / "Loot").is_dir() or (cand / "Spawners").is_dir() or (cand / "Nodes").is_dir():
            return cand, "auto"
    return None, "not-found"


def loot_base(root):
    for cand in (root / "Loot", root):
        if (cand / "Spawners" / "Presets" / "Default").is_dir() or (cand / "Nodes").is_dir() or (cand / "Items").is_dir():
            return cand
    return root


def loot_cooldowns_file(root, base):
    for cand in (root / "CooldownGroups", base / "CooldownGroups"):
        f = cand / "Default" / "CooldownGroups.json"
        if f.is_file():
            return f
    return None


def loot_read_json(path, errors):
    try:
        return json.loads(path.read_text(encoding="utf-8-sig"))
    except (OSError, json.JSONDecodeError, UnicodeDecodeError) as exc:
        if errors is not None and len(errors) < 60:
            errors.append({"file": path.name, "error": str(exc)[:180]})
    return None


def loot_families(doc):
    fam = {"items": 0, "nodes": 0, "fixed": 0, "subpresets": 0, "cash": False}
    if not isinstance(doc, dict):
        return fam
    if isinstance(doc.get("Items"), list):
        fam["items"] = len(doc["Items"])
        fam["cash"] = any(isinstance(e, dict) and str(e.get("Id", "")).lower() == "cash" for e in doc["Items"])
    if isinstance(doc.get("Nodes"), list):
        fam["nodes"] = sum(len(e.get("Ids") or []) for e in doc["Nodes"] if isinstance(e, dict))
    if isinstance(doc.get("FixedItems"), list):
        fam["fixed"] = len(doc["FixedItems"])
    if isinstance(doc.get("Subpresets"), list):
        fam["subpresets"] = len(doc["Subpresets"])
    return fam


def loot_scan_presets(folder, errors, mod=None):
    groups = {}
    for f in sorted(folder.rglob("*.json")):
        if f.name == "Zones.json":
            continue
        groups.setdefault(f.stem, []).append(f)
    out = {}
    for stem, files in groups.items():
        if len(files) > 1:
            files.sort(key=lambda p: (len(p.relative_to(folder).parts), str(p)))
        f = files[0]
        doc = loot_read_json(f, errors)
        if doc is None:
            continue
        if not isinstance(doc, dict):
            errors.append({"file": f.name, "error": "root is not an object"})
            continue
        entry = {
            "id": stem,
            "group": stem.split("-", 1)[0],
            "mod": mod,
            "doc": doc,
            "families": loot_families(doc),
        }
        if len(files) > 1:
            entry["dupPaths"] = [p.relative_to(folder).as_posix() for p in files]
            try:
                entry["dupIdentical"] = all(
                    json.dumps(loot_read_json(p, None), sort_keys=True, ensure_ascii=False)
                    == json.dumps(doc, sort_keys=True, ensure_ascii=False) for p in files[1:])
            except (OSError, ValueError):
                entry["dupIdentical"] = False
        out[stem] = entry
    return out


def loot_scan_nodes(folder, errors):
    out = {}
    for f in sorted(folder.glob("*.json")):
        doc = loot_read_json(f, errors)
        if not isinstance(doc, dict):
            continue
        root = doc if isinstance(doc.get("Name"), str) else None
        out[f.stem.lower()] = {"name": f.stem, "root": root}
    return out


def loot_node_stats(root_node, items_known):
    stats = {"leaves": 0, "internal": 0, "depth": 0, "unknown": [], "rarityBad": 0, "extraKeys": set()}

    def walk(node, depth):
        if not isinstance(node, dict) or stats["leaves"] + stats["internal"] > 20000:
            return
        stats["depth"] = max(stats["depth"], depth)
        for k in node:
            if k not in ("Name", "Rarity", "Children", "PostSpawnActions"):
                stats["extraKeys"].add(k)
        rar = node.get("Rarity")
        if rar is not None and rar not in LOOT_RARITIES:
            stats["rarityBad"] += 1
        children = node.get("Children")
        if isinstance(children, list) and children:
            stats["internal"] += 1
            for ch in children:
                walk(ch, depth + 1)
        else:
            stats["leaves"] += 1
            name = node.get("Name")
            if items_known is not None and isinstance(name, str) and name not in items_known \
                    and len(stats["unknown"]) < 20 and name not in stats["unknown"]:
                stats["unknown"].append(name)

    walk(root_node, 0)
    stats["extraKeys"] = sorted(stats["extraKeys"])
    return stats


def loot_resolve_node(nodes_map, ref):
    parts = [p for p in re.split(r"[./]", str(ref).strip()) if p]
    if parts and parts[0].lower() == "itemloottreenodes":
        parts = parts[1:]
    if not parts:
        return None, "empty ref"
    entry = nodes_map.get(parts[0].lower())
    if not entry:
        return None, "файл дерева не найден: " + parts[0]
    node = entry.get("root")
    if node is None:
        return None, "в файле нет дерева: " + parts[0]
    for seg in parts:
        nxt = None
        children = node.get("Children") if isinstance(node, dict) else None
        if isinstance(children, list):
            for ch in children:
                if isinstance(ch, dict) and str(ch.get("Name", "")).lower() == seg.lower():
                    nxt = ch
                    break
        if nxt is None:
            return None, "узел не найден: " + seg
        node = nxt
    return node, None


def loot_spawner_refs(doc):
    node_refs, item_ids, sub_ids = [], [], []
    if not isinstance(doc, dict):
        return node_refs, item_ids, sub_ids
    for e in doc.get("Nodes") or []:
        if isinstance(e, dict):
            node_refs.extend(str(x) for x in (e.get("Ids") or []) if isinstance(x, str))
    for e in doc.get("Items") or []:
        if isinstance(e, dict) and isinstance(e.get("Id"), str):
            item_ids.append(e["Id"])
    fx = doc.get("FixedItems")
    if isinstance(fx, list):
        item_ids.extend(x for x in fx if isinstance(x, str))
    for e in doc.get("Subpresets") or []:
        if isinstance(e, dict) and isinstance(e.get("Id"), str):
            sub_ids.append(e["Id"])
    return node_refs, item_ids, sub_ids


def loot_validate(db):
    issues = {}

    def add(level, code, message, ref=None):
        key = code + "|" + message
        it = issues.get(key)
        if it is None:
            it = issues[key] = {"level": level, "code": code, "message": message, "count": 0, "refs": []}
        it["count"] += 1
        if ref and len(it["refs"]) < 40 and ref not in it["refs"]:
            it["refs"].append(ref)
        return it

    items = db["items"]
    nodes_map = db["nodesResolve"]
    groups_defined = {g.get("Name") for g in (db["cooldowns"] or {}).get("CooldownGroups", []) if isinstance(g, dict)}

    def check_preset(e, where):
        doc = e["doc"]
        label = (e["mod"] + "/" + e["id"]) if e.get("mod") else e["id"]
        node_refs, item_ids, sub_ids = loot_spawner_refs(doc)
        for r in node_refs:
            _, err = loot_resolve_node(nodes_map, r)
            if err:
                add("ERROR", "node-ref", err + " ← " + where + " " + label, r)
        rar_bad = sorted({str(e2["Rarity"]) for e2 in (doc.get("Nodes") or [])
                          if isinstance(e2, dict) and e2.get("Rarity") is not None and e2["Rarity"] not in LOOT_RARITIES})
        if rar_bad:
            add("ERROR", "rarity", "недопустимое значение Rarity (" + ", ".join(rar_bad) + ") — " + label, label)
        for i in sorted({i for i in item_ids if i not in items}):
            add("WARNING", "item-unknown", "Id предмета отсутствует в Parameters.json: " + i, label)
        prob = doc.get("Probability")
        if prob is not None and (isinstance(prob, bool) or not isinstance(prob, (int, float)) or not (0 <= prob <= 100)):
            add("ERROR", "probability", "Probability вне 0..100 (" + str(prob) + ") — " + label, label)
        qmin, qmax = doc.get("QuantityMin"), doc.get("QuantityMax")
        if qmin is not None or qmax is not None:
            vals = [v for v in (qmin, qmax) if v is not None]
            ok = all(isinstance(v, (int, float)) and not isinstance(v, bool) for v in vals)
            ok = ok and (qmin is None or qmax is None or qmin <= qmax)
            if not ok:
                add("ERROR", "quantity", "QuantityMin/Max некорректны (" + str(qmin) + ".." + str(qmax) + ") — " + label, label)
        for s in sub_ids:
            found = s in db["spawners"] or (e.get("mod") and s in db["overrides"].get(e["mod"], {}).get("presets", {}))
            if not found:
                add("ERROR", "subpreset-ref", "Subpreset не найден: " + s + " ← " + label, s)
        for extra in sorted(set(doc) - LOOT_KNOWN_SPAWNER_KEYS):
            add("INFO", "spawner-extra-key", "неизвестный ключ спавнера: " + extra + " (" + label + ")", label)

    for e in db["spawners"].values():
        check_preset(e, "vanilla")
    for mod in db["overrides"].values():
        for e in mod["presets"].values():
            check_preset(e, "override")
    for name, mod in db["overrides"].items():
        for pid in mod["presets"]:
            if pid not in db["spawners"]:
                add("INFO", "override-orphan", "Override-пресет без ванильного аналога: " + name + "/" + pid, pid)
        for e in mod["presets"].values():
            if e.get("dupPaths"):
                if e.get("dupIdentical"):
                    add("INFO", "override-dup", "Дубликат пресета (копии идентичны, используется первый): " + name + " :: " + " | ".join(e["dupPaths"]), e["id"])
                else:
                    add("WARNING", "override-dup-diff", "Дубликат пресета с РАЗНЫМ содержимым — используется первый: " + name + " :: " + " | ".join(e["dupPaths"]), e["id"])
    for k, v in db["nodesResolve"].items():
        st = db["nodeStatsMerged"].get(k) or loot_node_stats(v.get("root"), items)
        for i in st["unknown"]:
            add("WARNING", "leaf-unknown", "Лист дерева отсутствует в Parameters.json: " + i, v["name"])
        if st["rarityBad"]:
            add("ERROR", "node-rarity", "Rarity вне enum в дереве (" + str(st["rarityBad"]) + " узлов) — " + v["name"], v["name"])
        for x in st["extraKeys"]:
            add("INFO", "node-extra-key", "неизвестный ключ узла дерева: " + x + " — " + v["name"], v["name"])
    if db["nodes"]["Default"] and db["nodes"]["Current"]:
        diff = [v["name"] for k, v in db["nodes"]["Current"].items() if k in db["nodes"]["Default"]
                and json.dumps(v.get("doc"), sort_keys=True, ensure_ascii=False) != json.dumps(db["nodes"]["Default"][k].get("doc"), sort_keys=True, ensure_ascii=False)]
        if diff:
            it = add("INFO", "current-diff", "Nodes\\Current отличается от Default в " + str(len(diff)) + " файлах", diff[0])
            for nm in diff[1:40]:
                if nm not in it["refs"]:
                    it["refs"].append(nm)
    for name, mod in db["overrides"].items():
        if mod["zonesFile"]:
            used = sum(1 for e in mod["presets"].values() if e["doc"].get("ShouldFilterItemsByZone") is True)
            if used == 0:
                add("INFO", "zones-unused", "Zones.json есть, но ни один пресет мода не использует ShouldFilterItemsByZone — " + name, name)
        elif any(e["doc"].get("ShouldFilterItemsByZone") is True for e in mod["presets"].values()):
            add("WARNING", "zones-missing", "Пресеты мода используют ShouldFilterItemsByZone, но Zones.json нет — " + name, name)
    cg = db["cooldowns"]
    if isinstance(cg, dict):
        used = {e.get("CooldownGroup") for e in db["items"].values() if isinstance(e.get("CooldownGroup"), str) and e["CooldownGroup"]}
        for e in db["items"].values():
            g = e.get("CooldownGroup")
            if isinstance(g, str) and g and g not in groups_defined:
                add("ERROR", "cooldown-undef", "CooldownGroup не определена: " + g, e.get("Id"))
        for g in sorted(x for x in groups_defined if x and x not in used):
            add("INFO", "cooldown-unused", "Группа кулдауна определена, но не используется: " + g, g)
    elif db["items"]:
        add("WARNING", "cooldown-missing", "CooldownGroups.json не найден или не читается", None)
    if not db["items"]:
        add("ERROR", "items-missing", "Parameters.json не найден или не содержит записей", None)
    if not db["spawners"]:
        add("ERROR", "spawners-missing", "Пресеты Default не найдены", None)
    order = {"ERROR": 0, "WARNING": 1, "INFO": 2}
    out = sorted(issues.values(), key=lambda x: (order[x["level"]], x["code"], x["message"]))
    counts = {lv: sum(1 for x in out if x["level"] == lv) for lv in order}
    return {"counts": counts, "issues": out[:500], "total": len(out)}


def loot_build_db(root):
    errors = []
    db = {"root": str(root), "built": datetime.now().isoformat(timespec="seconds"), "errors": errors}
    loot_dir = loot_base(root)
    ddir = loot_dir / "Spawners" / "Presets" / "Default"
    db["spawners"] = loot_scan_presets(ddir, errors) if ddir.is_dir() else {}
    db["overrides"] = {}
    odir = loot_dir / "Spawners" / "Presets" / "Override"
    if odir.is_dir():
        for md in sorted((p for p in odir.iterdir() if p.is_dir()), key=lambda p: p.name):
            entry = {"presets": loot_scan_presets(md, errors, mod=md.name), "zonesFile": False, "zones": [],
                     "zonesDoc": None}
            zj = md / "Zones.json"
            if zj.is_file():
                zdoc = loot_read_json(zj, errors)
                if isinstance(zdoc, dict):
                    entry["zonesDoc"] = zdoc
                    if isinstance(zdoc.get("Zones"), list):
                        entry["zonesFile"] = True
                        entry["zones"] = zdoc["Zones"]
            db["overrides"][md.name] = entry
    db["nodes"] = {}
    for scope in LOOT_NODE_SCOPES:
        nd = loot_dir / "Nodes" / scope
        db["nodes"][scope] = loot_scan_nodes(nd, errors) if nd.is_dir() else {}
    db["items"] = {}
    pfile = loot_dir / "Items" / "Default" / "Parameters.json"
    if pfile.is_file():
        pdoc = loot_read_json(pfile, errors)
        if isinstance(pdoc, dict) and isinstance(pdoc.get("Parameters"), list):
            for e in pdoc["Parameters"]:
                if isinstance(e, dict) and isinstance(e.get("Id"), str):
                    db["items"][e["Id"]] = e
    db["cooldowns"] = None
    cfile = loot_cooldowns_file(root, loot_dir)
    if cfile is not None:
        cdoc = loot_read_json(cfile, errors)
        if isinstance(cdoc, dict):
            db["cooldowns"] = cdoc
    actions, skeys, ikeys = set(), set(), set()
    all_presets = list(db["spawners"].values())
    for m in db["overrides"].values():
        all_presets.extend(m["presets"].values())
    for e in all_presets:
        doc = e["doc"]
        skeys.update(str(k) for k in doc)
        for a in doc.get("PostSpawnActions") or []:
            if isinstance(a, str):
                actions.add(a)
        for it in doc.get("Items") or []:
            if isinstance(it, dict):
                ikeys.update(str(k) for k in it)
    db["postActions"] = sorted(actions)
    db["spawnerKeys"] = sorted(skeys)
    db["itemEntryKeys"] = sorted(ikeys)
    effective = "Current" if db["nodes"]["Current"] else "Default"
    items_known = set(db["items"])
    db["nodeScope"] = effective
    db["nodeStats"] = {}
    for scope in LOOT_NODE_SCOPES:
        db["nodeStats"][scope] = {k: loot_node_stats(v.get("root"), items_known) for k, v in db["nodes"][scope].items()}
    db["nodesResolve"] = dict(db["nodes"]["Default"])
    db["nodesResolve"].update(db["nodes"]["Current"])
    db["nodeStatsMerged"] = dict(db["nodeStats"]["Default"])
    db["nodeStatsMerged"].update(db["nodeStats"]["Current"])
    db["counts"] = {
        "spawners": len(db["spawners"]),
        "overrideMods": len(db["overrides"]),
        "overridePresets": sum(len(m["presets"]) for m in db["overrides"].values()),
        "zonesFiles": sum(1 for m in db["overrides"].values() if m["zonesFile"]),
        "nodesDefault": len(db["nodes"]["Default"]),
        "nodesCurrent": len(db["nodes"]["Current"]),
        "items": len(db["items"]),
        "cooldownGroups": len((db["cooldowns"] or {}).get("CooldownGroups") or []),
    }
    db["validation"] = loot_validate(db)
    return db


def loot_load_db(force=False):
    root, source = loot_root()
    with LOOT_LOCK:
        if root is None:
            return None, source
        if not force and LOOT_CACHE["db"] is not None and LOOT_CACHE["root"] == str(root):
            return LOOT_CACHE["db"], source
        db = loot_build_db(root)
        LOOT_CACHE["root"] = str(root)
        LOOT_CACHE["db"] = db
        return db, source


def loot_working_key(mod, pid):
    return (str(mod) + "/" + str(pid)) if mod else str(pid)


def loot_working_file():
    return data_dir() / "loot-working.json"


def loot_working_load():
    try:
        d = json.loads(loot_working_file().read_text(encoding="utf-8-sig"))
    except (OSError, ValueError):
        d = None
    if not isinstance(d, dict):
        d = {}
    out = {}
    for sec in LOOT_WORK_SECTIONS:
        v = d.get(sec)
        out[sec] = {str(k): e for k, e in v.items() if isinstance(e, dict)} if isinstance(v, dict) else {}
    return out


def loot_working_store(d):
    f = loot_working_file()
    tmp = f.with_name("loot-working.tmp")
    tmp.write_text(json.dumps(d, ensure_ascii=False, indent=1), encoding="utf-8")
    tmp.replace(f)


def loot_sort_doc(doc):
    if not isinstance(doc, dict):
        return doc
    out = {}
    for k in LOOT_CANONICAL_KEYS:
        if k in doc:
            out[k] = doc[k]
    for k in doc:
        if k not in out and k != "PostSpawnActions":
            out[k] = doc[k]
    if "PostSpawnActions" in doc:
        out["PostSpawnActions"] = doc["PostSpawnActions"]
    return out


def loot_num(v, default=0.0):
    if isinstance(v, bool) or not isinstance(v, (int, float)):
        try:
            return float(str(v).strip().replace(",", "."))
        except (ValueError, TypeError, AttributeError):
            return default
    return float(v)


def loot_item_patch_clean(patch):
    issues = []
    if not isinstance(patch, dict) or not patch:
        return {}, ["patch: непустой объект обязателен"]
    clean = {}
    for k, v in patch.items():
        if k == "AllowedLocations":
            if not isinstance(v, list) or not v:
                issues.append("AllowedLocations: непустой список обязателен")
                continue
            vals, bad = [], []
            for x in v:
                s = str(x or "").strip()
                if s in LOOT_LOCATIONS and s not in vals:
                    vals.append(s)
                elif s not in LOOT_LOCATIONS:
                    bad.append(s[:30])
            if bad:
                issues.append("AllowedLocations: недопустимые значения: " + ", ".join(bad))
                continue
            clean[k] = [loc for loc in LOOT_LOCATIONS if loc in vals]
        elif k == "CooldownGroup":
            s = str(v if v is not None else "").strip()
            clean[k] = s[:120] if s else None
        elif k in LOOT_ITEM_NUM:
            if isinstance(v, bool) or not isinstance(v, (int, float)):
                issues.append(k + ": ожидается число")
                continue
            if v < 0:
                issues.append(k + ": должно быть ≥ 0")
                continue
            clean[k] = float(v)
        elif k in LOOT_ITEM_BOOL:
            if not isinstance(v, bool):
                issues.append(k + ": ожидается true/false")
                continue
            clean[k] = v
        else:
            issues.append("неизвестное поле: " + str(k)[:60])
    if ("CooldownPerSquadMemberMin" in clean and clean["CooldownPerSquadMemberMin"] is not None
            and "CooldownPerSquadMemberMax" in clean and clean["CooldownPerSquadMemberMax"] is not None
            and clean["CooldownPerSquadMemberMin"] > clean["CooldownPerSquadMemberMax"]):
        issues.append("CooldownPerSquadMemberMin > Max")
    return clean, issues


def loot_item_apply(base, patch):
    e = dict(base or {})
    for k, v in patch.items():
        if v is None:
            e.pop(k, None)
        else:
            e[k] = v
    out = {}
    for k in LOOT_ITEM_ORDER:
        if k in e:
            out[k] = e[k]
    for k in e:
        if k not in out:
            out[k] = e[k]
    return out


def loot_items_merged(db, wd, remote=None):
    merged = {k: dict(v) for k, v in (db or {}).get("items", {}).items()}
    for k, v in (remote or {}).items():
        if isinstance(v, dict):
            merged[k] = dict(v)
    for iid, we in wd["items"].items():
        merged[iid] = loot_item_apply(merged.get(iid) or {"Id": iid}, we.get("patch") or {})
    return {"Parameters": [merged[k] for k in sorted(merged)]}


def loot_cooldown_clean(doc):
    issues = []
    if not isinstance(doc, dict):
        return {}, ["doc: объект обязателен"]
    out = {}
    if "DeleteAllDefaultCooldownGroups" in doc:
        if not isinstance(doc["DeleteAllDefaultCooldownGroups"], bool):
            issues.append("DeleteAllDefaultCooldownGroups: ожидается true/false")
        else:
            out["DeleteAllDefaultCooldownGroups"] = doc["DeleteAllDefaultCooldownGroups"]
    if "DefaultCooldownGroupsToDelete" in doc:
        v = doc["DefaultCooldownGroupsToDelete"]
        if not isinstance(v, list) or any(not isinstance(x, str) or not x.strip() for x in v):
            issues.append("DefaultCooldownGroupsToDelete: список непустых строк")
        else:
            out["DefaultCooldownGroupsToDelete"] = []
            for x in v:
                s = x.strip()[:120]
                if s not in out["DefaultCooldownGroupsToDelete"]:
                    out["DefaultCooldownGroupsToDelete"].append(s)
    groups = doc.get("CooldownGroups")
    if not isinstance(groups, list) or not groups:
        issues.append("CooldownGroups: непустой список обязателен")
        groups = []
    clean_groups, names = [], set()
    for i, g in enumerate(groups):
        if not isinstance(g, dict):
            issues.append("CooldownGroups[" + str(i) + "]: объект обязателен")
            continue
        name = str(g.get("Name") or "").strip()
        if not name or not ITEM_ID_RE.match(name):
            issues.append("CooldownGroups[" + str(i) + "]: Name обязателен (латиница/цифры/_/-)")
            continue
        mn, mx = loot_num(g.get("CooldownMin", 0)), loot_num(g.get("CooldownMax", 0))
        if mn < 0 or mx < 0:
            issues.append("CooldownGroups[" + str(i) + "]: таймеры должны быть ≥ 0")
            continue
        if mn > mx:
            issues.append("CooldownGroups[" + str(i) + "]: CooldownMin > CooldownMax")
            continue
        if name in names:
            issues.append("CooldownGroups[" + str(i) + "]: дубликат Name " + name)
            continue
        names.add(name)
        cg = {"Name": name, "CooldownMin": mn, "CooldownMax": mx}
        if isinstance(g.get("IsAffectedByLowerGroups"), bool):
            cg["IsAffectedByLowerGroups"] = g["IsAffectedByLowerGroups"]
        clean_groups.append(cg)
    out["CooldownGroups"] = clean_groups
    if not clean_groups and not issues:
        issues.append("CooldownGroups: список пуст")
    return out, issues


def loot_node_clean(doc):
    issues = []
    if not isinstance(doc, dict):
        return None, ["doc: объект обязателен"]
    if not isinstance(doc.get("Name"), str) or not doc["Name"].strip():
        return None, ["Name: непустая строка обязательна на корне файла"]
    counter = {"n": 0}

    def walk(node):
        counter["n"] += 1
        if counter["n"] > 20000:
            issues.append("Слишком много узлов (>20000)")
            return
        if not isinstance(node, dict):
            issues.append("Узел дерева должен быть объектом")
            return
        mm = node.get("ChildrenMergeMode")
        if mm is not None and mm not in LOOT_MERGE_MODES:
            issues.append("ChildrenMergeMode: только Replace или Append")
        ch = node.get("Children")
        if ch is not None and not isinstance(ch, list):
            issues.append("Children должен быть списком")
            return
        if isinstance(ch, list):
            for c in ch:
                walk(c)

    walk(doc)
    return doc, issues


def loot_zone_clean(doc):
    issues, warns = [], []
    if not isinstance(doc, dict):
        return None, ["doc: объект обязателен"], warns
    zones = doc.get("Zones")
    if not isinstance(zones, list):
        return None, ["Zones: список обязателен"], warns
    for i, z in enumerate(zones):
        if not isinstance(z, dict):
            issues.append("Zones[" + str(i) + "]: объект обязателен")
            continue
        for side in ("TopLeft", "BottomRight"):
            v = z.get(side)
            if not isinstance(v, str) or not v.strip():
                warns.append("Zones[" + str(i) + "]: нет " + side)
    return doc, issues, warns


def loot_publish_jobs(typ, wd, db=None, remote_items=None, keys=None):
    jobs, skipped, seen = [], [], set()

    def add(key, rel, doc):
        if key in seen or doc is None:
            return
        seen.add(key)
        jobs.append({"key": key, "rel": rel, "doc": doc})

    sec = {"preset": "presets", "items": "items", "cooldowns": "cooldowns",
           "nodes": "nodes", "zones": "zones"}.get(typ)
    if sec is None:
        return jobs, skipped
    if typ == "items":
        if not wd["items"]:
            return jobs, skipped
        if db is None:
            skipped.append({"key": "items", "reason": "нет базы лута"})
            return jobs, skipped
        add("items", "/Items/Override/Parameters.json", loot_items_merged(db, wd, remote_items))
        return jobs, skipped
    key_list = [str(k or "") for k in keys] if keys is not None else list(wd[sec].keys())
    for k in key_list:
        e = wd[sec].get(k)
        if not isinstance(e, dict) or not isinstance(e.get("doc"), dict):
            skipped.append({"key": k[:80], "reason": "правка не найдена в WORKING"})
            continue
        if typ == "preset":
            pid = str(e.get("id") or "")
            mod = str(e.get("mod") or "")
            if not pid or not re.match(r"^[A-Za-z0-9_\- .()]+$", pid) or (mod and not LOOT_MOD_RE.match(mod)):
                skipped.append({"key": k[:80], "reason": "недопустимое имя файла"})
                continue
            sub = "/Override/" + mod if mod else "/Default"
            add(k, "/Spawners/Presets" + sub + "/" + pid + ".json", loot_sort_doc(e["doc"]))
        elif typ == "cooldowns":
            name = str(e.get("name") or k)
            if not LOOT_FILE_RE.match(name):
                skipped.append({"key": k[:80], "reason": "недопустимое имя файла"})
                continue
            add(k, "/CooldownGroups/Override/" + name, e["doc"])
        elif typ == "nodes":
            name = str(e.get("name") or k)
            if not LOOT_FILE_RE.match(name):
                skipped.append({"key": k[:80], "reason": "недопустимое имя файла"})
                continue
            add(k, "/Nodes/Override/" + name, e["doc"])
        elif typ == "zones":
            if not LOOT_MOD_RE.match(k):
                skipped.append({"key": k[:80], "reason": "недопустимое имя мода"})
                continue
            add(k, "/Spawners/Presets/Override/" + k + "/Zones.json", e["doc"])
    return jobs, skipped


LOOT_SNAP_LIMITS = {"files": 6000, "bytes": 200 * 1024 * 1024, "depth": 10}


def loot_list_dir(conn, path, stats):
    entries = []
    try:
        for nm, facts in conn.mlsd(path or "/"):
            if nm in (".", ".."):
                continue
            entries.append((nm, facts.get("type", "file") == "dir", facts.get("size", "")))
        return entries
    except (ftplib.error_perm, ftplib.error_proto, AttributeError):
        pass
    names = []
    try:
        for nm in conn.nlst(path or "/"):
            base = nm.rstrip("/").rsplit("/", 1)[-1]
            if base and base not in (".", ".."):
                names.append(base)
    except (ftplib.error_perm, ftplib.error_proto, OSError):
        stats["errors"] += 1
        return entries
    base_path = (path or "/").rstrip("/")
    for base in names:
        full = base_path + "/" + base
        try:
            conn.cwd(full)
            conn.cwd(base_path or "/")
            entries.append((base, True, ""))
        except ftplib.error_perm:
            entries.append((base, False, ""))
    return entries


def loot_walk_download(conn, remote, local, stats, deadline, depth):
    if depth > LOOT_SNAP_LIMITS["depth"] or stats["files"] > LOOT_SNAP_LIMITS["files"] \
            or stats["bytes"] > LOOT_SNAP_LIMITS["bytes"] or time.monotonic() > deadline:
        stats["truncated"] = True
        return
    stats["dirs"] += 1
    for nm, is_dir, _size in loot_list_dir(conn, remote, stats):
        if time.monotonic() > deadline or stats["files"] > LOOT_SNAP_LIMITS["files"] \
                or stats["bytes"] > LOOT_SNAP_LIMITS["bytes"]:
            stats["truncated"] = True
            return
        if "/" in nm or "\\" in nm or nm in (".", ".."):
            continue
        full = (remote.rstrip("/") or "") + "/" + nm
        lp = local / nm
        if is_dir:
            loot_walk_download(conn, full, lp, stats, deadline, depth + 1)
            continue
        buf = io.BytesIO()
        try:
            conn.retrbinary("RETR " + full, buf.write)
        except (ftplib.error_perm, ftplib.error_proto) as exc:
            stats["errors"] += 1
            if len(stats["errorList"]) < 30:
                stats["errorList"].append({"file": nm, "error": str(exc)[:160]})
            continue
        raw = buf.getvalue()
        if len(raw) > 5 * 1024 * 1024:
            stats["errors"] += 1
            if len(stats["errorList"]) < 30:
                stats["errorList"].append({"file": nm, "error": "файл больше 5 МБ — пропущен"})
            continue
        lp.parent.mkdir(parents=True, exist_ok=True)
        lp.write_bytes(raw)
        stats["files"] += 1
        stats["bytes"] += len(raw)


class Handler(SimpleHTTPRequestHandler):
    extensions_map = {**SimpleHTTPRequestHandler.extensions_map, ".webp": "image/webp"}
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
        if self.path == "/api/quests":
            return self.handle_quests_list()
        if self.path == "/api/connections":
            return self.send_json(200, {"ok": True, "connections": load_connections()})
        if self.path == "/api/custom-items":
            return self.send_json(200, {"ok": True, "items": load_custom_items()})
        if self.path.startswith("/api/icon/"):
            name = urllib.parse.unquote(self.path[len("/api/icon/"):].split("?", 1)[0])
            safe = re.sub(r"[^A-Za-z0-9_\-]", "", name)
            if not safe:
                return self.send_json(400, {"ok": False, "error": "Invalid icon id"})
            body, ext = read_icon_bytes(safe)
            if not body:
                return self.send_json(404, {"ok": False, "error": "Icon not found"})
            ctype = mimetypes.types_map.get(ext, "application/octet-stream")
            self.send_response(200)
            self.send_header("Content-Type", ctype)
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(body)
            return
        if self.path.startswith("/api/loot/"):
            return self.handle_loot()
        if self.path == "/api/update/progress":
            return self.handle_update_progress()
        return super().do_GET()

    def do_POST(self):
        origin = self.headers.get("Origin")
        if origin and origin not in (f"http://{HOST}:{SERVER_PORT}", f"http://localhost:{SERVER_PORT}"):
            return self.send_json(403, {"ok": False, "error": "Cross-origin requests are not allowed"})
        if self.path not in ("/api/economy/validate", "/api/quests/save", "/api/quests/delete", "/api/quests/diff", "/api/ftp/list", "/api/ftp/find", "/api/ftp/download", "/api/ftp/upload", "/api/ftp/snapshot", "/api/ftp/upload-batch", "/api/ftp/test", "/api/presets/save", "/api/presets/load", "/api/presets/delete", "/api/connections/save", "/api/connections/delete", "/api/icons/scan_ftp", "/api/icons/missing", "/api/custom-items/save", "/api/icons/upload", "/api/icons/delete", "/api/icons/fetch_url", "/api/snapshots/save", "/api/loot/snapshot", "/api/loot/root", "/api/loot/working-save", "/api/loot/working-reset", "/api/loot/working-bulk", "/api/loot/publish", "/api/loot/export-zip", "/api/loot/zone-window", "/api/loot/zone-window-close", "/api/icons/auto-fetch", "/api/client-log", "/api/update/check", "/api/update/download", "/api/update/launch", "/api/export/save", "/api/export/open"):
            return self.send_json(404, {"ok": False, "error": "Unknown API route"})
        size = int(self.headers.get("Content-Length", "0"))
        if size > 8 * 1024 * 1024:
            return self.send_json(413, {"ok": False, "error": "Request too large"})
        try:
            doc = json.loads(self.rfile.read(size) or b"{}")
        except (json.JSONDecodeError, UnicodeDecodeError):
            return self.send_json(400, {"ok": False, "error": "Invalid JSON"})
        if self.path == "/api/update/check":
            return self.handle_update_check()
        if self.path == "/api/update/download":
            return self.handle_update_download(doc)
        if self.path == "/api/update/launch":
            return self.handle_update_launch(doc)
        if self.path == "/api/ftp/test":
            return self.handle_ftp_test(doc)
        if self.path == "/api/loot/snapshot":
            return self.handle_loot_snapshot(doc)
        if self.path == "/api/loot/root":
            return self.handle_loot_root(doc)
        if self.path in ("/api/loot/working-save", "/api/loot/working-reset"):
            return self.handle_loot_working_post(self.path.rsplit("/", 1)[-1][len("working-"):], doc)
        if self.path == "/api/loot/working-bulk":
            return self.handle_loot_working_bulk(doc)
        if self.path == "/api/client-log":
            return self.handle_client_log(doc)
        if self.path == "/api/loot/publish":
            return self.handle_loot_publish(doc)
        if self.path == "/api/loot/export-zip":
            return self.handle_loot_export_zip(doc)
        if self.path == "/api/loot/zone-window":
            return self.handle_loot_zone_window(doc)
        if self.path == "/api/loot/zone-window-close":
            return self.handle_loot_zone_window_close(doc)
        if self.path == "/api/icons/auto-fetch":
            return self.handle_icons_autofetch(doc)
        if self.path.startswith("/api/ftp/"):
            return self.handle_ftp(self.path, doc)
        if self.path in ("/api/quests/save", "/api/quests/delete"):
            return self.handle_quests(self.path, doc)
        if self.path == "/api/quests/diff":
            return self.handle_quests_diff(doc)
        if self.path == "/api/export/save":
            return self.handle_export_save(doc)
        if self.path == "/api/export/open":
            return self.handle_export_open()
        if self.path.startswith("/api/presets/"):
            return self.handle_presets(self.path, doc)
        if self.path.startswith("/api/connections/"):
            return self.handle_connections(self.path, doc)
        if self.path == "/api/icons/scan_ftp":
            return self.handle_icon_scan(doc)
        if self.path == "/api/icons/missing":
            return self.handle_icons_missing(doc)
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
                rid = out.stem.lower()
                rem = load_removed_icons()
                if rid in rem:
                    save_removed_icons(rem - {rid})
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
                if safe and (removed or safe.lower() in bundled_icon_index()):
                    save_removed_icons(load_removed_icons() | {safe.lower()})
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
                rid = out.stem.lower()
                rem = load_removed_icons()
                if rid in rem:
                    save_removed_icons(rem - {rid})
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

    def handle_loot(self):
        parsed = urllib.parse.urlparse(self.path)
        route = parsed.path[len("/api/loot/"):]
        qs = urllib.parse.parse_qs(parsed.query)

        def q(name, default=""):
            v = qs.get(name)
            return v[0] if v else default

        def page(off_s, lim_s, def_lim):
            try:
                off = max(0, int(off_s))
            except ValueError:
                off = 0
            try:
                lim = min(400, max(1, int(lim_s)))
            except ValueError:
                lim = def_lim
            return off, lim

        if route not in ("status", "spawners", "spawner", "nodes", "node", "items", "item-ids", "cooldowns", "zones", "validate", "working"):
            return self.send_json(404, {"ok": False, "error": "Unknown loot route"})
        db, source = loot_load_db(force=q("refresh") in ("1", "true"))
        if db is None:
            return self.send_json(200, {"ok": False, "found": False, "source": source,
                                        "error": "Каталог LootBP не найден. Создайте data\\loot-root.txt с путём к каталогу LootBP."})
        if route == "status":
            groups = sorted({e["group"] for e in db["spawners"].values()} |
                            {e["group"] for m in db["overrides"].values() for e in m["presets"].values()})
            return self.send_json(200, {"ok": True, "found": True, "root": db["root"], "source": source,
                                        "built": db["built"], "counts": db["counts"], "errors": db["errors"][:20],
                                        "nodeScope": db["nodeScope"], "postActions": db["postActions"],
                                        "spawnerKeys": db["spawnerKeys"], "itemEntryKeys": db["itemEntryKeys"],
                                        "groups": groups, "mods": sorted(db["overrides"])})
        if route == "spawners":
            scope = q("scope", "default")
            if scope == "override":
                mod = q("mod")
                names = sorted(db["overrides"]) if not mod or mod == "all" else ([mod] if mod in db["overrides"] else [])
                pool = []
                for mname in names:
                    for e in db["overrides"][mname]["presets"].values():
                        e2 = dict(e)
                        e2["vanilla"] = e["id"] in db["spawners"]
                        pool.append(e2)
            else:
                pool = list(db["spawners"].values())
            grp = q("group")
            text = q("q").lower()
            if grp and grp != "all":
                pool = [e for e in pool if e["group"] == grp]
            if text:
                pool = [e for e in pool if text in e["id"].lower()]
            pool.sort(key=lambda e: ((e.get("mod") or ""), e["id"]))
            total = len(pool)
            off, lim = page(q("offset", "0"), q("limit", "60"), 60)
            wk = set(loot_working_load()["presets"].keys())
            rows = [{"id": e["id"], "group": e["group"], "mod": e.get("mod"),
                     "vanilla": e.get("vanilla", True), "families": e["families"],
                     "zone": e["doc"].get("ShouldFilterItemsByZone") is True,
                     "actions": e["doc"].get("PostSpawnActions") or [],
                     "edited": loot_working_key(e.get("mod"), e["id"]) in wk}
                    for e in pool[off:off + lim]]
            return self.send_json(200, {"ok": True, "total": total, "offset": off, "limit": lim, "items": rows})
        if route == "spawner":
            scope = q("scope", "default")
            pid = q("id")
            mod = q("mod")
            e = db["spawners"].get(pid) if scope != "override" \
                else db["overrides"].get(mod, {}).get("presets", {}).get(pid)
            if e is None:
                return self.send_json(404, {"ok": False, "error": "Preset not found"})
            wkey = loot_working_key(e.get("mod"), pid)
            wentry = loot_working_load()["presets"].get(wkey)
            wdoc = wentry.get("doc") if isinstance(wentry, dict) else None
            eff = wdoc if isinstance(wdoc, dict) else e["doc"]
            nodes_map = db["nodesResolve"]
            node_refs, item_ids, sub_ids = loot_spawner_refs(eff)
            node_bad = sorted({r for r in node_refs if loot_resolve_node(nodes_map, r)[1]})
            item_bad = sorted({i for i in item_ids if i not in db["items"]})
            sub_bad = sorted({s for s in sub_ids if not (s in db["spawners"]
                             or (e.get("mod") and s in db["overrides"].get(e["mod"], {}).get("presets", {})))})
            return self.send_json(200, {"ok": True, "id": pid, "group": e["group"], "mod": e.get("mod"),
                                        "doc": eff, "working": wdoc if isinstance(wdoc, dict) else None,
                                        "workingSaved": (wentry or {}).get("saved"),
                                        "nodeScope": db["nodeScope"],
                                        "resolved": {"nodeRefs": len(node_refs), "itemRefs": len(item_ids),
                                                     "unknownNodes": node_bad, "unknownItems": item_bad,
                                                     "missingSubpresets": sub_bad}})
        if route == "nodes":
            scope = q("scope") or db["nodeScope"]
            text = q("q").lower()
            stats = db["nodeStats"].get(scope, {})
            rows = []
            for k in sorted(stats):
                nm = db["nodes"].get(scope, {}).get(k, {}).get("name", k)
                if text and text not in nm.lower():
                    continue
                st = stats[k]
                rows.append({"name": nm, "leaves": st["leaves"], "internal": st["internal"],
                             "depth": st["depth"], "unknown": len(st["unknown"])})
            return self.send_json(200, {"ok": True, "scope": scope, "total": len(rows), "items": rows[:400]})
        if route == "node":
            scope = q("scope") or db["nodeScope"]
            nm = q("name")
            entry = db["nodes"].get(scope, {}).get(nm.lower())
            if not entry:
                return self.send_json(404, {"ok": False, "error": "Node not found"})
            counter = {"n": 0}

            def annot(node):
                counter["n"] += 1
                if not isinstance(node, dict):
                    return node
                out = {k: v for k, v in node.items() if k != "Children"}
                children = node.get("Children")
                if isinstance(children, list) and children:
                    if counter["n"] >= LOOT_TREE_CAP:
                        out["truncated"] = True
                    else:
                        out["Children"] = [annot(ch) for ch in children if counter["n"] < LOOT_TREE_CAP + 200]
                elif isinstance(out.get("Name"), str):
                    out["known"] = out["Name"] in db["items"]
                return out

            root = entry.get("root") or {}
            if q("raw") in ("1", "true"):
                return self.send_json(200, {"ok": True, "scope": scope, "name": entry["name"], "doc": root})
            children = root.get("Children")
            top = children[0] if isinstance(children, list) and len(children) == 1 and isinstance(children[0], dict) else root
            return self.send_json(200, {"ok": True, "scope": scope, "name": entry["name"],
                                        "tree": annot(top)})
        if route == "items":
            text = q("q").lower()
            loc = q("location")
            cd = q("cooldown")
            rows = []
            for e in db["items"].values():
                if text and text not in str(e.get("Id", "")).lower():
                    continue
                if loc and loc != "all" and not (isinstance(e.get("AllowedLocations"), list) and loc in e["AllowedLocations"]):
                    continue
                if cd == "none":
                    if e.get("CooldownGroup"):
                        continue
                elif cd and cd != "all" and e.get("CooldownGroup") != cd:
                    continue
                rows.append(e)
            rows.sort(key=lambda e: e["Id"])
            total = len(rows)
            off, lim = page(q("offset", "0"), q("limit", "100"), 100)
            return self.send_json(200, {"ok": True, "total": total, "offset": off, "limit": lim,
                                        "items": rows[off:off + lim]})
        if route == "item-ids":
            return self.send_json(200, {"ok": True, "ids": sorted(db["items"])})
        if route == "cooldowns":
            cg = db["cooldowns"]
            if not isinstance(cg, dict):
                return self.send_json(200, {"ok": True, "meta": None, "groups": []})
            used = {}
            for e in db["items"].values():
                g = e.get("CooldownGroup")
                if isinstance(g, str) and g:
                    used[g] = used.get(g, 0) + 1
            groups = []
            for g in cg.get("CooldownGroups") or []:
                if isinstance(g, dict):
                    e2 = dict(g)
                    e2["usedBy"] = used.get(g.get("Name"), 0)
                    groups.append(e2)
            groups.sort(key=lambda g: g.get("Name", ""))
            return self.send_json(200, {"ok": True,
                                        "meta": {"deleteAll": cg.get("DeleteAllDefaultCooldownGroups"),
                                                 "toDelete": cg.get("DefaultCooldownGroupsToDelete") or []},
                                        "groups": groups})
        if route == "working":
            wd = loot_working_load()
            items = []
            for key, we in wd["presets"].items():
                if isinstance(we, dict):
                    items.append({"key": key, "id": we.get("id"), "mod": we.get("mod") or "", "saved": we.get("saved")})
            items.sort(key=lambda x: (str(x.get("mod") or ""), str(x.get("id") or "")))
            return self.send_json(200, {"ok": True, "presets": items,
                                        "items": [{"key": k, "id": v.get("id"), "saved": v.get("saved"),
                                                   "patch": v.get("patch") or {}}
                                                  for k, v in wd["items"].items()],
                                        "cooldowns": [{"key": k, "name": v.get("name") or k, "saved": v.get("saved"),
                                                       "groups": len((v.get("doc") or {}).get("CooldownGroups") or []),
                                                       "doc": v.get("doc") or {}}
                                                      for k, v in wd["cooldowns"].items()],
                                        "nodes": [{"key": k, "name": v.get("name") or k, "saved": v.get("saved"),
                                                   "doc": v.get("doc") or {}}
                                                  for k, v in wd["nodes"].items()],
                                        "zones": [{"key": k, "mod": k, "saved": v.get("saved"),
                                                   "doc": v.get("doc") or {}}
                                                  for k, v in wd["zones"].items()]})
        if route == "zones":
            mods = []
            for name in sorted(db["overrides"]):
                m = db["overrides"][name]
                used = sum(1 for e in m["presets"].values() if e["doc"].get("ShouldFilterItemsByZone") is True)
                mods.append({"mod": name, "zonesFile": m["zonesFile"], "zones": m["zones"],
                             "zonesDoc": m.get("zonesDoc"), "presets": len(m["presets"]),
                             "spawnersWithZone": used})
            return self.send_json(200, {"ok": True, "mods": mods})
        if route == "validate":
            v = db["validation"]
            return self.send_json(200, {"ok": True, "built": db["built"], "counts": v["counts"],
                                        "total": v["total"], "issues": v["issues"]})
        return self.send_json(404, {"ok": False, "error": "Unknown loot route"})

    def handle_loot_snapshot(self, data):
        required = ("host", "username", "password", "remotePath")
        if not isinstance(data, dict) or any(not isinstance(data.get(k), str) or not data[k] for k in required):
            return self.send_json(400, {"ok": False, "error": "Host, username, password and remote path are required"})
        if any(c in data["remotePath"] for c in "\r\n"):
            return self.send_json(400, {"ok": False, "error": "Invalid remote path"})
        try:
            ftp, tls = connect_ftp(data)
        except (ValueError, ftplib.error_perm, ftplib.error_proto, OSError) as exc:
            return self.send_json(502, {"ok": False, "error": str(exc)[:400]})
        deadline = time.monotonic() + 600
        try:
            rp0 = data["remotePath"].rstrip("/")
            if re.search(r"/lootbp/?$", rp0, re.IGNORECASE) or re.search(r"/loot/?$", rp0, re.IGNORECASE):
                cands = [rp0 or "/"]
            else:
                cands = [rp0 + "/LootBP", rp0 + "/Loot", rp0]
            chosen, has_cd, tried, saw_lootbr = None, False, [], False
            for cand in cands:
                if cand.rstrip("/").rsplit("/", 1)[-1].lower() == "lootbr":
                    saw_lootbr = True
                    continue
                tried.append(cand or "/")
                probe = {"errors": 0, "errorList": []}
                try:
                    entries = loot_list_dir(ftp, cand, probe)
                except (ssl.SSLError, ConnectionError, TimeoutError, EOFError, OSError) as exc:
                    return self.send_json(502, {"ok": False, "error": ftp_err_text(exc)[:300]})
                names = {nm.lower() for nm, isd, _sz in entries if isd}
                if "loot" in names or "spawners" in names or "nodes" in names:
                    chosen = cand or "/"
                    has_cd = "cooldowngroups" in names
                    break
            if chosen is None:
                msg = ("Папка базы лута не найдена на сервере. Проверял: " + ", ".join(tried)
                       + ". В папке должен быть подкаталог Loot (или прямо Spawners/Nodes/Items) — результат команд #ExportDefault*.")
                if saw_lootbr:
                    msg += " Каталог с именем LootBR пропущен — считается опечаткой и исключён."
                return self.send_json(404, {"ok": False, "error": msg})
            tmp = data_dir() / "loot-server.tmp"
            if tmp.exists():
                shutil.rmtree(tmp, ignore_errors=True)
            tmp.mkdir(parents=True, exist_ok=True)
            stats = {"files": 0, "dirs": 0, "bytes": 0, "errors": 0, "errorList": [], "truncated": False}
            try:
                loot_walk_download(ftp, chosen, tmp, stats, deadline, 0)
            except (ssl.SSLError, ConnectionError, TimeoutError, EOFError, OSError) as exc:
                shutil.rmtree(tmp, ignore_errors=True)
                return self.send_json(502, {"ok": False,
                                            "error": "Соединение оборвалось при скачивании: " + ftp_err_text(exc)[:260]
                                                     + " — скачанная копия не сохранена, попробуйте ещё раз"})
            base_tmp = loot_base(tmp)
            struct_ok = ((base_tmp / "Spawners" / "Presets" / "Default").is_dir() or (base_tmp / "Nodes").is_dir()) \
                and (base_tmp / "Items" / "Default" / "Parameters.json").is_file()
            if not stats["files"] or not struct_ok:
                shutil.rmtree(tmp, ignore_errors=True)
                return self.send_json(502, {"ok": False,
                                            "error": "Скачано файлов: " + str(stats["files"])
                                                     + ", но структура LootBP не подтверждена (нужны Spawners\\Presets\\Default и Items\\Default\\Parameters.json — прямо или внутри подкаталога Loot). Проверьте папку экспорта на сервере."})
            final_dir = data_dir() / "loot-server"
            bak = None
            if final_dir.exists():
                if any(final_dir.iterdir()):
                    bak = data_dir() / ("loot-server.bak-" + datetime.now().strftime("%Y%m%d-%H%M%S"))
                    try:
                        final_dir.rename(bak)
                    except OSError:
                        shutil.rmtree(final_dir, ignore_errors=True)
                else:
                    final_dir.rmdir()
            try:
                tmp.rename(final_dir)
            except OSError:
                shutil.rmtree(final_dir, ignore_errors=True)
                tmp.rename(final_dir)
            (data_dir() / "loot-root.txt").write_text(str(final_dir), encoding="utf-8")
            with LOOT_LOCK:
                LOOT_CACHE["db"] = None
            return self.send_json(200, {"ok": True, "tls": tls, "remotePath": chosen, "root": str(final_dir),
                                        "backup": str(bak) if bak else "", "cooldowns": has_cd,
                                        "stats": {k: stats[k] for k in ("files", "dirs", "bytes", "errors", "truncated")},
                                        "errorsList": stats["errorList"]})
        finally:
            try:
                ftp.quit()
            except Exception:
                ftp.close()

    def handle_client_log(self, data):
        lines = (data or {}).get("lines")
        if not isinstance(lines, list):
            return self.send_json(400, {"ok": False, "error": "lines: list expected"})
        clean = [str(x)[:500].replace("\r", " ").replace("\n", " ") for x in lines if isinstance(x, (str, int, float))]
        clean = clean[:50]
        if not clean:
            return self.send_json(200, {"ok": True, "written": 0})
        stamp = datetime.now().isoformat(timespec="seconds")
        with open(data_dir() / "client.log", "a", encoding="utf-8", errors="replace") as fh:
            for x in clean:
                fh.write(stamp + " | " + x + "\n")
        return self.send_json(200, {"ok": True, "written": len(clean)})

    def handle_loot_publish(self, data):
        required = ("host", "username", "password", "remotePath")
        if not isinstance(data, dict) or any(not isinstance(data.get(k), str) or not data[k] for k in required):
            return self.send_json(400, {"ok": False, "error": "Host, username, password and remote path are required"})
        if any(c in data["remotePath"] for c in "\r\n"):
            return self.send_json(400, {"ok": False, "error": "Invalid remote path"})
        if data.get("confirm") is not True:
            return self.send_json(400, {"ok": False, "error": "Publish requires explicit confirmation"})
        typ = str(data.get("type") or "preset")
        if typ not in ("preset", "items", "cooldowns", "nodes", "zones"):
            return self.send_json(400, {"ok": False, "error": "Unknown publish type: " + typ[:30]})
        keys = data.get("keys")
        if typ == "items":
            keys = ["items"]
        if not isinstance(keys, list) or not keys:
            return self.send_json(400, {"ok": False, "error": "keys array is required"})
        if len(keys) > 50:
            return self.send_json(400, {"ok": False, "error": "Too many files (max 50)"})
        wd = loot_working_load()
        db = None
        if typ == "items":
            db, _src = loot_load_db()
            if db is None:
                return self.send_json(400, {"ok": False,
                                            "error": "Нет базы лута: подключите LootBP или скачайте базу с сервера"})
        jobs, skipped = loot_publish_jobs(typ, wd, db, keys=keys)
        if not jobs:
            return self.send_json(400, {"ok": False,
                                        "error": "Нечего публиковать: " + ("; ".join(s["reason"] for s in skipped)[:200] or "правок нет")})
        try:
            ftp, tls = connect_ftp(data)
        except (ValueError, ftplib.error_perm, ftplib.error_proto, OSError) as exc:
            return self.send_json(502, {"ok": False, "error": str(exc)[:400]})
        try:
            rp0 = data["remotePath"].rstrip("/")
            loot_remote = None
            for base in (rp0 + "/Loot", rp0):
                if base.rstrip("/").rsplit("/", 1)[-1].lower() == "lootbr":
                    continue
                probe = {"errors": 0, "errorList": []}
                names = {nm.lower() for nm, isd, _sz in loot_list_dir(ftp, base, probe) if isd}
                if "spawners" in names:
                    loot_remote = base
                    break
            if loot_remote is None:
                return self.send_json(404, {"ok": False,
                                            "error": "На сервере не найдена папка базы лута (Spawners/Presets). Проверял: " + rp0 + "/Loot и " + rp0 + ". Нажмите «СКАЧАТЬ БАЗУ ЛУТА С СЕРВЕРА» — она определит правильный путь."})
            presets_base = loot_remote + "/Spawners/Presets"
            if typ == "items":
                remote_entries = {}
                try:
                    cur = io.BytesIO()
                    ftp.retrbinary("RETR " + loot_remote + "/Items/Override/Parameters.json", cur.write)
                    odoc = json.loads(cur.getvalue().decode("utf-8-sig", errors="replace"))
                    if isinstance(odoc, dict):
                        for e in odoc.get("Parameters") or []:
                            if isinstance(e, dict) and isinstance(e.get("Id"), str):
                                remote_entries[e["Id"]] = e
                except (ftplib.error_perm, ValueError):
                    remote_entries = {}
                jobs, _sk = loot_publish_jobs("items", wd, db, remote_entries)
                if not jobs:
                    return self.send_json(400, {"ok": False, "error": "Не удалось собрать итоговый Parameters.json"})
            stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
            results, failed = [], []
            dirs_created = []
            cap = 4_000_000 if typ == "items" else 1_000_000
            for job in jobs:
                remote_path = loot_remote + job["rel"]
                try:
                    dirs_created += ftp_ensure_dir(ftp, remote_path.rsplit("/", 1)[0])
                    raw = json.dumps(job["doc"], ensure_ascii=False, indent=2).encode("utf-8")
                    if len(raw) > cap:
                        raise ValueError("Файл больше лимита " + str(cap // 1000) + " КБ")
                    backup_created = False
                    try:
                        cur = io.BytesIO()
                        ftp.retrbinary("RETR " + remote_path, cur.write)
                        ftp.storbinary("STOR " + remote_path + ".backup-" + stamp, io.BytesIO(cur.getvalue()))
                        backup_created = True
                    except ftplib.error_perm:
                        pass
                    ftp.storbinary("STOR " + remote_path, io.BytesIO(raw))
                    results.append({"key": job["key"], "remote": remote_path,
                                    "backupCreated": backup_created, "bytes": len(raw)})
                except (ValueError, ftplib.error_perm, ftplib.error_proto) as exc:
                    failed.append({"key": job["key"], "error": str(exc)[:200]})
            resp = {"ok": True, "type": typ, "base": presets_base, "tls": tls,
                    "uploaded": len(results),
                    "backups": sum(1 for rr in results if rr["backupCreated"]),
                    "dirsCreated": dirs_created, "results": results,
                    "failed": failed, "skipped": skipped}
            if typ == "items":
                resp["items"] = len(jobs[0]["doc"].get("Parameters") or [])
            return self.send_json(200, resp)
        except (ssl.SSLError, ConnectionError, TimeoutError, EOFError, OSError) as exc:
            return self.send_json(502, {"ok": False, "error": ftp_err_text(exc)[:300]})
        finally:
            try:
                ftp.quit()
            except Exception:
                ftp.close()

    def handle_loot_working_post(self, action, data):
        b = data if isinstance(data, dict) else {}
        typ = str(b.get("type") or "preset")
        if typ not in ("preset", "item", "cooldown", "node", "zone"):
            return self.send_json(400, {"ok": False, "error": "Unknown working type: " + typ[:30]})
        if action == "save":
            if typ == "preset":
                pid = str(b.get("id") or "").strip()
                mod = str(b.get("mod") or "").strip()
                doc = b.get("doc")
                if not pid or not isinstance(doc, dict):
                    return self.send_json(400, {"ok": False, "error": "Нужны непустой id и объект doc"})
                try:
                    raw = json.dumps(doc, ensure_ascii=False)
                except (TypeError, ValueError):
                    return self.send_json(400, {"ok": False, "error": "doc не сериализуется в JSON"})
                if len(raw) > 1_000_000:
                    return self.send_json(400, {"ok": False, "error": "doc слишком большой (>1 МБ)"})
                fam = loot_families(doc)
                if not any(fam[k] for k in ("items", "nodes", "fixed", "subpresets")):
                    return self.send_json(400, {"ok": False, "error": "В doc нет ни Nodes, ни Items, ни FixedItems, ни Subpresets"})
                db, _src = loot_load_db()
                resolved = {"nodeRefs": 0, "itemRefs": 0, "unknownNodes": [], "unknownItems": [], "missingSubpresets": []}
                if db is not None:
                    node_refs, item_ids, sub_ids = loot_spawner_refs(doc)
                    node_bad = sorted({r for r in node_refs if loot_resolve_node(db["nodesResolve"], r)[1]})
                    item_bad = sorted({i for i in item_ids if i not in db["items"]})
                    sub_bad = sorted({s for s in sub_ids if not (s in db["spawners"]
                                     or (mod and s in db["overrides"].get(mod, {}).get("presets", {})))})
                    resolved = {"nodeRefs": len(node_refs), "itemRefs": len(item_ids),
                                "unknownNodes": node_bad, "unknownItems": item_bad, "missingSubpresets": sub_bad}
                key = loot_working_key(mod, pid)
                entry = {"id": pid, "mod": mod, "doc": doc, "saved": datetime.now().isoformat(timespec="seconds")}
                with LOOT_LOCK:
                    wd = loot_working_load()
                    wd["presets"][key] = entry
                    loot_working_store(wd)
                return self.send_json(200, {"ok": True, "key": key, "families": fam, "resolved": resolved})
            if typ == "item":
                pid = str(b.get("id") or "").strip()
                if not ITEM_ID_RE.match(pid):
                    return self.send_json(400, {"ok": False, "error": "Нужен корректный id предмета (латиница/цифры/_/-)"})
                patch, issues = loot_item_patch_clean(b.get("patch"))
                if issues:
                    return self.send_json(400, {"ok": False, "error": "; ".join(issues)[:300]})
                db, _src = loot_load_db()
                warns = []
                if db is not None:
                    if pid not in db["items"]:
                        warns.append("Id нет в Parameters.json — в текущем экспорте предмет не спавнится")
                    cg = patch.get("CooldownGroup")
                    cdoc = db.get("cooldowns") or {}
                    cgroups = {g.get("Name") for g in (cdoc.get("CooldownGroups") or []) if isinstance(g, dict)}
                    if cg and cgroups and cg not in cgroups:
                        warns.append("CooldownGroup нет в CooldownGroups.json: " + cg)
                entry = {"id": pid, "patch": patch, "saved": datetime.now().isoformat(timespec="seconds")}
                with LOOT_LOCK:
                    wd = loot_working_load()
                    wd["items"][pid] = entry
                    loot_working_store(wd)
                return self.send_json(200, {"ok": True, "key": pid, "patch": patch, "warnings": warns})
            if typ == "cooldown":
                name = str(b.get("name") or "").strip()
                if not LOOT_FILE_RE.match(name):
                    return self.send_json(400, {"ok": False, "error": "name: имя файла вида Имя.json (латиница/цифры/_/-/пробел)"})
                doc, issues = loot_cooldown_clean(b.get("doc"))
                if issues:
                    return self.send_json(400, {"ok": False, "error": "; ".join(issues)[:300]})
                warns = []
                if doc.get("DeleteAllDefaultCooldownGroups") is True:
                    warns.append("DeleteAllDefaultCooldownGroups=true удалит ВСЕ дефолтные группы кулдаунов")
                entry = {"name": name, "doc": doc, "saved": datetime.now().isoformat(timespec="seconds")}
                with LOOT_LOCK:
                    wd = loot_working_load()
                    wd["cooldowns"][name] = entry
                    loot_working_store(wd)
                return self.send_json(200, {"ok": True, "key": name, "warnings": warns})
            if typ == "node":
                name = str(b.get("name") or "").strip()
                if not LOOT_FILE_RE.match(name):
                    return self.send_json(400, {"ok": False, "error": "name: имя файла вида Имя.json (латиница/цифры/_/-/пробел)"})
                doc, issues = loot_node_clean(b.get("doc"))
                if issues:
                    return self.send_json(400, {"ok": False, "error": "; ".join(issues)[:300]})
                entry = {"name": name, "doc": doc, "saved": datetime.now().isoformat(timespec="seconds")}
                with LOOT_LOCK:
                    wd = loot_working_load()
                    wd["nodes"][name] = entry
                    loot_working_store(wd)
                return self.send_json(200, {"ok": True, "key": name, "warnings": []})
            if typ == "zone":
                mod = str(b.get("mod") or "").strip()
                if not LOOT_MOD_RE.match(mod):
                    return self.send_json(400, {"ok": False, "error": "mod: имя папки мода (латиница/цифры/_/-/пробел/точка)"})
                doc, issues, warns = loot_zone_clean(b.get("doc"))
                if issues:
                    return self.send_json(400, {"ok": False, "error": "; ".join(issues)[:300]})
                entry = {"name": "Zones.json", "doc": doc, "saved": datetime.now().isoformat(timespec="seconds")}
                with LOOT_LOCK:
                    wd = loot_working_load()
                    wd["zones"][mod] = entry
                    loot_working_store(wd)
                return self.send_json(200, {"ok": True, "key": mod, "warnings": warns})
        key = str(b.get("key") or "")
        sec = {"preset": "presets", "item": "items", "cooldown": "cooldowns", "node": "nodes", "zone": "zones"}[typ]
        with LOOT_LOCK:
            wd = loot_working_load()
            if key not in wd[sec]:
                return self.send_json(404, {"ok": False, "error": "Правка не найдена: " + key})
            del wd[sec][key]
            loot_working_store(wd)
        return self.send_json(200, {"ok": True, "removed": key})

    def handle_loot_working_bulk(self, data):
        b = data if isinstance(data, dict) else {}
        patch, issues = loot_item_patch_clean(b.get("patch"))
        if issues:
            return self.send_json(400, {"ok": False, "error": "; ".join(issues)[:300]})
        db, _src = loot_load_db()
        if db is None:
            return self.send_json(400, {"ok": False,
                                        "error": "Нет базы лута: подключите LootBP или скачайте базу с сервера"})
        text = str(b.get("q") or "").lower()
        loc = str(b.get("location") or "all")
        cd = str(b.get("cooldown") or "all")
        ids = []
        for e in db["items"].values():
            if text and text not in str(e.get("Id", "")).lower():
                continue
            if loc and loc != "all" and not (isinstance(e.get("AllowedLocations"), list) and loc in e["AllowedLocations"]):
                continue
            if cd == "none":
                if e.get("CooldownGroup"):
                    continue
            elif cd and cd != "all" and e.get("CooldownGroup") != cd:
                continue
            ids.append(e["Id"])
        if not ids:
            return self.send_json(400, {"ok": False, "error": "Под фильтр не попал ни один предмет"})
        if len(ids) > 2000:
            return self.send_json(400, {"ok": False, "error": "Под фильтр попало слишком много предметов (" + str(len(ids)) + ", макс 2000) — уточните фильтр"})
        warns = []
        cg = patch.get("CooldownGroup")
        cdoc = db.get("cooldowns") or {}
        cgroups = {g.get("Name") for g in (cdoc.get("CooldownGroups") or []) if isinstance(g, dict)}
        if cg and cgroups and cg not in cgroups:
            warns.append("CooldownGroup нет в CooldownGroups.json: " + cg)
        now = datetime.now().isoformat(timespec="seconds")
        with LOOT_LOCK:
            wd = loot_working_load()
            for pid in ids:
                old = wd["items"].get(pid, {})
                op = dict(old.get("patch") or {})
                op.update(patch)
                wd["items"][pid] = {"id": pid, "patch": op, "saved": now}
            loot_working_store(wd)
        return self.send_json(200, {"ok": True, "updated": len(ids), "ids": ids, "patch": patch, "warnings": warns})

    def handle_loot_root(self, data):
        p = str((data or {}).get("path") or "").strip().strip('"').strip()
        if not p:
            return self.send_json(400, {"ok": False, "error": "Укажите путь к каталогу LootBP"})
        if any(c in p for c in "\r\n"):
            return self.send_json(400, {"ok": False, "error": "Invalid path"})
        path = Path(os.path.expandvars(os.path.expanduser(p)))
        if not path.is_absolute():
            path = loot_base_dir() / path
        path = path.resolve()
        if path.name.lower() == "lootbr":
            return self.send_json(400, {"ok": False,
                                        "error": "Каталог LootBR не используется (опечатка в имени). Укажите LootBP или папку с подкаталогами Loot/Spawners/Nodes."})
        if not ((path / "Loot").is_dir() or (path / "Spawners").is_dir() or (path / "Nodes").is_dir()):
            return self.send_json(400, {"ok": False,
                                        "error": "В папке не найдена структура базы лута (подкаталог Loot или прямо Spawners/Nodes/Items): " + str(path)})
        (data_dir() / "loot-root.txt").write_text(str(path), encoding="utf-8")
        with LOOT_LOCK:
            LOOT_CACHE["db"] = None
        db, source = loot_load_db(force=True)
        return self.send_json(200, {"ok": True, "root": str(path), "source": source,
                                    "counts": (db or {}).get("counts", {})})

    def handle_loot_export_zip(self, data):
        wd = loot_working_load()
        if not any(wd[s] for s in LOOT_WORK_SECTIONS):
            return self.send_json(400, {"ok": False, "error": "WORKING-правок нет — экспортировать нечего"})
        db = None
        if wd["items"]:
            db, _src = loot_load_db()
            if db is None:
                return self.send_json(400, {"ok": False,
                                            "error": "Для экспорта предметов нужна база лута (подключите LootBP или скачайте базу)"})
        jobs, skipped = [], []
        for typ in ("preset", "cooldowns", "nodes", "zones", "items"):
            j, s = loot_publish_jobs(typ, wd, db)
            jobs.extend(j)
            skipped.extend(s)
        if not jobs:
            return self.send_json(400, {"ok": False,
                                        "error": "Нечего экспортировать: " + ("; ".join(s["reason"] for s in skipped)[:200] or "правки не прошли проверку")})
        stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
        target = exports_dir() / ("loot-override-" + stamp + ".zip")
        try:
            with zipfile.ZipFile(target, "w", zipfile.ZIP_DEFLATED) as z:
                readme = ["MIDWAY ECONOMY CONTROL — экспорт WORKING-правок лута (0.8.14)",
                          "Дата: " + datetime.now().isoformat(timespec="seconds"),
                          "",
                          "Содержимое раскладывается в корень каталога базы лута (LootBP / Loot):",
                          "  Spawners\\Presets\\Default\\*.json        — ванильные пресеты",
                          "  Spawners\\Presets\\Override\\<Мод>\\*.json — модовые пресеты и Zones.json",
                          "  Items\\Override\\Parameters.json         — предметы (полный слитый список)",
                          "  CooldownGroups\\Override\\*.json         — кулдауны",
                          "  Nodes\\Override\\*.json                  — дерево лута",
                          "",
                          "После копирования на сервер: #ReloadLootCustomizationsAndResetSpawners (или рестарт).",
                          "Примечание: при экспорте Items Override-файл сервера не подмешивался (только локальная база + правки).",
                          ""]
                z.writestr("README.txt", "\r\n".join(readme))
                for job in jobs:
                    z.writestr(job["rel"].lstrip("/"), json.dumps(job["doc"], ensure_ascii=False, indent=2))
        except OSError as exc:
            return self.send_json(500, {"ok": False, "error": str(exc)[:300]})
        files = len(jobs)
        return self.send_json(200, {"ok": True, "path": str(target), "files": files,
                                    "bytes": target.stat().st_size if target.exists() else 0,
                                    "skipped": skipped})

        items = []
        for f in sorted(quests_dir().glob("STORY_*.json")):
            try:
                raw = json.loads(f.read_text(encoding="utf-8"))
            except (json.JSONDecodeError, UnicodeDecodeError, OSError):
                continue
            if not isinstance(raw, dict):
                continue
            items.append({
                "fileName": f.name,
                "npc": raw.get("AssociatedNPC", ""),
                "tier": raw.get("Tier"),
                "title": raw.get("Title", ""),
                "conditions": len(raw.get("Conditions") or []),
                "doc": raw,
            })
        return self.send_json(200, {"ok": True, "quests": items})

    def handle_quests(self, route, data):
        if not isinstance(data, dict):
            return self.send_json(400, {"ok": False, "error": "Body must be an object"})
        name = str(data.get("fileName") or "").strip()
        if route == "/api/quests/save":
            if not QUEST_NAME_RE.match(name):
                return self.send_json(400, {"ok": False, "error": "fileName должен быть вида STORY_имя.json (латиница, цифры, _ и -)"})
            doc = data.get("doc")
            if not isinstance(doc, dict):
                return self.send_json(400, {"ok": False, "error": "A document object is required"})
            doc = normalize_quest(doc)
            issues, warnings = validate_quest(doc)
            if issues and data.get("force") is not True:
                return self.send_json(200, {"ok": False, "issues": issues, "warnings": warnings})
            text = json.dumps(doc, ensure_ascii=False, indent=2)
            target = quests_dir() / name
            try:
                with open(target, "w", encoding="utf-8", newline="\n") as f:
                    f.write(text)
            except OSError as exc:
                return self.send_json(500, {"ok": False, "error": str(exc)[:300]})
            return self.send_json(200, {"ok": True, "fileName": name, "doc": doc, "issues": issues, "warnings": warnings, "path": str(target)})
        if not QUEST_NAME_RE.match(name):
            return self.send_json(400, {"ok": False, "error": "fileName должен быть вида STORY_имя.json"})
        target = quests_dir() / name
        if not target.is_file():
            return self.send_json(404, {"ok": False, "error": "File not found"})
        try:
            target.unlink()
        except OSError as exc:
            return self.send_json(500, {"ok": False, "error": str(exc)[:300]})
        return self.send_json(200, {"ok": True, "fileName": name})

    def handle_quests_diff(self, data):
        local, snap = quests_dir(), quests_server_dir()
        snap_files = sorted(snap.glob("STORY_*.json"))
        if not snap_files:
            return self.send_json(200, {"ok": True, "items": [], "counts": {}, "note": "Снапшота сервера ещё нет — сначала снимите снапшот кнопкой «СНЯТЬ СНАПШОТ КВЕСТОВ СЕРВЕРА»"})
        names = sorted({p.name for p in local.glob("STORY_*.json")} | {p.name for p in snap_files})
        items, counts = [], {}
        for name in names:
            lh, linv = quest_content_hash(local / name)
            sh, sinv = quest_content_hash(snap / name)
            if lh is None:
                status = "server-only"
            elif sh is None:
                status = "local-only"
            elif lh == sh:
                status = "sync"
            else:
                status = "diff"
            counts[status] = counts.get(status, 0) + 1
            items.append({"fileName": name, "status": status, "invalidLocal": linv, "invalidServer": sinv})
        try:
            snapshot_at = max(p.stat().st_mtime for p in snap_files)
        except OSError:
            snapshot_at = None
        return self.send_json(200, {"ok": True, "items": items, "counts": counts, "snapshotAt": snapshot_at})

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
            for i in data["ids"][:2000]:
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

    def _github_release(self, ref="latest"):
        url = "https://api.github.com/repos/" + REPO + "/releases/" + ref
        req = urllib.request.Request(url, headers={"User-Agent": "MIDWAYEconomyControl/" + VERSION, "Accept": "application/vnd.github+json"})
        with urllib.request.urlopen(req, timeout=15) as r:
            return json.loads(r.read().decode("utf-8"))

    @staticmethod
    def _release_exe_asset(rel):
        for a in rel.get("assets") or []:
            if str(a.get("name", "")).lower().endswith(".exe"):
                return a
        return None

    def handle_update_check(self):
        try:
            rel = self._github_release()
        except Exception as exc:
            return self.send_json(200, {"ok": False, "current": VERSION, "error": str(exc)[:200]})
        tag = str(rel.get("tag_name") or "")
        m = re.search(r"\d+(?:\.\d+)+", tag)
        latest = m.group(0) if m else ""
        asset = self._release_exe_asset(rel)
        return self.send_json(200, {
            "ok": True,
            "current": VERSION,
            "latest": latest,
            "update": version_newer(latest, VERSION),
            "url": str(rel.get("html_url") or ""),
            "downloadUrl": (asset or {}).get("browser_download_url"),
            "size": (asset or {}).get("size"),
            "notes": str(rel.get("body") or "")[:1200],
            "notesHtml": release_notes_html(rel.get("body")),
        })

    def handle_update_download(self, data):
        tag = str((data or {}).get("tag") or "").strip()
        if tag and not re.fullmatch(r"v\d+(\.\d+)*", tag):
            return self.send_json(400, {"ok": False, "error": "Invalid tag format"})
        if UPDATE_DL.get("running"):
            return self.send_json(409, {"ok": False, "error": "Загрузка уже выполняется"})
        try:
            rel = self._github_release(("tags/" + tag) if tag else "latest")
        except Exception as exc:
            return self.send_json(502, {"ok": False, "error": "GitHub: " + str(exc)[:200]})
        asset = self._release_exe_asset(rel)
        if not asset:
            return self.send_json(404, {"ok": False, "error": "Release has no .exe asset"})
        latest = str(rel.get("tag_name") or "update")
        safe = re.sub(r"[^A-Za-z0-9._\-]", "", latest) or "update"
        target = updates_dir() / ("MIDWAYEconomyControl-" + safe + ".exe")
        expected = int(asset.get("size") or 0)
        UPDATE_DL.update({"running": True, "done": False, "ok": False, "error": None,
                          "downloaded": 0, "total": expected, "percent": 0,
                          "version": latest, "path": str(target), "sha256": ""})
        threading.Thread(target=self._dl_worker,
                         args=(str(asset.get("browser_download_url")), target, expected, latest),
                         daemon=True).start()
        return self.send_json(200, {"ok": True, "started": True, "version": latest,
                                    "path": str(target), "size": expected})

    @staticmethod
    def _dl_worker(url, target, expected, latest):
        part = target.with_suffix(target.suffix + ".part")
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "MIDWAYEconomyControl/" + VERSION})
            total, sha = 0, hashlib.sha256()
            with urllib.request.urlopen(req, timeout=30) as r, open(part, "wb") as out:
                cl = r.headers.get("Content-Length")
                if cl:
                    try:
                        UPDATE_DL["total"] = int(cl)
                    except ValueError:
                        pass
                while True:
                    chunk = r.read(1 << 16)
                    if not chunk:
                        break
                    out.write(chunk)
                    total += len(chunk)
                    sha.update(chunk)
                    UPDATE_DL["downloaded"] = total
                    if UPDATE_DL["total"]:
                        UPDATE_DL["percent"] = min(100, int(total * 100 / UPDATE_DL["total"]))
            if expected and total != expected:
                raise IOError("Size mismatch: got %d bytes, expected %d" % (total, expected))
            os.replace(part, target)
            UPDATE_DL.update({"running": False, "done": True, "dl_ok": True, "downloaded": total,
                              "total": total or expected, "percent": 100, "path": str(target),
                              "sha256": sha.hexdigest().upper(), "error": None})
        except Exception as exc:
            try:
                part.unlink()
            except OSError:
                pass
            UPDATE_DL.update({"running": False, "done": True, "dl_ok": False, "error": str(exc)[:200]})

    def handle_update_progress(self):
        s = dict(UPDATE_DL)
        if s.get("total") and not s.get("done"):
            s["percent"] = min(100, int(s["downloaded"] * 100 / s["total"]))
        s["ok"] = True
        return self.send_json(200, s)

    def handle_update_launch(self, data):
        p = str((data or {}).get("path") or "")
        if not p:
            return self.send_json(400, {"ok": False, "error": "path is required"})
        path = Path(p)
        try:
            if path.parent.resolve() != updates_dir().resolve():
                return self.send_json(400, {"ok": False, "error": "Only files in the updates folder can be launched"})
        except OSError:
            return self.send_json(400, {"ok": False, "error": "Invalid path"})
        if not path.name.lower().endswith(".exe") or not path.is_file():
            return self.send_json(400, {"ok": False, "error": "File not found in updates folder"})
        if not getattr(sys, "frozen", False):
            return self.send_json(400, {"ok": False, "error": "Замена exe доступна только в собранной версии — запустите скачанный файл вручную"})
        cur = Path(sys.executable).resolve()
        if not cur.name.lower().endswith(".exe"):
            return self.send_json(400, {"ok": False, "error": "Invalid executable"})
        try:
            if path.resolve() == cur:
                return self.send_json(400, {"ok": False, "error": "Update file is the running executable"})
        except OSError:
            return self.send_json(400, {"ok": False, "error": "Invalid path"})
        stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        old_name = cur.stem + ".old-" + stamp + ".exe"
        old_path = cur.with_name(old_name)
        try:
            os.rename(cur, old_path)
        except OSError as exc:
            return self.send_json(500, {"ok": False, "error": "Не удалось переименовать работающий exe: " + str(exc)[:180]})
        try:
            shutil.move(str(path), str(cur))
        except OSError as exc:
            try:
                os.rename(old_path, cur)
            except OSError:
                pass
            return self.send_json(500, {"ok": False, "error": "Не удалось заменить exe (оригинал восстановлен): " + str(exc)[:180]})
        flags = getattr(subprocess, "DETACHED_PROCESS", 0) | getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0)
        env = dict(os.environ)
        for k in [k for k in env if k.upper().startswith(("_MEI", "_PYI"))]:
            del env[k]
        try:
            subprocess.Popen([str(cur), "--cleanup=" + old_name], cwd=str(cur.parent), creationflags=flags, close_fds=True, env=env)
        except OSError as exc:
            try:
                shutil.move(str(cur), str(path))
                os.rename(old_path, cur)
            except OSError:
                pass
            return self.send_json(500, {"ok": False, "error": "Новая версия не запустилась (оригинал восстановлен): " + str(exc)[:180]})
        timer = threading.Timer(0.6, os._exit, args=(0,))
        timer.daemon = True
        timer.start()
        return self.send_json(200, {"ok": True, "cleanup": old_name})

    def handle_icons_missing(self, data):
        ids = data.get("ids") if isinstance(data, dict) else None
        if not isinstance(ids, list):
            return self.send_json(400, {"ok": False, "error": "ids array is required"})
        known = set()
        try:
            known = {f.stem.lower() for f in icons_dir().iterdir() if f.is_file() and f.suffix.lower() in ICON_EXTS}
        except OSError:
            pass
        known |= set(bundled_icon_index())
        known -= load_removed_icons()
        missing = []
        for i in ids[:2000]:
            if isinstance(i, str) and i.strip() and i.strip().lower() not in known:
                missing.append(i.strip())
        return self.send_json(200, {"ok": True, "missing": missing, "missingCount": len(missing)})

    def handle_icons_autofetch(self, data):
        if not isinstance(data, dict) or data.get("confirm") is not True:
            return self.send_json(400, {"ok": False, "error": "Auto-fetch requires explicit confirmation"})
        ids = []
        if isinstance(data.get("ids"), list):
            for i in data["ids"][:5000]:
                if isinstance(i, str) and i.strip():
                    ids.append(i.strip())
        if not ids:
            dbf = WEB / "items-db.json"
            try:
                doc = json.loads(dbf.read_text(encoding="utf-8"))
                for c in doc.get("categories") or []:
                    for it in (c.get("items") or []):
                        if isinstance(it, dict) and isinstance(it.get("id"), str) and it["id"].strip():
                            ids.append(it["id"].strip())
            except (OSError, json.JSONDecodeError, UnicodeDecodeError):
                return self.send_json(500, {"ok": False, "error": "Не удалось прочитать items-db.json — передайте ids явно"})
        if not ids:
            return self.send_json(400, {"ok": False, "error": "Список Id пуст"})
        known = set()
        try:
            known = {f.stem.lower() for f in icons_dir().iterdir() if f.is_file() and f.suffix.lower() in ICON_EXTS}
        except OSError:
            pass
        known |= set(bundled_icon_index())
        known -= load_removed_icons()
        missing, seen = [], set()
        for i in ids:
            s = i.strip().lower()
            if s and s not in known and s not in seen:
                seen.add(s)
                missing.append(s)
        if not missing:
            return self.send_json(200, {"ok": True, "missing": 0, "fetched": 0, "source": "none",
                                        "note": "Все иконки уже на месте"})
        cache = icons_dir() / "icons-base.zip.cache"
        src = None
        if cache.is_file() and cache.stat().st_size > 10 * 1024 * 1024:
            src = cache
        else:
            url = "https://github.com/" + REPO + "/releases/latest/download/icons.zip"
            tmp = icons_dir() / "icons-base.zip.tmp"
            try:
                req = urllib.request.Request(url, headers={"User-Agent": "MIDWAYEconomyControl/" + VERSION})
                with urllib.request.urlopen(req, timeout=60) as r, open(tmp, "wb") as f:
                    total = 0
                    while True:
                        chunk = r.read(262144)
                        if not chunk:
                            break
                        total += len(chunk)
                        if total > 300 * 1024 * 1024:
                            raise ValueError("База иконок слишком большая (>300 МБ)")
                        f.write(chunk)
            except (urllib.error.URLError, OSError, ValueError) as exc:
                try:
                    tmp.unlink()
                except OSError:
                    pass
                return self.send_json(502, {"ok": False, "error": "Не удалось скачать базу иконок: " + str(exc)[:220]})
            if cache.exists():
                try:
                    cache.unlink()
                except OSError:
                    pass
            tmp.replace(cache)
            src = cache
        fetched = 0
        try:
            with zipfile.ZipFile(src) as z:
                for n in z.namelist():
                    p = Path(n)
                    if n.endswith("/") or p.suffix.lower() not in ICON_EXTS or p.stem.lower() not in seen:
                        continue
                    data_bytes = z.read(n)
                    if len(data_bytes) > 2 * 1024 * 1024:
                        continue
                    try:
                        (icons_dir() / (p.stem.lower() + p.suffix.lower())).write_bytes(data_bytes)
                        fetched += 1
                    except OSError:
                        continue
        except (zipfile.BadZipFile, OSError) as exc:
            return self.send_json(500, {"ok": False, "error": "База иконок повреждена: " + str(exc)[:200]})
        return self.send_json(200, {"ok": True, "missing": len(missing), "fetched": fetched,
                                    "source": "cache" if src == cache else "github"})

    ZONE_WINDOWS = {}

    def handle_loot_zone_window(self, data):
        mod = str((data or {}).get("mod") or "").strip()
        if not LOOT_MOD_RE.match(mod):
            return self.send_json(400, {"ok": False, "error": "Некорректное имя мода"})
        url = "http://127.0.0.1:%d/zonemap.html?mod=%s" % (SERVER_PORT, urllib.parse.quote(mod))
        old = self.ZONE_WINDOWS.get(mod)
        if old is not None:
            try:
                old.destroy()
            except Exception:
                pass
            self.ZONE_WINDOWS.pop(mod, None)
        try:
            import webview
            w = webview.create_window("Зоны лута · " + mod, url, width=1280, height=880)
            self.ZONE_WINDOWS[mod] = w
            return self.send_json(200, {"ok": True, "mode": "window", "url": url})
        except Exception as exc:
            try:
                os.startfile(url)
                return self.send_json(200, {"ok": True, "mode": "browser", "url": url})
            except Exception:
                return self.send_json(500, {"ok": False, "error": str(exc)[:250]})

    def handle_loot_zone_window_close(self, data):
        mod = str((data or {}).get("mod") or "").strip()
        if not LOOT_MOD_RE.match(mod):
            return self.send_json(400, {"ok": False, "error": "Некорректное имя мода"})
        w = self.ZONE_WINDOWS.pop(mod, None)
        if w is not None:
            try:
                w.destroy()
            except Exception:
                pass
        return self.send_json(200, {"ok": True})


    def handle_ftp_test(self, data):
        data = data if isinstance(data, dict) else {}
        host = str(data.get("host") or "").strip()
        if not host:
            return self.send_json(400, {"ok": False, "error": "Host is required"})
        try:
            port = int(data.get("port") or 21)
        except (TypeError, ValueError):
            port = 21
        steps = []
        ok_all = True
        try:
            sock = socket.create_connection((host, port), timeout=10)
            sock.close()
            steps.append({"step": "TCP " + host + ":" + str(port), "ok": True, "detail": "соединение установлено"})
        except Exception as exc:
            steps.append({"step": "TCP " + host + ":" + str(port), "ok": False, "detail": ftp_err_text(exc)})
            return self.send_json(200, {"ok": False, "steps": steps})
        ftp = None
        try:
            ftp = FTP_TLS_E(timeout=12)
            ftp.connect(host, port)
            steps.append({"step": "Баннер FTP", "ok": True, "detail": (ftp.getwelcome() or "").strip()[:120]})
            ftp.auth()
            tlsver = ""
            try:
                tlsver = ftp.sock.version() or ""
            except Exception:
                pass
            steps.append({"step": "AUTH TLS", "ok": True, "detail": "TLS установлен" + (" (" + tlsver + ")" if tlsver else "")})
            login_err = ""
            login_ok = True
            try:
                ftp.login(str(data.get("username") or ""), str(data.get("password") or ""))
            except ftplib.error_perm as exc:
                login_ok = False
                login_err = str(exc)[:160]
                ok_all = False
            steps.append({"step": "Логин", "ok": login_ok, "detail": login_err or "успешно"})
            if not login_ok:
                return self.send_json(200, {"ok": False, "steps": steps})
            try:
                ftp.prot_p()
                steps.append({"step": "PROT P", "ok": True, "detail": "канал данных шифруется"})
                steps.append({"step": "PWD", "ok": True, "detail": ftp.pwd()})
                remote_path = str(data.get("remotePath") or "").strip()
                if remote_path:
                    try:
                        ftp.cwd(remote_path)
                        steps.append({"step": "CWD " + remote_path, "ok": True, "detail": "папка существует"})
                    except ftplib.error_perm as exc:
                        steps.append({"step": "CWD " + remote_path, "ok": False, "detail": str(exc)[:140] + " — папка не найдена. Стандартный путь SCUM: /Server/SCUM/Saved/Config/WindowsServer — проверьте поле «Удалённая папка»"})
            except Exception as exc:
                steps.append({"step": "PROT P / CWD", "ok": False, "detail": ftp_err_text(exc)})
                ok_all = False
        except ftplib.error_perm as exc:
            steps.append({"step": "AUTH/Логин", "ok": False, "detail": str(exc)[:160]})
            ok_all = False
        except Exception as exc:
            steps.append({"step": "Контрольное соединение (TLS)", "ok": False, "detail": ftp_err_text(exc)})
            ok_all = False
        finally:
            if ftp:
                try:
                    ftp.quit()
                except Exception:
                    try:
                        ftp.close()
                    except Exception:
                        pass
        return self.send_json(200, {"ok": ok_all, "steps": steps})

    def handle_export_save(self, data):
        content = str((data or {}).get("content") or "")
        if not content.strip():
            return self.send_json(400, {"ok": False, "error": "content is required"})
        if len(content) > 5 * 1024 * 1024:
            return self.send_json(413, {"ok": False, "error": "File exceeds 5 MB limit"})
        try:
            json.loads(content)
        except (json.JSONDecodeError, UnicodeDecodeError):
            return self.send_json(400, {"ok": False, "error": "content is not valid JSON"})
        name = str((data or {}).get("fileName") or "").strip()
        if not name:
            name = "EconomyOverride-" + datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S") + ".json"
        if not name.lower().endswith(".json"):
            name += ".json"
        safe = re.sub(r"[^A-Za-z0-9_\- .()]", "", name)
        if not safe or safe in (".", ".."):
            return self.send_json(400, {"ok": False, "error": "Invalid file name"})
        target = exports_dir() / safe
        try:
            target.write_text(content, encoding="utf-8")
        except OSError as exc:
            return self.send_json(500, {"ok": False, "error": str(exc)[:300]})
        return self.send_json(200, {"ok": True, "path": str(target)})

    def handle_export_open(self):
        try:
            os.startfile(str(exports_dir()))
        except Exception as exc:
            return self.send_json(500, {"ok": False, "error": str(exc)[:200]})
        return self.send_json(200, {"ok": True})

    def handle_ftp(self, route, data):
        required = ("host", "username", "password", "remotePath")
        if not isinstance(data, dict) or any(not isinstance(data.get(k), str) or not data[k] for k in required):
            return self.send_json(400, {"ok": False, "error": "Host, username, password and remote path are required"})
        if any(c in data["remotePath"] for c in "\r\n"):
            return self.send_json(400, {"ok": False, "error": "Invalid remote path"})
        if route == "/api/ftp/find" and not str(data.get("query") or "").strip():
            return self.send_json(400, {"ok": False, "error": "A search query is required"})
        if route == "/api/ftp/upload-batch":
            if data.get("confirm") is not True:
                return self.send_json(400, {"ok": False, "error": "Batch upload requires explicit confirmation"})
            files = data.get("files")
            if not isinstance(files, list) or not files:
                return self.send_json(400, {"ok": False, "error": "files array is required"})
            if len(files) > 50:
                return self.send_json(400, {"ok": False, "error": "Too many files (max 50)"})
            bad = [str(it.get("fileName") or "")[:80] or "?" for it in files if not isinstance(it, dict) or not QUEST_NAME_RE.match(str(it.get("fileName") or ""))]
            if bad:
                return self.send_json(400, {"ok": False, "error": "fileName must be STORY_*.json: " + ", ".join(bad[:5])})
        try:
            ftp, tls = connect_ftp(data)
        except (ValueError, ftplib.error_perm, ftplib.error_proto, OSError) as exc:
            return self.send_json(502, {"ok": False, "error": str(exc)[:400]})
        try:
            if route == "/api/ftp/find":
                query = str(data.get("query") or "").strip().lower()
                deadline = time.monotonic() + 25
                results, stats = [], {"dirs": 0, "errors": 0}
                truncated = [False]
                def walk(conn, path, depth):
                    if depth > 5 or stats["dirs"] > 400 or time.monotonic() > deadline:
                        truncated[0] = True
                        return
                    stats["dirs"] += 1
                    entries = []
                    try:
                        for name, facts in conn.mlsd(path):
                            if name in (".", ".."):
                                continue
                            entries.append((name, facts.get("type", "file") == "dir", facts.get("size", "")))
                    except (ftplib.error_perm, ftplib.error_proto, AttributeError):
                        try:
                            for name in conn.nlst(path):
                                base = name.rstrip("/").rsplit("/", 1)[-1]
                                if base and base not in (".", ".."):
                                    entries.append((name, False, ""))
                        except (ftplib.error_perm, ftplib.error_proto, OSError):
                            stats["errors"] += 1
                            return
                    except OSError:
                        stats["errors"] += 1
                        return
                    for name, is_dir, size in entries:
                        if time.monotonic() > deadline:
                            truncated[0] = True
                            return
                        base = name.rstrip("/").rsplit("/", 1)[-1]
                        full = (path.rstrip("/") or "") + "/" + base
                        if query in base.lower():
                            results.append({"name": base, "path": full, "dir": path.rstrip("/") or "/", "size": size})
                            if len(results) >= 60:
                                truncated[0] = True
                                return
                        if is_dir:
                            walk(conn, full, depth + 1)
                def do_walk(conn):
                    walk(conn, data["remotePath"] or "/", 0)
                try:
                    do_walk(ftp)
                except (ssl.SSLError, ConnectionError, TimeoutError, EOFError):
                    try:
                        ftp.close()
                    except Exception:
                        pass
                    ftp, tls = connect_ftp(data)
                    deadline = time.monotonic() + 25
                    stats["dirs"] = 0
                    do_walk(ftp)
                return self.send_json(200, {"ok": True, "tls": tls, "query": query, "results": results, "truncated": truncated[0], "stats": stats})
            if route == "/api/ftp/list":
                def do_list(ftp, tls):
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
                    return {"ok": True, "tls": tls, "path": path, "note": note, "files": rows}
                try:
                    return self.send_json(200, do_list(ftp, tls))
                except (ssl.SSLError, ConnectionError, TimeoutError, EOFError):
                    try:
                        ftp.close()
                    except Exception:
                        pass
                    ftp, tls = connect_ftp(data)
                    return self.send_json(200, do_list(ftp, tls))
            rp = data["remotePath"].rstrip("/")
            if re.match(r"^/server/scum/saved/config/windowsserver/?$", rp, re.IGNORECASE):
                rp += "/Quests/Override"
            if route == "/api/ftp/snapshot":
                names = []
                try:
                    for nm, facts in ftp.mlsd(rp):
                        if nm in (".", "..") or facts.get("type", "file") == "dir":
                            continue
                        if nm.startswith("STORY_") and nm.lower().endswith(".json") and QUEST_NAME_RE.match(nm):
                            names.append(nm)
                            if len(names) >= 200:
                                break
                except (ftplib.error_perm, ftplib.error_proto, AttributeError):
                    names = []
                    for nm in ftp.nlst(rp):
                        base = nm.rstrip("/").rsplit("/", 1)[-1]
                        if base.startswith("STORY_") and base.lower().endswith(".json") and QUEST_NAME_RE.match(base):
                            names.append(base)
                            if len(names) >= 200:
                                break
                out_dir = quests_server_dir()
                saved, errors = [], []
                for nm in names:
                    buf = io.BytesIO()
                    try:
                        ftp.retrbinary("RETR " + rp + "/" + nm, buf.write)
                        raw = buf.getvalue()
                        if len(raw) > 5 * 1024 * 1024:
                            raise ValueError("File exceeds 5 MB limit")
                        (out_dir / nm).write_bytes(raw)
                        saved.append({"fileName": nm, "bytes": len(raw)})
                    except (ftplib.error_perm, ftplib.error_proto, ValueError) as exc:
                        errors.append({"fileName": nm, "error": str(exc)[:200]})
                return self.send_json(200, {"ok": True, "remotePath": rp, "count": len(saved), "saved": saved, "errors": errors})
            if route == "/api/ftp/upload-batch":
                files = data["files"]
                dirs_created = ftp_ensure_dir(ftp, rp)
                stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
                results, failed = [], []
                for item in files:
                    fname = str(item.get("fileName") or "") if isinstance(item, dict) else ""
                    if not QUEST_NAME_RE.match(fname):
                        failed.append({"fileName": (fname[:80] or "?"), "error": "fileName must be STORY_*.json"})
                        continue
                    try:
                        raw = base64.b64decode(item.get("content", ""), validate=True)
                        if len(raw) > 5 * 1024 * 1024:
                            raise ValueError("File exceeds 5 MB limit")
                        remote_path = rp + "/" + fname
                        backup_created = False
                        try:
                            cur = io.BytesIO()
                            ftp.retrbinary("RETR " + remote_path, cur.write)
                            ftp.storbinary("STOR " + remote_path + ".backup-" + stamp, io.BytesIO(cur.getvalue()))
                            backup_created = True
                        except ftplib.error_perm:
                            pass
                        ftp.storbinary("STOR " + remote_path, io.BytesIO(raw))
                        results.append({"fileName": fname, "backupCreated": backup_created, "bytes": len(raw)})
                    except (ValueError, ftplib.error_perm, ftplib.error_proto) as exc:
                        failed.append({"fileName": fname, "error": str(exc)[:200]})
                return self.send_json(200, {"ok": True, "remotePath": rp, "uploaded": len(results), "backups": sum(1 for r in results if r["backupCreated"]), "dirsCreated": dirs_created, "failed": failed, "results": results})
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
                dirs_created = ftp_ensure_dir(ftp, data["remotePath"])
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
                return self.send_json(200, {"ok": True, "backupCreated": backup_created, "dirsCreated": dirs_created, "fileName": remote})
        except (OSError, ValueError) + ftplib.all_errors as exc:
            err = ftp_err_text(exc) if isinstance(exc, (ssl.SSLError, ConnectionError, TimeoutError, EOFError)) else str(exc)[:300]
            return self.send_json(502, {"ok": False, "error": err[:300]})
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
