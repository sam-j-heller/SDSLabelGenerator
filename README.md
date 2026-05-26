# Quick Label — Chemical Safety Label Generator

A free, browser-based tool for generating GHS-compliant chemical safety labels with live preview. No installation, no account, no downloads required.

**→ [Open the Tool](https://sam-j-heller.github.io/SDSLabelGenerator/)**

---

## What It Does

Quick Label generates print-ready chemical safety labels in two sizes:

- **Full Label** — 10 × 7.5 in (letter landscape, fits a full sheet)
- **Sticker Label** — 3 × 4 in (small container / secondary label)

Both formats include all six GHS label elements required under OSHA's HazCom 2012 standard, plus NFPA 704 and HMIS rating systems for workplace use.

---

## Getting Started

1. Open the tool in your browser
2. Fill in the left-hand form — the label preview on the right updates in real time
3. When ready, click **Print / Save as PDF** to print or export

That's it. No sign-in required.

---

## The Form — Field by Field

### Chemical Database (Library)
Save and reload chemicals you use regularly. The library is stored in your browser's local storage, so it persists between sessions on the same device.

| Control | What it does |
|---|---|
| **Saved Chemicals** dropdown | Select a previously saved chemical |
| **Load** | Fills the form with the selected chemical's data |
| **✕** | Deletes the selected chemical from the library |
| **+ Save Current to Library** | Saves the current form as a new entry (or overwrites if the product name matches) |

> **Google Drive Sync** — Click **Connect Google Drive** to sync your library across devices. Your library is stored as `chem_label_library.json` in your Drive. Local and remote libraries are merged automatically — no data is overwritten.

---

### Product
**Product Identifier** — The full name of the chemical or mixture as it appears on the SDS (e.g., `Acetone, 99% ACS`). This populates the large banner at the top of the label.

---

### Signal Word
Select the appropriate GHS signal word:

| Option | When to use |
|---|---|
| **DANGER** | More severe hazard category |
| **WARNING** | Less severe hazard category |
| **None** | Chemical is not classified as hazardous — displays "NOT HAZARDOUS" |

---

### Hazard Information
Enter **Hazard Statements** and **Precautionary Statements** from the SDS, one per line.

**Example:**
```
H225 Highly flammable liquid and vapour.
H319 Causes serious eye irritation.
P210 Keep away from heat and open flames.
P233 Keep container tightly closed.
```

---

### First Aid
Enter first aid measures from the SDS Section 4. Lines beginning with a phrase followed by a colon (e.g., `If inhaled:`) are automatically bolded on the label for quick readability.

**Example:**
```
If inhaled: Remove to fresh air. Call a doctor if symptoms persist.
If on skin: Wash thoroughly with soap and water.
If in eyes: Rinse with water for 15 minutes. Seek medical attention.
If swallowed: Call Poison Control Center (1-800-222-1222).
```

---

### GHS Pictograms
Check any pictograms that apply. The selected symbols appear in the rotating diamond cluster on the label. All 9 GHS pictograms are available:

| Pictogram | Hazard |
|---|---|
| Flammable | Flammable liquids, solids, gases, pyrophorics |
| Toxic | Acute toxicity (fatal/toxic) |
| Corrosive | Skin/eye corrosion, metal corrosion |
| Oxidizer | Oxidizing liquids, solids, gases |
| Gas Cylinder | Gases under pressure |
| Explosive | Unstable explosives, self-reactives, organic peroxides |
| Health Hazard | Carcinogens, respiratory sensitizers, reproductive toxins |
| Environmental | Aquatic toxicity |
| Irritant | Skin/eye irritation, skin sensitizer, narcotic effects |

Active pictograms are also listed in the **GHS Hazards Present** line of the label's rating guide section.

---

### NFPA 704
The fire diamond displayed on the label. Set each quadrant (0–4) from the SDS or your facility's chemical inventory.

| Quadrant | Color | Meaning |
|---|---|---|
| **Health** | Blue (left) | 0 = No hazard → 4 = Deadly |
| **Flammability** | Red (top) | 0 = Won't burn → 4 = Flash point < 73°F |
| **Instability** | Yellow (right) | 0 = Stable → 4 = May explode at normal conditions |
| **Special** | White (bottom) | OX = Oxidizer, W = Water reactive, SA = Simple asphyxiant |

---

### HMIS
The color-coded bar system used for daily worker safety. HMIS uses the same 0–4 scale as NFPA for Health, Flammability, and Reactivity.

**Sync from NFPA** — Click the blue **↓ Sync from NFPA** button to automatically copy the NFPA Health, Flammability, and Instability values into the corresponding HMIS fields.

**Personal Protection (PPE)** — Select the HMIS PPE letter code from the SDS. The label automatically expands the code into plain-English equipment requirements:

| Code | PPE Required |
|---|---|
| A | Safety glasses |
| B | Safety glasses + gloves |
| C | Safety glasses + gloves + apron |
| D | Face shield + gloves + apron |
| E | Safety glasses + gloves + dust respirator |
| F | Safety glasses + gloves + apron + dust respirator |
| G | Safety glasses + gloves + vapor respirator |
| H | Splash goggles + gloves + apron + vapor respirator |
| I | Safety glasses + gloves + dust & vapor respirator |
| J | Splash goggles + gloves + apron + dust & vapor respirator |
| K | Air-line hood/mask + gloves + full suit + boots |

> Note: Baseline facility PPE requirements always apply regardless of HMIS code.

---

### Supplier Info
Fills the bottom-right section of the label. All fields are optional but **Company Name**, **Address**, and **Emergency Phone** are required for a fully GHS-compliant label.

| Field | Example |
|---|---|
| Company Name | Rhenus Logistics |
| Address | 123 Warehouse Blvd, Richmond, VA 23220 |
| Emergency Phone | 1-800-424-9300 (CHEMTREC) |
| Prepared By | J. Smith |
| Date | Auto-filled with today's date |

---

## Printing

1. Click **Print / Save as PDF** (red button at the top of the form)
2. In your browser's print dialog:
   - Set paper size to **Letter** and orientation to **Landscape** (for the full label)
   - Set margins to **None**
   - Enable **Background graphics** so colors print correctly
3. Print, or choose **Save as PDF** to get a file

> The sticker (3×4 in) mode prints portrait on a standard sheet — trim to size or print on a compatible label sheet.

---

## Label Size Toggle

Use the **Full (10×7.5in)** / **Sticker (3×4in)** buttons below the print button to switch between label formats. The preview and print output switch together.

---

## Export / Import

The **Export / Import** dropdown (green button) offers three options:

| Option | What it does |
|---|---|
| **Export as JSON** | Saves the current form as a `.json` file you can re-import later |
| **Import from JSON** | Loads a previously exported `.json` file back into the form |
| **Save HTML with Library** | Downloads a self-contained copy of the tool with your entire chemical library baked in — useful for sharing with colleagues who don't have access to the hosted version |

---

## What's on the Label

The printed label includes all six GHS-required elements:

1. **Product Identifier** — chemical name (top banner)
2. **Signal Word** — DANGER or WARNING
3. **GHS Pictograms** — rotating diamond cluster
4. **Hazard & Precautionary Statements** — bottom left
5. **First Aid** — bottom center
6. **Supplier Information** — bottom right

Additionally, the label includes:
- **NFPA 704 diamond** with color-coded quadrants and a built-in rating guide
- **HMIS bars** with PPE code and plain-English equipment requirements
- **GHS Hazards Present** summary line listing all active pictogram names
- **Rating comparison note** explaining NFPA (emergency responders) vs. HMIS (daily workers)

---

## Tips

- **Work from the SDS** — all values (signal word, H/P statements, NFPA/HMIS ratings, pictograms) are found in the SDS for the chemical.
- **Save frequently used chemicals** to the library so you can reload them without re-entering data.
- **Use Google Drive sync** if multiple people need access to the same chemical library.
- **First Aid formatting** — start each line with `Scenario:` (e.g., `If inhaled:`) and it will bold automatically on the label.
- **Clear Form** resets all fields and sets the date to today.

---

## Technical Notes

- Single-file HTML — no frameworks, no dependencies, no server
- All data stays in your browser (localStorage) unless you connect Google Drive
- Works in Chrome, Edge, Firefox, and Safari
- Pictograms are rendered as inline SVG — no external image files needed

---

## GHS Label Requirements Reference

Per OSHA HazCom 2012 (29 CFR 1910.1200), secondary container labels must include:

- Product identifier
- Signal word
- Hazard pictogram(s)
- Hazard statement(s)
- Precautionary statement(s)
- Name, address, and phone number of the responsible party

*This tool is designed to support compliance but does not substitute for reviewing the SDS and confirming accuracy with your safety officer.*
