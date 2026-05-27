
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
| A | Safety Glasses |
| B | Safety Glasses + Gloves |
| C | Safety Glasses + Gloves + Apron |
| D | Face Shield + Gloves + Apron |
| E | Safety Glasses + Gloves + Dust Respirator |
| F | Safety Glasses + Gloves + Apron + Dust Respirator |
| G | Safety Glasses + Gloves + Vapor Respirator |
| H | Splash Goggles + Gloves + Apron + Vapor Respirator |
| I | Safety Glasses + Gloves + Dust & Vapor Respirator |
| J | Splash Goggles + Gloves + Apron + Dust & Vapor Respirator |
| K | Air-Line Hood/Mask + Gloves + Full Suit + Boots |

**Additional PPE** — Automatically computed from the selected HMIS code by removing baseline facility PPE (safety glasses, gloves) that all employees already wear. This appears in the sticker footer and the GHS Hazards Present bar on the full label. Can be manually overridden if needed.

> Baseline facility PPE requirements always apply regardless of HMIS code.

---

### Supplier Info

Fills the bottom-right section of the label. All fields are optional but **Company Name**, **Address**, and **Emergency Phone** are required for a fully GHS-compliant label.

| Field | Example |
|---|---|
| **Company Logo** | Upload an image (PNG, JPG, SVG) — appears top-right on the full label and bottom-left on the sticker |
| Company Name | Rhenus Logistics |
| Address | 123 Warehouse Blvd, Richmond, VA 23220 |
| Emergency Phone | 1-800-424-9300 (CHEMTREC) |
| Prepared By | J. Smith |
| Date | Auto-filled with today's date |

The logo is stored in your browser's local storage and persists between sessions.

---

## Printing

1. Click **Print / Save as PDF** (red button at the top of the form)
2. In your browser's print dialog:
   - Set paper size to **Letter** and orientation to **Landscape** (for the full label)
   - Set margins to **None**
   - Enable **Background graphics** so colors print correctly
3. Print, or choose **Save as PDF** to get a file

> The sticker (3×4 in) mode prints portrait. The Sheet mode arranges four stickers on a single letter-size sheet for cutting.

---

## Label Size Toggle

Use the buttons below the print button to switch between formats:

| Button | Format |
|---|---|
| **Full (10×7.5in)** | Full-size landscape label |
| **Sticker (3×4in)** | Single sticker, portrait |
| **Sheet 4×** | Sub-option under Sticker — four stickers on one letter sheet, scaled for cutting |

The preview and print output switch together.

---

## Export / Import

The **Export / Import** dropdown (green button) offers four options:

| Option | What it does |
|---|---|
| **Export label as JSON** | Saves the current form as a `.json` file you can re-import later |
| **Import label from JSON** | Loads a previously exported label `.json` back into the form |
| **Export full library** | Saves your entire chemical library as a `.json` file. Prompts for your name and auto-includes the export date in the filename. |
| **Import into library** | Merges a library `.json` into your current library — skips any chemical whose name already exists |

---

## What's on the Label

The printed label includes all six GHS-required elements:

1. **Product Identifier** — chemical name (top banner, auto-sizing)
2. **Signal Word** — DANGER or WARNING
3. **GHS Pictograms** — rotating diamond cluster
4. **Hazard & Precautionary Statements** — bottom left, two-column layout
5. **First Aid** — bottom center
6. **Supplier Information** — bottom right (including company logo if uploaded)

Additionally, the label includes:
- **NFPA 704 diamond** with color-coded quadrants and a built-in 0–4 rating guide
- **HMIS bars** with PPE code and plain-English equipment requirements
- **GHS Hazards Present** bar listing all active pictogram names, with Additional PPE Required on the right
- **Emergency reference bar** — Call 911 · Poison Control 1-800-222-1222 · CHEMTREC 1-800-424-9300

---

## Tips

- **Work from the SDS** — all values (signal word, H/P statements, NFPA/HMIS ratings, pictograms) are found in the SDS for the chemical.
- **Save frequently used chemicals** to the library so you can reload them without re-entering data. Type in the search box to filter quickly.
- **Use Google Drive sync** if multiple people need access to the same chemical library.
- **First Aid formatting** — start each line with `Scenario:` (e.g., `If inhaled:`) and it will bold automatically on the label.
- **Additional PPE** — leave the field blank to auto-compute from the HMIS code, or type your own value to override.
- **Clear Form** resets all fields and sets the date to today.

---

## Technical Notes

- Single-file HTML — no frameworks, no dependencies, no server
- All data stays in your browser (localStorage) unless you connect Google Drive
- Works in Chrome, Edge, Firefox, and Safari
- Pictograms are rendered as inline SVG — no external image files needed
- The browser uses the product name as the suggested filename when saving as PDF

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
