# AI Ultra MusicFES — Art Direction & Design Audit (`DESIGN_LOG`)

Following `RNA4219/anything-frontend-art-direction` (`references/visual-direction.md`, `references/visual-composition.md`, `references/visual-craft.md`) and `RNA4219/motion-atlas`.

## 1. Subject, Role & Decision Goal

- **Subject**: **AI ULTRA MUSICFES 2026 — 響鳴電脳祭** (`東京湾岸特設ドーム`, 2026.11.23–24 JST). Four distinct stages (`01 響 KYŌ · Relay Gate`, `02 鳴 MEI · Kiln 303`, `03 電 DEN · Tidal Glass`, `04 脳 NŌ · Last Train`) plus festival-wide `祭 SAI` overview and 2-day timetable.
- **Visitor Judgment**: Arrive on the festival poster, immediately read event identity, dates, venue, and the active headliner; switch stages directly via the monumental vertical kanji title (`響鳴電脳祭`); trigger real YuE2 audio + interactive sound console (`暗転` blackout transition from daylight poster to stage lighting); build a personal timetable schedule and mint an offline Backstage Press Pass.

## 2. Primary References Inspected (Separating Maker Intent vs. Direct Observation)

All seven primary reference captures are stored locally in `research/refs/` (`capture-log.json`, HTTP 200 across all 7 captures).

| Work | Maker Stated Intent (from primary docs / skill ledger) | Direct Visual Observation (`research/refs/*`) | Adoption / Rejection Condition |
|---|---|---|---|
| **DEAD AIR FM** (`dead-air-fm.webp`, RNA4219) | Pirate radio station built with `anything-frontend-art-direction` + `Motion Atlas`; dark ground, illustration-extracted pink & cyan, YuE2 station switcher, self-contained HTML. | Deep indigo ground (`#13012C`), skewed heavy italic `DEAD AIR FM`, clipped cyan CTA, glowing pink cable mask on anime DJ, crisp light-paper ticker strip (`NOW ON AIR`) separating hero from station waveform list. | **Adopt**: real self-contained offline asset budget (WOFF2 + WebP + PNG mask + M4A), pixel-locked cable/gear light mask, zero decorative clutter. **Invert**: avoid another dark-ground + neon pink/cyan sequel by adopting Paper/Sumi print ground by day + `暗転` blackout on play. |
| **潮待ち映画祭** (`shiomachi-film.png`, RNA4219) | Harbor outdoor film festival pairing bold Shippori Mincho B1 with Cormorant Garamond italic and Noto Sans JP timetable. | High-contrast harbor evening photo above warm off-white program band (`#F3EEE3`-adjacent), generous whitespace, terracotta schedule action button. | **Adopt**: warm paper program register and strict separation between expressive display heading and tabular schedule copy. |
| **North Sea Jazz Identity** (`north-sea-jazz.png`, Studio Dumbar) | Modular kinetic typography moved by code (`ABC Gravity` / `ABC Monument Grotesk`) representing diverse jazz performance across motion and print. | Massive cropped cyan & chartreuse letterforms (`NORTH` / `SEA`) bisected by razor-sharp angled louver cuts (`venetian-blinds` DNA) on stark black ground. | **Adopt**: sharp angled slit/blinds motion during stage transitions (`mekuri` flip) rather than blurry fades. |
| **Seoul Performing Arts Festival 2023** (`spaf-2023.png`, WORKS / Hailey Lee) | Moving frames and ambiguous borders combining bold typography with photography and flat red/blue ink plates (`Borderless Questions`). | Twin poster variants alternating flat cobalt blue and vermilion red plates behind giant heavy `SPAF 2023` lettering with performer + mechanical sound horn overlapping the field. | **Adopt**: direct precedent for single-ink poster switching (`朱` / `翡翠` / `雷黄` / `瑠璃`) where performer + machine/gear cross large display type (`袋文字`). |
| **PARCO GAME CENTER** (`parco-game-center.png`, KID ROSE) | Dense graphic title art as centerpiece paired with clean ticker bar and framed schedule blocks. | Tight crimson ticker marquee separated cleanly from dense poster center and crisp rectangular ticket/schedule panels. | **Adopt**: single plain 60px transport/ticker band separating the poster artwork from operational festival telemetry. |
| **J-WAVE 81.3FM** (`j-wave.png`, Takram) | Bold cohesive wordmark variants spanning monochrome print, badges, and broadcast goods. | Crisp neutral stationery/badge photography grounding strong geometric emblem and yellow accent wordmark. | **Adopt**: single typographic spine uniting stage selector, press pass badge, and print colophon. |
| **Public Theater 1995–96** (`public-theater.png`, Paula Scher / Pentagram) | Street-poster wood-type typography carrying both single-show posters and multi-show festival schedules under one loud typographic system. | Ultra-heavy condensed `PUBLIC.` block lockup with `THE` set vertically inside the stem gap, high-contrast black ink on clean white editorial grid. | **Adopt**: one unified poster grid serving individual acts (`響鳴電脳`) and the multi-act schedule (`祭`). |

## 3. Two-Direction & Two-Typography Proof Results (`proofs/`)

Rendered and inspected at both `1440×900` (`proofs/proof-desktop.png`) and `320×640` (`proofs/proof-mobile-320.png`) with `proofs/font-metrics.json` verification.

### Direction A (`刷` Poster-as-Interface) vs. Direction B (`送` Broadcast Multiviewer)
- **Direction B (`送`)**: Dark 12-column broadcast control room with tally lamps, 4 source tiles, and multi-panel numeric readouts. Visually reads as a stopped telemetry dashboard when motion is paused (`MOTION OFF`) and drifts close to `DEAD AIR FM`'s dark broadcast aesthetic.
- **Direction A (`刷` + `暗転` + 60px Transport Band from B) — SELECTED**:
  - Daylight state uses warm paper (`#F3EEE3`), sumi ink (`#15120F`, `16.13:1` contrast), and one dedicated pigment ink + halftone screen angle per stage (`朱 15°`, `雷黄 0°`, `翡翠 75°`, `瑠璃 45°`).
  - Starting playback triggers **`暗転` (Blackout)**, dropping into stage hall darkness (`#1C0E0A`, `#16130A`, `#07130F`, `#090C1F`) so the pixel-locked 3-channel emissive character light masks (`CFFF46`, `FFAC32`, `71E0CE`, `8496FF`) ignite against the dark hall while maintaining `6.68:1`–`14.25:1` ink contrast.
  - Even with `MOTION OFF`, the page stands as a finished Japanese concert poster (`番付` / `幟` / `めくり`).

### Typography Pairing α (`太鼓`) vs. Pairing β (`拍子木`)
- **Pairing α (`Dela Gothic One` + `Archivo` variable [wdth 62–125, wght 100–900] + `M PLUS 1 Code` variable) — SELECTED**:
  - **Measured counter floor on `響` at `320px` (`proof-mobile-320.png`)**: In a `64px` vertical rail at `48px`–`56px` glyph size, every horizontal stroke counter inside `響` remains crisp and legible on both `#F3EEE3` Day paper and `#1C0E0A` Night hall. At `32px`, horizontal bars inside `音` begin plugging; therefore mobile CSS enforces rail width `>= 64px` and glyph size `>= 48px`.
  - **Width-axis headline justification (`palt` off)**: `AI ULTRA` (`wdth 71.4`), `MUSICFES` (`wdth 62`), `2026` (`wdth 125`) lock cleanly to the exact measure without tracking distortion; `ドーム` uses explicit manual kerning spans.
  - **Pairing β rejected**: `Zen Old Mincho Black` hairlines thin dramatically on halftone ink plates and require embedding 4 font families instead of 3.

## 4. Character Art Rig, Cutout QA & Verified WCAG Luminance Table

- All 4 original headliners (`stage-01.webp`..`stage-04.webp`, `1000×1250`, total `433.6 KB`) were matted cleanly against `#E6E2D8`, eye-line locked at `y = 0.20` (`qa-cutouts.png`), and paired with pixel-locked 3-channel RGB emissive masks (`mask-01.png`..`mask-04.png`, total `218.8 KB`; `qa-masks.png`).

| Stage | Kanji / Code | Character | Day Plate Ink (`L_rel`) | Plate Text Contrast | Night Hall Bg → Light | Night Light Contrast | Screen Angle / Kind |
|---|---|---|---|---|---|---|---|
| `01 relay` | `響 KYŌ` | 火花ナナ / Hibana Nana | `#EE4B2B` (`0.2338`) | Sumi `#15120F` (`5.04:1`) | `#1C0E0A` → `#FF6B4A` | `6.68:1` | `15°` dot |
| `02 kiln` | `鳴 MEI` | 鋳田 玄 / Ida Gen | `#F6D30C` (`0.6621`) | Sumi `#15120F` (`12.66:1`) | `#16130A` → `#FFE14D` | `14.25:1` | `0°` cross |
| `03 tidal` | `電 DEN` | 汐見 澪 / Shiomi Mio | `#17B890` (`0.3648`) | Sumi `#15120F` (`7.37:1`) | `#07130F` → `#3FE3B8` | `11.62:1` | `75°` line |
| `04 lasttrain` | `脳 NŌ` | 夜行 律 / Yakō Ritsu | `#2337C6` (`0.0717`) | Paper `#F3EEE3` (`7.46:1`) | `#090C1F` → `#8496FF` | `7.18:1` | `45°` square |
| `ALL` | `祭 SAI` | Festival Overview | Paper `#F3EEE3` / Sumi `#15120F` | `16.13:1` | `#121110` → `#F3EEE3` | `16.30:1` | Composite |

All plates sit strictly outside the banned mid-luminance zone (`L_rel >= 0.203` for sumi ink or `<= 0.152` for paper ink) and carry `1px` keylines so low-paper-contrast yellow/emerald plates remain cleanly bounded.

## 5. Detail-Strip Decisions (`細部に題材を宿す`)

1. **`題字が選局` (Title as Tuner)**: Stripping away interactive kanji turns the hero rail back into generic navigation tabs. Kept.
2. **`拍が単位` (Beat as Clock Unit)**: Driving CSS hover/wipe durations from `--beat: calc(60s / var(--bpm))` and quantizing transitions + Earshot clicks to the groove ties UI tactile feel directly to tempo. Kept.
3. **`四版四角度` (Four Plates, Four Angles)**: Overlapping two stage halftone angles for 1 beat during a `venetian-blinds` wipe creates authentic risograph moiré rather than a generic color fade. Kept.
4. **`校正刷り` (Live Printer's Proof Sheet)**: Registration marks (`トンボ`), live computed WCAG contrast swatches, rendered font `measureText` stamp, and obi colophon keep technical craft verifiable on the page itself. Kept.
5. **`ピンスポット` (Follow-Spot Focus)**: Keyboard focus pool (`:focus-visible` double ring + subtle traveling follow-spot disc) rewards keyboard navigation as theatrical stage lighting. Kept.
