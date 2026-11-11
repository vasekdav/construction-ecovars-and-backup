# Backup Station Project Hub

Webová aplikace pro řízení projektů záložních stanic O₂ / N₂ (LOX/LIN zásobník + atmosférický odpařovač) ve spolupráci rolí OAM a OPS.

> **Podpora rozhodování, nenahrazuje inženýrské schválení.**
> V1 obsahuje **pouze fiktivní data**. Neukládejte důvěrná data Linde ani zákazníků (viz `docs/SPEC.md` §10).

- Zadání: [`docs/SPEC.md`](docs/SPEC.md)
- Plán a stav fází: [`docs/PLAN.md`](docs/PLAN.md)
- Otevřené otázky: [`docs/OPEN_QUESTIONS.md`](docs/OPEN_QUESTIONS.md)
- Rozhodnutí (ADR): [`docs/DECISIONS.md`](docs/DECISIONS.md)
- Changelog: [`CHANGELOG.md`](CHANGELOG.md)
- Akceptační kritéria v1: [`docs/ACCEPTANCE.md`](docs/ACCEPTANCE.md)

## Požadavky
- Node.js 22+
- PostgreSQL 16 (lokálně nebo v Dockeru)

## Lokální spuštění

1. Instalace závislostí:
   ```bash
   npm install
   ```
2. Databáze (příklad pro Docker):
   ```bash
   docker run -d --name hub-db -e POSTGRES_USER=hub -e POSTGRES_PASSWORD=hub -e POSTGRES_DB=hub_dev -p 5432:5432 postgres:16
   ```
3. Proměnné prostředí: zkopírujte `.env.example` do `.env.local` a doplňte `NEXTAUTH_SECRET` (`openssl rand -base64 32`) a `SEED_DEMO_PASSWORD` (min. 12 znaků).
4. Migrace a demo data (skripty čtou proměnné z prostředí):
   ```bash
   set -a && . ./.env.local && set +a && npm run db:migrate && npm run db:seed
   ```
5. Vývojový server:
   ```bash
   npm run dev
   ```
   Přihlášení: `admin@demo.local` (nebo `oam@`, `ops@`, `investment@`, `roc@`, `safety@`, `sizing@demo.local`) s heslem ze `SEED_DEMO_PASSWORD`.

## Testy

| Příkaz | Co dělá |
|---|---|
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript (strict) |
| `npm test` | Vitest: unit testy; integrační testy proti Postgresu, pokud je nastaveno `TEST_DATABASE_URL` |
| `npm run test:coverage` | totéž s pokrytím a prahy |
| `npm run db:sync-rules` | import nových pravidel z `data/rules` a kandidátních standardů (bezpečné i v produkci, neobsahuje hodnoty parametrů) |
| `npm run test:e2e` | Playwright; vyžaduje předchozí `npm run build`, migrovanou a naseedovanou DB a proměnné prostředí |

Integrační testy používají vlastní databázi (`TEST_DATABASE_URL`) a migrace na ni aplikují samy.

## Struktura

```
app/            Next.js routes (stránky, server actions, API)
components/     UI komponenty
lib/            doménová logika (auth, RBAC, audit, uživatelé; později rules, units, calc)
db/             Drizzle schéma, SQL migrace, seed
data/           startovní pravidla a šablona dotazníku (JSON, od fáze 2/3)
messages/       překlady cs/en
docs/           SPEC, plán, otevřené otázky, ADR, akceptační kritéria
assets/fonts/   DejaVu Sans pro PDF export (licence v adresáři)
tests/          unit, integration, e2e
```

## Nasazení (Vercel + Neon)

Repo je napojené na Vercel; každý push na `main` se nasadí do produkce a každý PR dostane preview.
Build na Vercelu (`npm run vercel-build`, viz `vercel.json`) při každém nasazení sám připraví databázi:
migrace, import pravidel / standardů / parametrů výpočtu (DRAFT, bez hodnot) a, je-li nastaveno
`SEED_DEMO_PASSWORD`, fiktivní demo účty. Všechny kroky jsou opakovatelné (nic nepřepíšou).

Jednorázové nastavení ve Vercelu:
1. **Storage → Create Database → Neon**, připojit k projektu (Production + Preview). Nastaví `DATABASE_URL` a `DATABASE_URL_UNPOOLED`.
2. **Settings → Environment Variables:**
   - `NEXTAUTH_SECRET`: náhodný řetězec, např. `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`
   - `SEED_DEMO_PASSWORD`: heslo pro demo účty (`admin@demo.local` …), min. 12 znaků. Po založení vlastních účtů lze proměnnou smazat.
   - `NEXTAUTH_URL` **není potřeba**, adresu si NextAuth na Vercelu zjistí sám.
3. **Deployments → Redeploy** (nebo merge do `main`).
