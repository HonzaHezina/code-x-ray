# Code X-Ray

**Lokální rentgen architektury pro VS Code.** Zobrazuje závislosti mezi soubory TypeScriptu/JavaScriptu, hledá cykly a porušení pravidel a porovnává současný projekt s Git commitem.

Verze **0.1.0 — funkční vývojový základ**. Smyslem je zrychlit orientaci při review AI změn. Mapa ani absence nálezů nejsou důkazem správnosti aplikace.

## Nejrychlejší spuštění

Potřebuješ **VS Code 1.95+**, **Node.js 22 LTS nebo novější** a **Git**. Windows, macOS a Linux; místně ověřeno na Linuxu, CI je připravené pro Linux a Windows.

1. Rozbal ZIP a otevři složku `code-x-ray` ve VS Code.
2. V terminálu spusť:

```sh
npm ci
npm run check
```

3. Stiskni **F5** a vyber **Run Code X-Ray (demo)**. Otevře se druhé okno VS Code s ukázkovým projektem.
4. V levém pruhu otevři **Code X-Ray → Open architecture map**, případně přes `Ctrl+Shift+P` / `Cmd+Shift+P` spusť **Code X-Ray: Open Architecture Map**.
5. Demo má čtyři soubory, pět vazeb, jeden cyklus a jedno porušení hranice UI → databáze. Klikni na nález a jeho důkaz.

Další změny rozšíření sestavíš přes `npm run build` a v testovacím okně použiješ **Developer: Reload Window**. Pro automatické sestavování je `npm run watch`; restart hosta je stále potřeba při změně backendu.

### Instalace bez vývojového hosta

Součástí dodaného ZIPu je `releases/code-x-ray-0.1.0.vsix`. V panelu Extensions zvol `… → Install from VSIX…`. Pro sestavení nového balíčku:

```sh
npm ci
npm run check
npm run package
code --install-extension code-x-ray-0.1.0.vsix
```

VSIX obsahuje sestavený analyzátor i všechny potřebné runtime knihovny. Pro běžnou instalaci není potřeba spouštět `npm ci`; samostatný Node.js je potřeba pro vývoj a CLI. Git je potřeba pro porovnávání. Publisher `code-x-ray-local` je místní identifikátor; před publikováním do Marketplace nastav vlastní registrovaný publisher a adresu repozitáře.

## Co je hotové

- Interaktivní 2D mapa se zoomem, přesouváním uzlů, filtrem souborů a proklikem do zdrojáku.
- Typové a běhové importy, re-exporty, import-equals, literálové `import()` a syntaktické `require()`.
- Rozlišení typových importů; výchozí hledání cyklů je ignoruje.
- TypeScript module resolution včetně `baseUrl` / `paths` podle **kořenového** `tsconfig.json` nebo `jsconfig.json`.
- Cykly (silně souvislé komponenty), zakázané vazby adresářů, vysoký interní fan-out a dlouhé soubory.
- Evidence: soubor, řádek, sloupec, původní specifier importu. Nálezy také v panelu Problems.
- Git snapshot bez přepnutí větve nebo zásahu do pracovního stromu; přidané/odstraněné soubory a vazby, změněný obsah, nové/vyřešené nálezy.
- Přepínání Current / Baseline / Changes overlay. Polohy uzlů zůstávají zachované při obnovování v otevřené mapě.
- Analýza v odděleném workeru, debounce uložených změn, ukončení starého požadavku, časový a paměťový limit.
- Lokální CLI, JSON export, kontrola pravidel v CI, demonstrační projekt, testy a návody pro AI asistenty.
- Žádná telemetrie, síťová služba, AI účet ani spouštění analyzovaného projektu.

## Jak číst mapu

Šipka míří **z importujícího souboru na jeho závislost**. Velikost uzlu odpovídá fyzickým řádkům. Oranžový okraj znamená nález. Při porovnání zelený okraj/vazba znamená přidání, žlutá výplň změněný obsah a růžové přerušované prvky odstranění (v overlay). Přerušované vazby mohou také znamenat typový import; detail vazby vždy ukáže přesný význam.

Vazby různých druhů mezi stejnými soubory jsou samostatné. Fan-in/out počítá **unikátní interní soubory**, nikoli počet importních příkazů. Branch constructs je počet vybraných syntaktických větvení, nikoli certifikovaná cyklomatická složitost.

Kliknutí na současný důkaz otevře uložený soubor. U historického důkazu se zobrazí upozornění a kód je nutné otevřít přes Git historii; rozšíření zatím neposkytuje historický textový editor.

## Porovnání práce AI

1. Začni čistým Gitem a vytvoř commit před změnou.
2. Nech AI upravit projekt, změny ulož.
3. **Compare Git… → HEAD** porovná poslední commit s uloženými soubory včetně nových nesledovaných zdrojových souborů.
4. Vyber **Changes overlay**. Klikni na nové vazby a nálezy.
5. Před přijetím změny stále proveď běžné testy a review významu kódu.

Jestli je AI změna už commitnutá, použij například `HEAD~1` nebo konkrétní commit. `main` znamená přesný strom dané revize; automatický merge-base se nepočítá. Staged i unstaged změny se čtou jako současné soubory na disku. Neuložené editory se nečtou. Přejmenování je zatím odstranění + přidání.

## Pravidla projektu

Do analyzované složky přidej `code-x-ray.config.json`:

```json
{
  "exclude": ["generated", "vendor"],
  "fanOutWarning": 15,
  "largeFileLines": 500,
  "includeTypeOnlyInCycles": false,
  "boundaries": [
    { "name": "UI nesmí sahat do databáze", "from": "src/ui", "disallow": ["src/data"] },
    { "name": "Doména je nezávislá", "from": "src/domain", "disallow": ["src/ui", "src/infrastructure"] }
  ]
}
```

Používají se relativní adresářové prefixy, oddělovač `/`; **žádné globy ani regulární výrazy**. `src/ui` neodpovídá `src/ui-old`. Jednosložkové exclude jako `vendor` platí na každé úrovni. Vestavěné ignorované adresáře se vždy zachovají: `node_modules`, `.git`, `dist`, `build`, `coverage`, `.next`, `.test-build`. `.gitignore` se zatím nevyhodnocuje — další generované složky přidej explicitně. Hranice se kontrolují i pro typové vazby; přepínač typových vazeb v mapě pouze mění zobrazení.

Výchozí limity: 3000 zdrojových souborů, 1 MiB na soubor, 32 MiB zdrojového textu. Stropy konfigurace: 10000 / 5 MiB / 128 MiB. Mapa zobrazuje maximálně 800 odpovídajících souborů; JSON obsahuje všechny analyzované soubory. Nadměrný jednotlivý soubor se přeskočí s upozorněním, překročení celkového limitu analýzu zastaví. Git snapshot má rovněž limity a při nadměrném blobu porovnání odmítne.

## CLI a CI

```sh
npm run build
node dist/cli.cjs examples/demo --out demo-report.json
node dist/cli.cjs /path/to/project --base HEAD --out report.json
node dist/cli.cjs . --fail-on error --out code-x-ray-report.json
```

Bez `--out` jde čistý JSON na stdout. Exit kódy: **0** úspěch, **1** provozní chyba, **2** nález dle `--fail-on error|warning`. Bez tohoto přepínače nálezy návratový kód nemění. Brána hodnotí všechny současné nálezy, nikoli jen nové. CI v `.github/workflows/ci.yml` spustí kontrolu typů, testy, sestavení, pravidla vlastního repa a vytvoří VSIX artefakt.

## Nahrání na GitHub

Vytvoř prázdné repo na GitHubu (bez automatického README) a ve složce projektu:

```sh
git init
git add .
git commit -m "Initial Code X-Ray extension"
git branch -M main
git remote add origin https://github.com/TVUJ_UCET/code-x-ray.git
git push -u origin main
```

Nahraď adresu vlastním repozitářem. ZIP neobsahuje `.git` ani `node_modules`; obsahuje lockfile. `releases/*.vsix` je ignorované, takže do Gitu patří zdrojáky. Instalační balíček můžeš později připojit ke GitHub Release.

## Další vývoj s AI

Začni souborem `START_HERE_CS.md`. Pravidla architektury jsou v `AGENTS.md`, Claude Code najde odkaz také v `CLAUDE.md` a Copilot v `.github/copilot-instructions.md`. `docs/ROADMAP.md` odděluje implementované funkce od plánů a obsahuje akceptační kritéria.

## Známé hranice verze 0.1

- Jde o **graf závislostí souborů**, nikoli úplný call graph, datové toky nebo běhové chování.
- Monorepa s více odlišnými tsconfigy/project references nejsou plně podporována. Otevři konkrétní balíček jako kořen; v multi-root workspace se při prvním otevření vybírá jedna složka.
- Git baseline nemá nainstalované závislosti. `extends` z npm balíčků, workspace balíčky a package resolution mohou mít jiný výsledek; upozornění jsou součástí reportu.
- Literálové `require()` je syntaktická kandidátní vazba; shadowing identifikátoru se neověřuje. Dynamicky sestavené cesty, DI, pluginy, framework magic a runtime call graph se neodhadují.
- `.vue`, `.svelte`, `.astro`, Python, C#, deklarace `.d.ts`, JSON moduly, CSS importy a generovaný kód nejsou analyzované uzly. Jejich importy mohou být označeny jako nevyřešené nebo mimo analyzovanou množinu.
- Současná obnova provádí celý omezený scan v novém workeru; **inkrementální cache zatím není implementovaná**. Stabilní polohy jsou pouze v paměti otevřené mapy.
- Změny závislostí během probíhajícího scanu mohou způsobit chybu nebo nekonzistentní čtení; ulož soubory a obnov mapu po dokončení práce agenta.
- Není tu detekce kopií, change coupling z historie, runtime tracing ani LLM interpretace; viz roadmapa.
- JSON obsahuje názvy cest, specifiery a hashe obsahu, nikoli celý zdroják. Před sdílením report zkontroluj.

Ověření dodaného balíčku a zbývající ruční testy jsou v `docs/VALIDATION.md`.

MIT licence. Bundlované knihovny mají vlastní licence v `THIRD_PARTY_NOTICES.txt`.
