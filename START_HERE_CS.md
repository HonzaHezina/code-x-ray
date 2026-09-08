# Začni tady

Repo je připravené jako rozšíření VS Code, CLI a oddělené analytické jádro. Nejde jen o návrh nebo prázdnou kostru.

## První spuštění

1. Otevři **tuto složku** ve VS Code.
2. `npm ci`
3. `npm run check`
4. F5 → **Run Code X-Ray (demo)**.
5. V druhém okně `Code X-Ray: Open Architecture Map`.

Pro běžné použití nainstaluj `releases/code-x-ray-0.1.0.vsix` přes **Extensions → … → Install from VSIX…** a otevři vlastní TypeScript/JavaScript projekt.

## Co poslat AI asistentovi

Zkopíruj tento text do Claude Code, Copilota nebo dalšího asistenta:

> Pracujeme na Code X-Ray — lokálním rozšíření VS Code pro vizuální review architektury, zejména změn vytvořených AI. Nejdřív přečti AGENTS.md, README.md, docs/ARCHITECTURE.md, docs/VALIDATION.md a docs/ROADMAP.md. Zkontroluj git status a spusť npm ci a npm run check. Zachovej oddělení src/core, src/extension a src/webview. Nezaměňuj importní graf za call graph a nevymýšlej neexistující vazby. Jako první úkol ověř skutečný Extension Development Host přes F5: demo má 4 soubory, 5 závislostí, jeden cyklus a jedno porušení hranice. Ověř proklik evidence, Problems, automatickou obnovu a Git overlay. Případné chyby oprav a aktualizuj VALIDATION.md. Pak navrhni jeden konkrétní další krok z roadmapy s akceptačními kritérii. Žádné plošné přepisování, cloud, telemetrie ani LLM API bez zadání.

## Stav k 2026-09-08

Proběhla rozsáhlá konverzace, jejíž výstupy jsou zapsané v dokumentaci — než budeš pokračovat, přečti si:

- `docs/VALIDATION.md`, sekce **"2026-09-08 Windows automated pass"** — `npm ci`/`npm run check`/self-analýza/demo prošly na Windows, ale **ruční GUI checklist** (proklik evidence, Problems panel, reload, Compare Git overlay, rychlé ukládání, téma) ještě nikdo neprošel a je potřeba ho udělat a zapsat výsledek.
- `docs/ROADMAP.md`, sekce **"2026-09-08 UI/ergonomics addendum"** — webview dostal sadu vylepšení (souhrnné karty, stavový odznak, ikony nálezů, animace/hover, skutečný focus mode, izolace souboru, status bar indikátor, export PNG, Copy summary, Copy as Mermaid). Bez nové závislosti, vše pokryté `npm run check`.
- `docs/ARCHITECTURE.md`, sekce **"Positioning relative to existing tools"** — rešerše konkurence (dependency-cruiser, Madge, CodeSee, Sourcetrail, CodeViz.ai, Revieko). Závěr: P2 body (SARIF, duplicitní detekce) mají nižší prioritu, protože je už zdarma řeší dependency-cruiser; energie patří do P1 vizuální ergonomiky, protože to je skutečně odlišená část projektu.

## Doporučené pořadí další práce

1. **Dokončit P0** — projít ruční GUI checklist z `docs/VALIDATION.md` (proklik, Problems, reload, Compare Git, rychlé ukládání, téma) a zapsat výsledek. Automatizovaná část už prošla na Windows i Linuxu.
2. Zbytek P1 vizuální ergonomiky: trvalé polohy mapy napříč restarty (dnes přežívají jen v rámci otevřené session), viditelné hranice adresářových skupin na plátně, případně hierarchický layout jako alternativa k pevné mřížce a collapse adresářů pro větší projekty.
3. Historické důkazy otevírat ve virtuálním dokumentu konkrétního commitu.
4. Robustní práce s monorepy a více tsconfigy.
5. Inkrementální přepočet.
6. Zkusit vizualizaci na reálném AI pull requestu a změřit, zda zrychlila nalezení problému — teď o to důležitější, protože konkurence (CodeViz, Revieko) cílí na stejný use case placeně přes cloud; tohle je jediný způsob, jak ověřit, že lokální/zdarma varianta reálně vyhrává na konkrétním workflow, ne jen na papíře.

Dokud tyto věci nejsou dotažené, nedává smysl přidávat mnoho dalších jazyků a AI skóre.
