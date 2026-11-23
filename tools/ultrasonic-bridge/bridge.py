#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
FITL ultrasonic bridge
======================
UltraTest BP-700 Pro  ->  this program  ->  SQLite file  ->  local web page

What it does
  1. Gets readings from the instrument (or from files exported by UltraTestLab,
     or from a built-in simulator for testing).
  2. Stores them in a small SQLite file (us_records.db, next to this script).
  3. Serves the records page (index.html) and a JSON API on http://127.0.0.1:8765

Sources  (choose with --source)
  serial   read the instrument's USB virtual COM port directly
  watch    watch a folder for CSV/XLSX files exported by UltraTestLab
  sim      simulated readings (demo only, readings are flagged "sim")
  none     just serve the page and the stored records

Standard library only. Optional packages:
  pyserial  (for --source serial)     pip install pyserial
  openpyxl  (for .xlsx in watch mode) pip install openpyxl
"""
from __future__ import annotations

import argparse
import codecs
import csv
import glob
import hashlib
import json
import os
import random
import re
import sqlite3
import sys
import threading
import time
import uuid
import webbrowser
from contextlib import contextmanager
from datetime import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

HERE = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(HERE, "us_records.db")
LOG_DIR = os.path.join(HERE, "logs")
STOP = threading.Event()
SNIFF = False          # log raw serial bytes when True
FIELDS: list[str] = []  # positional column map for delimited text, see --fields
DELIM = ";"


# --------------------------------------------------------------------------
# shared state (what the web page shows as "live")
# --------------------------------------------------------------------------
class Shared:
    def __init__(self) -> None:
        self.lock = threading.Lock()
        self.source = "none"
        self.live = False          # True = continuous stream (serial / sim)
        self.state = "starting"
        self.message = ""
        self.latest: dict | None = None
        self.count = 0

    def set_state(self, state: str, message: str = "") -> None:
        with self.lock:
            changed = (state, message) != (self.state, self.message)
            self.state, self.message = state, message
        if changed:
            print(f"[{state}] {message}".rstrip(), flush=True)


SH = Shared()


# --------------------------------------------------------------------------
# database
# --------------------------------------------------------------------------
@contextmanager
def db():
    con = sqlite3.connect(DB_PATH, timeout=15)
    con.row_factory = sqlite3.Row
    try:
        yield con
        con.commit()
    finally:
        con.close()


def init_db() -> None:
    with db() as c:
        c.executescript(
            """
            PRAGMA journal_mode=WAL;
            CREATE TABLE IF NOT EXISTS readings(
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                ts REAL NOT NULL,
                runtime_us REAL, velocity_ms REAL, distance_mm REAL, temp_c REAL,
                source TEXT, raw TEXT);
            CREATE INDEX IF NOT EXISTS ix_readings_ts ON readings(ts);
            CREATE TABLE IF NOT EXISTS records(
                id TEXT PRIMARY KEY, date TEXT,
                created_at REAL, updated_at REAL, data TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS config(key TEXT PRIMARY KEY, value TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS imported(hash TEXT PRIMARY KEY);
            """
        )


def prune_readings(keep_days: int) -> None:
    if keep_days <= 0:
        return
    cutoff = time.time() - keep_days * 86400
    with db() as c:
        n = c.execute("DELETE FROM readings WHERE ts < ?", (cutoff,)).rowcount
    if n:
        print(f"[housekeeping] removed {n} readings older than {keep_days} days")


_last_store = {"key": None, "t": 0.0}
_store_lock = threading.Lock()


def store_reading(r: dict, force: bool = False) -> None:
    key = (r.get("runtime_us"), r.get("velocity_ms"), r.get("distance_mm"), r.get("temp_c"))
    now = time.time()
    with _store_lock:
        if not force and key == _last_store["key"] and now - _last_store["t"] < 10:
            return
        _last_store["key"], _last_store["t"] = key, now
    with db() as c:
        c.execute(
            "INSERT INTO readings(ts,runtime_us,velocity_ms,distance_mm,temp_c,source,raw)"
            " VALUES (?,?,?,?,?,?,?)",
            (r["ts"], r.get("runtime_us"), r.get("velocity_ms"), r.get("distance_mm"),
             r.get("temp_c"), r.get("source"), r.get("raw")),
        )


def derive(r: dict) -> None:
    """velocity [m/s] = distance [mm] / runtime [us] * 1000  (formula in the BP-700 manual)"""
    rt, v, d = r.get("runtime_us"), r.get("velocity_ms"), r.get("distance_mm")
    if v is None and rt and d:
        r["velocity_ms"] = round(d / rt * 1000.0, 1)


def publish(r: dict, source: str, persist: bool = True, force: bool = False) -> None:
    r = dict(r)
    r["source"] = source
    r.setdefault("ts", time.time())
    derive(r)
    with SH.lock:
        SH.latest = r
        SH.count += 1
    if persist:
        store_reading(r, force)


# --------------------------------------------------------------------------
# parsing
# --------------------------------------------------------------------------
NUM = r"[-+]?\d+(?:[.,]\d+)?"
RE_RT = re.compile(rf"({NUM})\s*(?:[µμ]s|us|usec)\b", re.I)
RE_V = re.compile(rf"({NUM})\s*m\s*/\s*s\b", re.I)
RE_D = re.compile(rf"({NUM})\s*mm\b", re.I)
RE_T = re.compile(rf"({NUM})\s*(?:°\s*C|deg\s*C)", re.I)
RE_NUM = re.compile(NUM)


def tonum(x) -> float | None:
    if x is None:
        return None
    if isinstance(x, (int, float)):
        return float(x)
    m = RE_NUM.search(str(x).strip().replace(" ", " "))
    if not m:
        return None
    try:
        return float(m.group(0).replace(",", "."))
    except ValueError:
        return None


def parse_line(text: str) -> dict | None:
    """Turn one line of text from the instrument into a reading.

    !!! This is a best guess until the real BP-700 Pro protocol is known. !!!
    It understands lines that carry values with units, e.g.
        runtime: 93,35 us   velocity: 4285,0 m/s   400 mm
    or plain delimited numbers when --fields is given, e.g.
        93.35;4285.0;400
    Run with --sniff to see exactly what the instrument sends.
    """
    out: dict = {}
    for key, rx in (("runtime_us", RE_RT), ("velocity_ms", RE_V),
                    ("distance_mm", RE_D), ("temp_c", RE_T)):
        m = rx.search(text)
        if m:
            out[key] = tonum(m.group(1))
    if not out and FIELDS:
        parts = [p.strip() for p in text.split(DELIM)]
        for name, part in zip(FIELDS, parts):
            if name and name != "-":
                v = tonum(part)
                if v is not None:
                    out[name] = v
    if not out.get("runtime_us") and not out.get("velocity_ms"):
        return None
    out["raw"] = text[:200]
    return out


def decode_bytes(b: bytes) -> str:
    for enc in ("utf-8", "cp1252", "latin-1"):
        try:
            return b.decode(enc)
        except UnicodeDecodeError:
            continue
    return b.decode("latin-1", "replace")


# --------------------------------------------------------------------------
# source 1: serial (USB virtual COM port)
# --------------------------------------------------------------------------
def rawlog(chunk: bytes) -> None:
    if not SNIFF:
        return
    os.makedirs(LOG_DIR, exist_ok=True)
    stamp = datetime.now().strftime("%Y%m%d")
    line = f"{datetime.now().strftime('%H:%M:%S.%f')[:-3]}  {chunk.hex(' ')}  |{decode_bytes(chunk)!r}"
    print("[raw] " + line, flush=True)
    with open(os.path.join(LOG_DIR, f"raw_{stamp}.log"), "a", encoding="utf-8") as f:
        f.write(line + "\n")


def run_serial(a) -> None:
    try:
        import serial  # type: ignore
    except ImportError:
        SH.set_state("error", "pyserial is not installed. Run:  pip install pyserial")
        return
    SH.live = True
    send = codecs.decode(a.send, "unicode_escape").encode("latin-1") if a.send else None
    unparsed = 0
    while not STOP.is_set():
        try:
            ser = serial.Serial(a.port, a.baud, bytesize=8, parity="N", stopbits=1, timeout=0.3)
        except Exception as e:  # noqa: BLE001
            SH.set_state("error", f"Cannot open {a.port}: {e}")
            STOP.wait(3)
            continue
        SH.set_state("connected", f"{a.port} at {a.baud} baud")
        buf, last_rx, last_tx = b"", time.time(), 0.0
        try:
            while not STOP.is_set():
                if send and time.time() - last_tx >= a.send_interval:
                    ser.write(send)
                    last_tx = time.time()
                chunk = ser.read(512)
                now = time.time()
                lines: list[bytes] = []
                if chunk:
                    rawlog(chunk)
                    buf += chunk
                    last_rx = now
                    parts = re.split(rb"[\r\n]+", buf)
                    buf = parts.pop()
                    lines = [p for p in parts if p.strip()]
                    if len(buf) > 4096:
                        buf = b""
                elif buf and now - last_rx > 0.3:   # frame without line ending
                    lines, buf = [buf], b""
                for p in lines:
                    text = decode_bytes(p)
                    r = parse_line(text)
                    if r:
                        publish(r, "serial")
                    else:
                        unparsed += 1
                        if unparsed <= 20:
                            print(f"[unparsed] {text!r}   (run with --sniff to see raw bytes)")
        except Exception as e:  # noqa: BLE001
            SH.set_state("error", f"Serial error: {e}")
        finally:
            try:
                ser.close()
            except Exception:  # noqa: BLE001
                pass
        STOP.wait(2)


def list_ports() -> None:
    try:
        from serial.tools import list_ports as lp  # type: ignore
    except ImportError:
        print("pyserial is not installed. Run:  pip install pyserial")
        return
    ports = list(lp.comports())
    if not ports:
        print("No serial ports found. Is the instrument switched on and the USB cable plugged in?")
    for p in ports:
        print(f"{p.device:12} {p.description}  [{p.hwid}]")


# --------------------------------------------------------------------------
# source 2: watch a folder for UltraTestLab exports (CSV / XLSX / TXT)
# --------------------------------------------------------------------------
HEADER_KEYS = {
    "ts": ("zeitstempel", "timestamp", "time stamp", "date", "datum", "uhrzeit"),
    "runtime_us": ("runtime", "laufzeit", "transit", "µs", "μs"),
    "velocity_ms": ("velocity", "geschw", "speed", "m/s"),
    "distance_mm": ("distance", "strecke", "length", "länge"),
    "temp_c": ("temperatur", "temperature", "°c"),
}
TS_FORMATS = ("%Y-%m-%d %H:%M:%S", "%d.%m.%Y %H:%M:%S", "%d/%m/%Y %H:%M:%S", "%m/%d/%Y %H:%M:%S",
              "%Y-%m-%d %H:%M", "%d.%m.%Y %H:%M", "%d/%m/%Y %H:%M", "%Y-%m-%dT%H:%M:%S")


def read_rows(path: str) -> list[list]:
    ext = os.path.splitext(path)[1].lower()
    if ext == ".xlsx":
        try:
            import openpyxl  # type: ignore
        except ImportError:
            raise RuntimeError("openpyxl is not installed (pip install openpyxl) - needed for .xlsx")
        wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
        rows: list[list] = []
        for ws in wb.worksheets:
            for row in ws.iter_rows(values_only=True):
                rows.append(list(row))
        wb.close()
        return rows
    raw = open(path, "rb").read()
    text = decode_bytes(raw).lstrip("﻿")
    sample = text[:4096]
    counts = {";": sample.count(";"), ",": sample.count(","), "\t": sample.count("\t")}
    delim = max(counts, key=counts.get) if any(counts.values()) else ";"
    return [row for row in csv.reader(io.StringIO(text), delimiter=delim)]


import io  # noqa: E402  (used by read_rows)


def find_header(rows: list[list]) -> tuple[dict, int]:
    for i, row in enumerate(rows[:30]):
        cells = [str(c or "").strip().lower() for c in row]
        mapping: dict[str, int] = {}
        for field, keys in HEADER_KEYS.items():
            for j, cell in enumerate(cells):
                if j in mapping.values():
                    continue
                if cell and any(k in cell for k in keys):
                    mapping[field] = j
                    break
        if "runtime_us" in mapping or "velocity_ms" in mapping:
            return mapping, i
    return {}, -1


def parse_ts(value, fallback: float) -> float:
    if isinstance(value, datetime):
        return value.timestamp()
    s = str(value or "").strip()
    for fmt in TS_FORMATS:
        try:
            return datetime.strptime(s, fmt).timestamp()
        except ValueError:
            continue
    return fallback


def import_file(path: str) -> int:
    name = os.path.basename(path)
    rows = read_rows(path)
    mapping, hdr = find_header(rows)
    if not mapping:
        if FIELDS:
            mapping = {f: i for i, f in enumerate(FIELDS) if f and f != "-"}
            hdr = -1
        else:
            first = rows[0] if rows else []
            SH.set_state("error", f"{name}: could not recognise the columns. First row: {first[:8]}. "
                                  f"Use --fields to describe them.")
            return 0
    mtime = os.path.getmtime(path)
    new = 0
    with db() as c:
        for i in range(hdr + 1, len(rows)):
            row = rows[i]
            vals: dict = {}
            for field, idx in mapping.items():
                if idx >= len(row):
                    continue
                vals[field] = row[idx] if field == "ts" else tonum(row[idx])
            if vals.get("runtime_us") is None and vals.get("velocity_ms") is None:
                continue
            key = f"{name}|{i}|" + "|".join(str(x) for x in row)
            h = hashlib.sha1(key.encode("utf-8", "replace")).hexdigest()
            if c.execute("INSERT OR IGNORE INTO imported(hash) VALUES (?)", (h,)).rowcount != 1:
                continue
            r = {k: v for k, v in vals.items() if k != "ts"}
            r["ts"] = parse_ts(vals.get("ts"), mtime + i * 0.001)
            r["raw"] = f"{name} row {i + 1}"
            derive(r)
            r["source"] = f"file:{name}"
            c.execute(
                "INSERT INTO readings(ts,runtime_us,velocity_ms,distance_mm,temp_c,source,raw)"
                " VALUES (?,?,?,?,?,?,?)",
                (r["ts"], r.get("runtime_us"), r.get("velocity_ms"), r.get("distance_mm"),
                 r.get("temp_c"), r["source"], r["raw"]),
            )
            with SH.lock:
                SH.latest, SH.count = r, SH.count + 1
            new += 1
    return new


def run_watch(a) -> None:
    SH.live = False
    folder = a.folder
    if not folder or not os.path.isdir(folder):
        SH.set_state("error", f"Folder not found: {folder!r}. Use --folder <path to UltraTestLab export folder>")
        return
    SH.set_state("watching", f"Watching {folder}")
    seen: dict[str, tuple] = {}
    while not STOP.is_set():
        files = []
        for pat in ("*.csv", "*.xlsx", "*.txt"):
            files += glob.glob(os.path.join(folder, pat))
        for path in sorted(files):
            if os.path.basename(path).startswith("~$"):
                continue
            try:
                st = os.stat(path)
                sig = (st.st_mtime, st.st_size)
                if seen.get(path) == sig:
                    continue
                time.sleep(0.5)                      # let the exporting program finish
                if os.stat(path).st_size != st.st_size:
                    continue
                n = import_file(path)
                seen[path] = sig
                if n:
                    SH.set_state("watching", f"Watching {folder} - imported {n} new reading(s) "
                                             f"from {os.path.basename(path)}")
            except (PermissionError, OSError):
                continue                             # file still open elsewhere, retry later
            except Exception as e:  # noqa: BLE001
                seen[path] = sig
                SH.set_state("error", f"{os.path.basename(path)}: {e}")
        STOP.wait(2)


# --------------------------------------------------------------------------
# source 3: simulator
# --------------------------------------------------------------------------
def run_sim(a) -> None:
    SH.live = True
    SH.set_state("simulated", "Simulated readings - no instrument connected")
    while not STOP.is_set():
        publish({"runtime_us": round(93.35 + random.gauss(0, 0.08), 2),
                 "distance_mm": 400.0,
                 "temp_c": round(29 + random.gauss(0, 0.1), 1)}, "sim")
        STOP.wait(1.0)


# --------------------------------------------------------------------------
# web server
# --------------------------------------------------------------------------
class Handler(BaseHTTPRequestHandler):
    server_version = "FITL-US-Bridge/1.0"

    def log_message(self, *args) -> None:  # keep the console quiet
        pass

    def _json(self, obj, code: int = 200) -> None:
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def _body(self) -> dict:
        n = int(self.headers.get("Content-Length") or 0)
        if n > 2_000_000:
            raise ValueError("request too large")
        return json.loads(self.rfile.read(n) or b"{}")

    # ---- GET
    def do_GET(self) -> None:  # noqa: N802
        u = urlparse(self.path)
        p = u.path
        try:
            if p in ("/", "/index.html"):
                data = open(os.path.join(HERE, "index.html"), "rb").read()
                self.send_response(200)
                self.send_header("Content-Type", "text/html; charset=utf-8")
                self.send_header("Content-Length", str(len(data)))
                self.send_header("Cache-Control", "no-store")
                self.end_headers()
                self.wfile.write(data)
            elif p == "/api/status":
                with SH.lock:
                    self._json({"source": SH.source, "live": SH.live, "state": SH.state,
                                "message": SH.message, "latest": SH.latest,
                                "count": SH.count, "now": time.time()})
            elif p == "/api/readings":
                limit = min(int(parse_qs(u.query).get("limit", ["30"])[0]), 500)
                with db() as c:
                    rows = c.execute("SELECT id,ts,runtime_us,velocity_ms,distance_mm,temp_c,source "
                                     "FROM readings ORDER BY id DESC LIMIT ?", (limit,)).fetchall()
                self._json([dict(r) for r in rows])
            elif p == "/api/records":
                with db() as c:
                    rows = c.execute("SELECT data FROM records ORDER BY created_at DESC LIMIT 5000").fetchall()
                self._json([json.loads(r["data"]) for r in rows])
            elif p == "/api/config":
                with db() as c:
                    row = c.execute("SELECT value FROM config WHERE key='main'").fetchone()
                self._json(json.loads(row["value"]) if row else {})
            else:
                self._json({"error": "not found"}, 404)
        except Exception as e:  # noqa: BLE001
            self._json({"error": str(e)}, 500)

    # ---- POST
    def do_POST(self) -> None:  # noqa: N802
        p = urlparse(self.path).path
        try:
            body = self._body()
            if p == "/api/records":
                rid = str(body.get("id") or uuid.uuid4().hex[:12])
                body["id"] = rid
                now = time.time()
                with db() as c:
                    old = c.execute("SELECT created_at FROM records WHERE id=?", (rid,)).fetchone()
                    created = old["created_at"] if old else now
                    body["createdAt"], body["updatedAt"] = created, now
                    c.execute("INSERT INTO records(id,date,created_at,updated_at,data) VALUES (?,?,?,?,?) "
                              "ON CONFLICT(id) DO UPDATE SET date=excluded.date, updated_at=excluded.updated_at, "
                              "data=excluded.data",
                              (rid, body.get("date"), created, now, json.dumps(body, ensure_ascii=False)))
                self._json({"ok": True, "id": rid})
            elif p == "/api/config":
                with db() as c:
                    c.execute("INSERT INTO config(key,value) VALUES('main',?) "
                              "ON CONFLICT(key) DO UPDATE SET value=excluded.value",
                              (json.dumps(body, ensure_ascii=False),))
                self._json({"ok": True})
            else:
                self._json({"error": "not found"}, 404)
        except Exception as e:  # noqa: BLE001
            self._json({"error": str(e)}, 400)

    # ---- DELETE
    def do_DELETE(self) -> None:  # noqa: N802
        p = urlparse(self.path).path
        try:
            if p.startswith("/api/records/"):
                rid = p.rsplit("/", 1)[1]
                with db() as c:
                    c.execute("DELETE FROM records WHERE id=?", (rid,))
                self._json({"ok": True})
            else:
                self._json({"error": "not found"}, 404)
        except Exception as e:  # noqa: BLE001
            self._json({"error": str(e)}, 400)


# --------------------------------------------------------------------------
# main
# --------------------------------------------------------------------------
def main() -> None:
    global SNIFF, FIELDS, DELIM
    ap = argparse.ArgumentParser(description="FITL ultrasonic bridge (BP-700 Pro -> SQLite -> local web page)")
    ap.add_argument("--source", choices=["serial", "watch", "sim", "none"], default="none")
    ap.add_argument("--port", help="serial port, e.g. COM5 (Windows) or /dev/ttyUSB0")
    ap.add_argument("--baud", type=int, default=115200, help="serial baud rate (default 115200)")
    ap.add_argument("--send", help=r"text to send to the instrument now and then, e.g. 'READ\r\n'")
    ap.add_argument("--send-interval", type=float, default=1.0, help="seconds between --send commands")
    ap.add_argument("--sniff", action="store_true", help="print and log raw serial bytes (to find the protocol)")
    ap.add_argument("--fields", help="column names for delimited text/files, comma separated, "
                                     "e.g. runtime_us,velocity_ms,distance_mm  (use - to skip a column)")
    ap.add_argument("--delimiter", default=";", help="delimiter for --fields on serial lines (default ;)")
    ap.add_argument("--folder", help="folder to watch for UltraTestLab exports (--source watch)")
    ap.add_argument("--host", default="127.0.0.1", help="use 0.0.0.0 to let other PCs on the LAN open the page")
    ap.add_argument("--web-port", type=int, default=8765)
    ap.add_argument("--keep-days", type=int, default=30, help="delete raw readings older than this (0 = keep all)")
    ap.add_argument("--no-browser", action="store_true")
    ap.add_argument("--list-ports", action="store_true", help="list serial ports and exit")
    a = ap.parse_args()

    if a.list_ports:
        list_ports()
        return
    SNIFF = a.sniff
    DELIM = a.delimiter.replace("\\t", "\t")
    FIELDS = [f.strip() for f in a.fields.split(",")] if a.fields else []

    init_db()
    prune_readings(a.keep_days)
    SH.source = a.source

    target = {"serial": run_serial, "watch": run_watch, "sim": run_sim}.get(a.source)
    if a.source == "serial" and not a.port:
        print("Give the COM port with --port (see: python bridge.py --list-ports)")
        sys.exit(2)
    if target:
        threading.Thread(target=target, args=(a,), daemon=True).start()
    else:
        SH.set_state("none", "No instrument source selected (use --source serial | watch | sim)")

    srv = ThreadingHTTPServer((a.host, a.web_port), Handler)
    url = f"http://{'127.0.0.1' if a.host == '0.0.0.0' else a.host}:{a.web_port}/"
    print(f"\n  Records page:  {url}\n  Database file: {DB_PATH}\n  Stop with Ctrl+C\n", flush=True)
    if not a.no_browser:
        threading.Timer(1.0, lambda: webbrowser.open(url)).start()
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        STOP.set()
        srv.server_close()


if __name__ == "__main__":
    main()
