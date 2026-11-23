# FITL ultrasonic bridge (UltraTest BP-700 Pro)

```
BP-700 Pro --USB--> bridge.py --> us_records.db (SQLite) --> http://127.0.0.1:8765  (index.html)
```

Everything runs on the PC that the instrument is plugged into. Nothing is sent to the internet.

This tool is separate from the Ferentino Management System web app: it needs a local Python
process with access to the instrument's USB port, which a browser page served from the web app
cannot do by itself. The web app's **Working Apps → Ultrasonic Test Record** tab is a launcher
that explains this and links to `http://127.0.0.1:8765/` once this is running — it does not run
the bridge for you.

## Files
| File | What it is |
|---|---|
| `bridge.py` | Reads the instrument (or exported files), stores readings, serves the page |
| `index.html` | The records page: live readout, bar check, capture, saved records, print, CSV |
| `start_bridge.bat` | Windows menu to start it |
| `us_records.db` | Created on first run. This is your data. Back it up. |
| `logs/` | Raw serial logs, only when started with `--sniff` |

## First-time setup (Windows)
1. Install Python 3.9 or newer from python.org (tick "Add python.exe to PATH").
2. Double-click `start_bridge.bat`, choose **6** to install `pyserial` and `openpyxl`.
3. Plug the BP-700 Pro into the PC with the USB cable and switch it on.
4. If no COM port shows up when you choose option 1, install UltraTestLab first. Its installer normally brings the USB driver.

## Three ways to feed it

**A. Demo (option 3).** Simulated readings so you can try the page. Every simulated reading is marked "sim" and the page shows a warning banner. Never use it for real records.

**B. Watch the export folder (option 2).** Export a test series from UltraTestLab to CSV or XLSX into one folder and point the bridge at it. New rows are imported once only, even if you export the same file again. Column headers are recognised in English and German (Runtime/Laufzeit, Velocity/Geschwindigkeit, Distance/Strecke, Temperature, Timestamp/Zeitstempel). If your export uses other headers, the status line on the page says so; describe the columns with `--fields`, for example `--fields "-,-,runtime_us,velocity_ms,distance_mm"`.

**C. Live over USB (option 1).** Uses the instrument's virtual COM port.
This is the part that needs the instrument's real protocol, which Ultratest has not published. The bridge currently understands text lines that carry values with units, such as `runtime: 93,35 µs  velocity: 4285,0 m/s  400 mm`, or plain delimited numbers (`--fields`). If the instrument speaks something else, do this:

1. Choose option 5 (or run `python bridge.py --source serial --port COM5 --sniff`).
2. Put the probes on the calibration bar and let it measure for 30 seconds. Then press a few buttons on the instrument (distance, interval) and note what you pressed.
3. Send me the newest file in `logs/` plus your notes. The hex dump shows exactly what the instrument sends, and the parser can be written from it.
4. If nothing arrives at all, the instrument probably waits for a command. Ask Ultratest (+49 4202 955 1390) for the PC command list, then use `--send "COMMAND\r\n" --send-interval 1`.
5. If you see garbage, try another baud rate: `--baud 9600`, `38400`, `57600`, `115200`.

## Using the page
- **New test**: fill in the batch and item, check the probes on the calibration bar (the page compares the bar reading with 10 or 20 µs and the tolerance set in Setup), then press **Capture** (or Space) at each position. Readings that came from the instrument are tagged "auto"; anything typed or edited by hand loses the tag, so the record shows which values were entered by a person.
- **Saved records**: filter, open, print as a signed form, edit, delete, export CSV.
- **Setup**: document number, equipment details, calibration due date, bar tolerance, default spec limits, default measuring positions.

## Other computers on the factory network
Start with `python bridge.py --source serial --port COM5 --host 0.0.0.0` and open `http://<this PC's IP>:8765/` from another PC. There is no login, so only do this on a network you trust.

## Housekeeping
- Raw readings older than 30 days are removed automatically (`--keep-days 0` keeps everything). Saved test records are never removed automatically.
- Back up `us_records.db` regularly, for example with a scheduled copy to OneDrive.
- Stop the bridge with Ctrl+C or by closing its window.
