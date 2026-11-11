# Otevřené otázky

Do zodpovězení aplikace pracuje s nejbezpečnějším předpokladem (sloupec „Předpoklad“).

| # | Otázka | Zdroj | Předpoklad do odpovědi |
|---|---|---|---|
| 1 | Rozvedení zkratky **OAM** a přesná dělba OAM vs OPS u jednotlivých kroků. | SPEC §13 | Zkratka se zobrazuje tak, jak je; vlastníci kroků podle tabulky v SPEC §3. |
| 2 | Co je **CES P&ID** (standardní P&ID kterého typu stanice)? | SPEC §13 | Veden jako jeden z povinných odkazů kroku 2 bez dalšího výkladu. |
| 3 | Potvrzení závislostí kroků a zda HAZID/HAZOP, O₂ cleaning, FAT/SAT a handover mají být povinné. | SPEC §13 | Závislosti potvrzeny (2026-11-11). Kroky navíc jsou v šabloně, výchozí stav vypnuto. |
| 4 | Kdo je u Linde **vlastníkem tabulek bezpečných vzdáleností a limitů rychlostí** a kdo schvaluje stav `VERIFIED`? | SPEC §13 | `VERIFIED` smí nastavit jen role Process Safety. Bez hodnot → `NEVYHODNOCENO`. |
| 5 | Souhlas IT / InfoSec s hostováním na Vercelu pro reálná data (umístění dat, přístupy, logování). | SPEC §10, §13 | **Žádná reálná data.** Pouze fiktivní seed a odkazy; ceny se neukládají. |
| 6 | Přístup k aktuální revizi AAE sizing nástroje a formát předání výsledku. | SPEC §13 | Ruční zadání výsledku se zdrojem (soubor, revize, autor, datum). |
| 7 | Má aplikace v budoucnu pokrývat i Minigan a PSA zálohy? | SPEC §13 | Ne, jen jako reference v kroku 2. |
| 8 | Gate kroku 5 vyžaduje, aby všechna pravidla byla `VERIFIED`. Startovní pravidla jsou `DRAFT`, takže demo projekt se na kroku 5 zastaví (a s ním kroky 8, 3, 9, 6, 10). Je to žádoucí? | Plán | Ano, chování odpovídá SPEC. E2E testy ověřují pravidla ve fixturách. |
| 9 | SPEC uvádí kontroly v krocích 5, 8 a 9. P&ID pravidla (PSV, O₂ cleaning, materiály, řízení) logicky patří ke kroku 4. Souhlas s mapováním v `docs/DECISIONS.md` ADR-010? | Plán | Mapování podle ADR-010, konfigurovatelné v datech pravidla. |
| 10 | Kdo smí zakládat a upravovat pravidla: Admin, Process Safety, nebo oba? | Plán | Oba smí upravovat (`rule.manage`), úprava vrací pravidlo do `DRAFT`; `VERIFIED` jen Process Safety. |
| 11 | Definice „normálních podmínek“ pro Nm³ (teplota a tlak) v kontextu Linde. | SPEC §6 | Parametr `TBD-VERIFY` bez výchozí hodnoty. |
| 12 | Mají být role globální, nebo přiřazené per projekt (např. OPS jen na svých projektech)? | SPEC §2, §4 | v1: globální role. Schéma připraví volitelné `project_id` ve fázi 1. |
| 13 | Kdo smí číst globální audit log? | Plán | Admin a Process Safety. Historie projektu bude viditelná všem rolím s přístupem k projektu. |
| 14 | Kdy a pod jakým účtem připojit Vercel + Neon? | Plán | Do připojení: lokálně + CI. |
| 15 | Gate kroku 6 „vlastník údržby jmenován“: stačí jako „odpovědná osoba kroku“ v nastavení kroku? | Fáze 1 | Ano, podmínka `ownerAssigned`. |
| 16 | Gate kroku 4 „všechny připomínky uzavřeny“: evidovat připomínky k P&ID jako úkoly kroku? | Fáze 1 | Ano, podmínka `allTasksDone`. |
| 17 | Má Admin smět provádět procesní akce (např. za nepřítomného OAM)? | Fáze 1 | Ne (ADR-016). Admin může přidat roli OAM jinému uživateli. |
| 18 | Má znovuotevření uzavřeného kroku automaticky znovu otevřít i navazující uzavřené kroky? | Fáze 1 | Ne, jen se zaloguje. Navazující kroky zůstávají uzavřené. |
| 19 | Zařazení kroků navíc do grafu závislostí (ADR-018). | Fáze 1 | Podle ADR-018. |
| 20 | Kdo smí zakládat projekty? SPEC: OAM. Teď smí i Admin, ale vlastníkem musí být uživatel s rolí OAM. | Fáze 1 | Ponecháno. |
| 21 | Obsah dotazníku (otázky, povinnost, fáze počáteční / detailní, výběrové možnosti) je návrh a potřebuje revizi s OAM. | Fáze 2 | Návrh podle SPEC §5. |
| 22 | Audit log ukládá změněné odpovědi dotazníku (před/po). Je to v pořádku pro reálná data (InfoSec)? | Fáze 2 | Ano pro fiktivní data ve v1. Před reálnými daty znovu posoudit. |
| 23 | Jak převádět běžící projekty na novou verzi šablony procesu nebo dotazníku? | Fáze 2 | Projekt zůstává na své verzi. Migraci řešit při první změně šablony. |
| 24 | R-O2-03: limit rychlosti v O₂ potrubí závisí na tlaku a materiálu. Stačí jedna hodnota na médium, nebo je potřeba tabulka (tlak × materiál)? | Fáze 3 | Jedna hodnota na médium; tabulka je rozšíření. |
| 25 | Má WARNING před uzavřením kroku vyžadovat výslovné posouzení člověkem (potvrzení), nebo stačí zobrazení? | Fáze 3 | WARNING neblokuje, jen se zobrazuje. |
| 26 | Pravidla layoutu blokují jen krok 9; krok 3 (koncept) vyžaduje jen vyplněné rozměry. Souhlas? | Fáze 3 | Ano (ADR-028). |
| 27 | Je seznam standardů společný pro všechny projekty, nebo se má pro každý projekt vybírat? | Fáze 3 | Společný, filtrovaný podle média. |
| 28 | Položky návrhového checklistu (ano/ne) potvrzuje kdokoli s procesní rolí. Mají vybrané položky (např. O₂ cleaning) potvrzovat jen konkrétní role? | Fáze 3 | Zatím kterákoli procesní role, s auditní stopou. |
| 29 | Override je vázaný na verzi pravidla: nová verze (i pouhá oprava citace) zneplatní overridy ve všech projektech. Je to žádoucí? | Fáze 3 | Ano, konzervativní varianta. |
| 30 | Je mapování zdrojů na pravidla, kde SPEC normu výslovně neuvádí (označeno „kandidát“), správné? | Fáze 3 | Kandidáti, kapitola TBD-VERIFY; rozhodne Process Safety. |
| 31 | Mají být parametry výpočtu autonomie závislé jen na médiu, nebo i na tlaku zásobníku (hustota kapaliny se s tlakem mění)? | Fáze 4 | Jen na médiu (jedna hodnota pro O₂ a jedna pro N₂). |
| 32 | Má se autonomie počítat i ve stavu DRAFT parametrů (s viditelným označením), nebo až po VERIFIED? | Fáze 4 | Počítá se i v DRAFT, s označením; krok 5 vyžaduje VERIFIED (ADR-030). |
| 33 | Formát předání výsledku AAE nástroje: stačí ruční formulář, nebo import z Excelu (fáze 6)? | Fáze 4 | Ruční formulář se zdrojem a revizí. |
