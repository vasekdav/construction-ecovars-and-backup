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
