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

## Doporučené pořadí další práce

1. Ověření rozšíření ve skutečném VS Code na tvém počítači a projektu.
2. Historické důkazy otevírat ve virtuálním dokumentu konkrétního commitu.
3. Robustní práce s monorepy a více tsconfigy.
4. Inkrementální přepočet + trvalé polohy mapy.
5. Zkusit vizualizaci na reálném AI pull requestu a změřit, zda zrychlila nalezení problému.

Dokud tyto věci nejsou dotažené, nedává smysl přidávat mnoho dalších jazyků a AI skóre.
