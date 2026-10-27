# CSAP Queue Kiosk Printer Setup Guide

Each kiosk PC opens the queue website in Chrome and prints a ticket automatically on its own thermal printer when a student reserves. Setup takes about 15 minutes per PC and is done once.

**You need:**

- A Windows PC with **Google Chrome** (or Microsoft Edge) installed
- A **58 mm thermal receipt printer** with paper loaded, plugged in by USB
- The printer's **Windows driver** (from the seller or the printer brand's website)
- The **office name** used in the website link, e.g. `accounting` in `queue-csap.vercel.app/accounting/reserve`

Do the steps in order. Steps 1–2 are for the printer, Steps 3–4 for the kiosk screen, Step 5 checks everything works.

## Step 1: Install the printer driver

The printer must show up in Windows as a printer before the website can use it.

1. Plug the printer into a USB port and turn it on. **Always use this same USB port** — a different port can make Windows add the printer again under a new name.
2. Run the driver installer from the seller or the brand's website. For Xprinter-compatible printers, the driver is on the [Xprinter XP-58IIL download page](https://www.xprintertech.com/all-products/xprinter-xp-58iil-driver-download) (Drivers → Windows Driver). If it asks for a port, choose the **USB** port listed (e.g. `USB002`).
3. Open **Settings → Bluetooth & devices → Printers & scanners** and check the printer is listed. Write down its exact name (e.g. `Xprinter XP-58`).
4. Click the printer → **Print a test page**. The test page must come out clean.

> **If the test page comes out cut into strips** (letters split or printed twice), this printer cannot print from a browser cleanly. Stop here and see **Known limitations** at the end.

If the installer added the printer twice (two entries on the same USB port), keep one and **Remove** the other.

## Step 2: Make it the default printer

The kiosk always prints to the Windows **default printer**, so the thermal printer must be the default and stay that way.

1. In **Settings → Bluetooth & devices → Printers & scanners**, turn **off** "Let Windows manage my default printer". Otherwise Windows can switch the default on its own.
2. Click the thermal printer → **Set as default**.
3. Click **Printing preferences** and set:

   | Tab | Setting | Value |
   | --- | --- | --- |
   | Page Setup | Paper size (Stock) | **58(48) x 3276 mm** |
   | Page Setup | Direction / Orientation | **Portrait** |
   | Printer Settings | Paper Cutter | **Cut paper per page** (if your printer has a cutter) |
   | Printer Settings | Compressed command | **Unticked** |

4. Click **Apply → OK**.

Setting names differ a little between drivers. If yours has no such setting, skip it.

## Step 3: Create the kiosk shortcut

This shortcut opens the reservation page fullscreen and lets it print without asking.

1. Right-click the desktop → **New → Shortcut**.
2. In the location box, paste this whole line (change `accounting` to your office):

   ```
   "C:\Program Files\Google\Chrome\Application\chrome.exe" --kiosk --kiosk-printing --user-data-dir="C:\kiosk-profile" "https://queue-csap.vercel.app/accounting/reserve?kiosk=1"
   ```

3. Click **Next**, name it `CSAP Kiosk`, click **Finish**.

**If Windows says it can't find the file:** Chrome is in the other folder. Right-click the shortcut → **Properties** and in **Target** change `Program Files` to `Program Files (x86)`. Paste into **Target**, never into **Start in**.

**What each part does:**

| Part | Purpose |
| --- | --- |
| `--kiosk` | Fullscreen; no address bar or tabs |
| `--kiosk-printing` | Prints straight to the default printer, no print window |
| `--user-data-dir="C:\kiosk-profile"` | A separate Chrome profile just for the kiosk |
| `?kiosk=1` | Marks this browser as a kiosk so tickets print automatically |

**Using Edge instead:** use the same line with `"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"` at the start and `C:\kiosk-profile-edge` as the profile folder.

## Step 4: Start the kiosk automatically (optional)

With this, the kiosk opens by itself every time the PC is turned on.

1. Press **Windows key + R**, type `shell:startup`, press **Enter**. A folder opens.
2. Copy the **CSAP Kiosk** shortcut from the desktop into that folder.
3. Keep the screen from sleeping: **Settings → System → Power** (or Power & battery) → **Screen and sleep** → set "When plugged in, turn off my screen after" and "put my device to sleep after" to **Never**.
4. Avoid surprise restarts during office hours: **Settings → Windows Update → Advanced options → Active hours** → set your office hours.

## Step 5: Test it

One test reservation confirms the whole setup works.

1. **Close every Chrome window** first. If Chrome is already open, the shortcut ignores its kiosk settings.
2. Double-click **CSAP Kiosk**. The reservation page opens fullscreen.
3. Fill in the form with test details and reserve.
4. **Expected:** the "Queue Reserved" page appears and a short ticket prints by itself. A print window may flash for half a second; that is normal.
5. Press **F5** to refresh. **Expected:** nothing prints again.
6. Press **Alt + F4** to close the kiosk.
7. **Important:** the test is a real reservation. Ask staff to **skip** it in the admin queue.

If anything is different, see **Troubleshooting** below.

## Daily use (for staff)

Once set up, staff only need to turn the PC and printer on.

| Task | How |
| --- | --- |
| Start the kiosk | Turn on the printer, then the PC. If the kiosk doesn't open by itself, double-click **CSAP Kiosk**. |
| Close the kiosk | Press **Alt + F4**. |
| Refill paper | Open the printer lid, drop in a new 58 mm roll with the paper coming out from the bottom, pull a little out, close the lid. |
| A ticket didn't print | The student's queue number is still saved. Have them show the "Queue Reserved" screen, or find their number in the admin queue. |
| Printer was unplugged | Before plugging it back in, open the printer's print queue and **Cancel all**. Otherwise old tickets print all at once. |

## Troubleshooting

Most problems come from Chrome already running, or the wrong default printer.

| Problem | Likely cause | Fix |
| --- | --- | --- |
| A print window opens and waits | Chrome was already open, so kiosk settings were ignored | Close all Chrome windows and open **CSAP Kiosk** again |
| Nothing prints, no window | Link is missing `?kiosk=1` | Check the shortcut's **Target** ends with `/reserve?kiosk=1"` |
| Nothing prints, no window | Chrome is printing to another printer (e.g. Save as PDF) | Run the shortcut once **without** `--kiosk --kiosk-printing`, reserve, choose the thermal printer in the print window, print. Chrome remembers it. |
| Nothing prints | Printer off, out of paper, or jobs stuck | Check the printer, then **Printers & scanners → printer → Open print queue** and clear stuck jobs |
| Prints to the wrong printer | Default printer changed | Repeat **Step 2** |
| "Problem with Shortcut" error | Line was pasted into **Start in** | Paste it into **Target**; leave Start in empty |
| Ticket prints landscape or tiny | Wrong paper size in the driver | Repeat **Step 2**, paper size **58(48) x 3276 mm**, Portrait |
| Letters cut into strips or printed twice | The printer can't print browser graphics | See **Known limitations** |

## Known limitations

- **Brief flash:** Chrome shows its print window for about half a second before printing. It cannot be removed in Chrome; it closes by itself.
- **Some printers print in strips:** the browser sends the ticket as a picture. Some low-cost 58 mm printers (for example ones that show up in Device Manager as **"YICHIP POS58 Printer"**) cut pictures into 3 mm strips, even on the Windows test page. Driver settings do not fix it. Use a printer whose Windows test page prints clean, or ask the developer about the direct-USB option.
- **Chrome or Edge only:** Firefox works only after extra settings and is not covered here.
- **Students can exit with Alt + F4.** Fully locking the PC needs Windows Pro's Assigned Access.
