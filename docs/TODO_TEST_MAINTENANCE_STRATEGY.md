# TODO : Stratégie de maintenance des tests

## Introduction

Ce document détaille une stratégie complète pour maintenir la cohérence entre le code et les tests dans OpenStride. L'objectif est de garantir que :

1. **L'état des tests est toujours connu** - Nous savons quels tests existent, ce qu'ils couvrent, et leur statut
2. **La cohérence code-tests est vérifiée** - Les modifications de code déclenchent automatiquement des vérifications sur les tests associés
3. **La qualité est maintenue** - Les seuils de couverture sont respectés et les régressions sont détectées rapidement

**Statut** : À implémenter (pas urgent, documentation de référence)

## État actuel de l'infrastructure de tests

### Ce qui existe déjà ✅

**Tests unitaires (Vitest)**
- 22 fichiers de tests (3,704 lignes de code)
- Configuration coverage définie : 60% lines/statements/functions, 50% branches
- Test fixtures et factories bien organisés
- Documentation complète : `TESTING_BEST_PRACTICES.md` (540 lignes)

**Tests E2E (Cypress)**
- 2 fichiers de tests (couverture minimale)
- Configuration de base fonctionnelle

**Scripts disponibles**
```bash
npm run test:unit              # Exécuter tous les tests unitaires
npm run test:unit:coverage     # Avec rapport de couverture
npm run test:e2e              # Tests E2E
```

### Ce qui manque ❌

**Automation**
- Pas de CI/CD (GitHub Actions)
- Pas de pre-commit hooks (Husky)
- Pas de validation automatique avant commit

**Tracking**
- Pas de mapping formel test → code
- Pas de détection automatique des "tests orphelins" (code supprimé, test toujours présent)
- Pas de détection des "fichiers non testés" (code ajouté sans tests)

**Enforcement**
- Couverture globale seulement (pas de seuils par fichier)
- Pas de blocage automatique sur régression de couverture

## Solution proposée : Architecture complète

### 1. Test Mapping System

**Fichier** : `.test-map.json` (généré automatiquement)

**Structure** :
```json
{
  "version": "1.0.0",
  "generated": "2026-01-21T10:30:00Z",
  "mappings": {
    "src/services/ActivityService.ts": {
      "tests": ["tests/unit/ActivityService.spec.ts"],
      "lastModified": "2026-01-15T14:20:00Z",
      "coverage": {
        "lines": 85.2,
        "statements": 86.1,
        "functions": 90.0,
        "branches": 75.3
      }
    },
    "src/services/SyncService.ts": {
      "tests": ["tests/unit/SyncService.spec.ts"],
      "lastModified": "2026-01-18T09:15:00Z",
      "coverage": {
        "lines": 100,
        "statements": 100,
        "functions": 100,
        "branches": 100
      }
    }
  },
  "orphanTests": [],
  "untestedFiles": []
}
```

**Génération** : Script automatique qui analyse :
- Les imports dans les fichiers de test (`from '@/services/...'`)
- Les dates de modification Git (`git log`)
- Les rapports de couverture Vitest

**Utilisation** :
- Validation pre-commit (détecter code modifié sans test mis à jour)
- Dashboard de couverture (visualiser l'état global)
- CI/CD (bloquer si fichiers non testés)

### 2. Pre-commit Hooks (Husky + lint-staged)

**Installation** :
```bash
npm install --save-dev husky lint-staged
npx husky init
```

**Configuration** : `.husky/pre-commit`
```bash
#!/usr/bin/env sh
. "$(dirname -- "$0")/_/husky.sh"

# Vérifier le mapping test-code
node scripts/validate-test-map.js

# Linter les fichiers modifiés
npx lint-staged

# Exécuter les tests impactés
npm run test:unit -- --changed
```

**Fichier** : `package.json` (ajout section)
```json
{
  "lint-staged": {
    "src/**/*.{ts,vue}": [
      "eslint --fix",
      "npm run test:unit -- --related"
    ],
    "tests/**/*.spec.ts": [
      "eslint --fix"
    ]
  }
}
```

**Comportement** :
1. Avant chaque commit, Husky exécute le hook
2. `validate-test-map.js` vérifie si fichiers modifiés ont tests associés
3. Si code source modifié sans test mis à jour → avertissement (ou blocage)
4. `lint-staged` applique ESLint uniquement sur fichiers modifiés
5. Tests des fichiers impactés sont exécutés

### 3. CI/CD Pipeline (GitHub Actions)

**Fichier** : `.github/workflows/test.yml`

```yaml
name: Tests

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main, develop]

jobs:
  test:
    name: Tests (Node ${{ matrix.node }} - ${{ matrix.os }})
    runs-on: ${{ matrix.os }}

    strategy:
      matrix:
        os: [ubuntu-latest, windows-latest]
        node: [18, 20]

    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0  # Pour git log dans validate-test-map

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node }}
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Validate test mapping
        run: node scripts/validate-test-map.js --strict

      - name: Run unit tests
        run: npm run test:unit:coverage

      - name: Check coverage thresholds
        run: node scripts/check-coverage.js

      - name: Upload coverage to Codecov
        uses: codecov/codecov-action@v4
        with:
          file: ./coverage/coverage-final.json
          flags: unittests

      - name: Run E2E tests
        run: npm run test:e2e
        if: matrix.os == 'ubuntu-latest' && matrix.node == '20'

  test-map-report:
    name: Generate Test Map Report
    runs-on: ubuntu-latest
    needs: test

    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20

      - name: Generate test map
        run: node scripts/generate-test-map.js

      - name: Upload test map artifact
        uses: actions/upload-artifact@v4
        with:
          name: test-map
          path: .test-map.json
```

**Features** :
- Matrix testing : Node 18/20 × Ubuntu/Windows
- Validation stricte du mapping (bloque si fichiers non testés)
- Upload coverage vers Codecov
- Génération d'artefact `.test-map.json` pour analyse

### 4. Scripts de validation et génération

#### Script 1 : `scripts/generate-test-map.ts`

**Rôle** : Générer le fichier `.test-map.json`

**Algorithme** :
```typescript
import { glob } from 'glob';
import { readFileSync } from 'fs';
import { execSync } from 'child_process';

interface TestMapping {
  tests: string[];
  lastModified: string;
  coverage?: CoverageData;
}

async function generateTestMap() {
  const sourceFiles = await glob('src/**/*.{ts,vue}', {
    ignore: ['**/*.spec.ts', '**/*.test.ts']
  });

  const testFiles = await glob('tests/**/*.spec.ts');

  const mappings: Record<string, TestMapping> = {};

  for (const sourceFile of sourceFiles) {
    // Trouver les tests qui importent ce fichier
    const relatedTests = testFiles.filter(testFile => {
      const content = readFileSync(testFile, 'utf-8');
      const importPath = sourceFile
        .replace('src/', '@/')
        .replace(/\.(ts|vue)$/, '');
      return content.includes(`from '${importPath}'`) ||
             content.includes(`from "${importPath}"`);
    });

    // Récupérer la date de dernière modification (Git)
    const lastModified = execSync(
      `git log -1 --format=%cI ${sourceFile}`,
      { encoding: 'utf-8' }
    ).trim();

    mappings[sourceFile] = {
      tests: relatedTests,
      lastModified,
      // Coverage sera ajouté après exécution des tests
    };
  }

  // Détecter les tests orphelins
  const orphanTests = testFiles.filter(testFile => {
    const content = readFileSync(testFile, 'utf-8');
    const imports = content.match(/from ['"](@\/[^'"]+)['"]/g) || [];
    return imports.every(imp => {
      const sourcePath = imp
        .replace(/from ['"]@\//, 'src/')
        .replace(/['"]$/, '');
      return !sourceFiles.some(sf => sf.startsWith(sourcePath));
    });
  });

  // Détecter les fichiers non testés
  const untestedFiles = sourceFiles.filter(
    sf => mappings[sf].tests.length === 0
  );

  const testMap = {
    version: '1.0.0',
    generated: new Date().toISOString(),
    mappings,
    orphanTests,
    untestedFiles
  };

  writeFileSync('.test-map.json', JSON.stringify(testMap, null, 2));

  console.log(`✅ Test map generated`);
  console.log(`   - ${sourceFiles.length} source files`);
  console.log(`   - ${testFiles.length} test files`);
  console.log(`   - ${untestedFiles.length} untested files`);
  console.log(`   - ${orphanTests.length} orphan tests`);
}

generateTestMap();
```

**Exécution** :
```bash
npm run generate-test-map
```

#### Script 2 : `scripts/validate-test-map.ts`

**Rôle** : Valider que les fichiers modifiés ont des tests à jour

**Algorithme** :
```typescript
import { execSync } from 'child_process';
import { readFileSync } from 'fs';

interface ValidationResult {
  valid: boolean;
  warnings: string[];
  errors: string[];
}

function validateTestMap(strict = false): ValidationResult {
  // Récupérer les fichiers modifiés (staged)
  const stagedFiles = execSync('git diff --cached --name-only', {
    encoding: 'utf-8'
  })
    .trim()
    .split('\n')
    .filter(f => f.match(/^src\/.*\.(ts|vue)$/) && !f.includes('.spec.'));

  if (stagedFiles.length === 0) {
    return { valid: true, warnings: [], errors: [] };
  }

  // Charger le test map
  const testMap = JSON.parse(readFileSync('.test-map.json', 'utf-8'));

  const warnings: string[] = [];
  const errors: string[] = [];

  for (const file of stagedFiles) {
    const mapping = testMap.mappings[file];

    if (!mapping) {
      warnings.push(`⚠️  ${file}: Fichier non mappé`);
      continue;
    }

    if (mapping.tests.length === 0) {
      const msg = `❌ ${file}: Aucun test trouvé`;
      if (strict) {
        errors.push(msg);
      } else {
        warnings.push(msg);
      }
      continue;
    }

    // Vérifier si les tests ont été modifiés récemment
    const fileLastModified = execSync(
      `git log -1 --format=%cI ${file}`,
      { encoding: 'utf-8' }
    ).trim();

    const testLastModified = Math.max(
      ...mapping.tests.map(testFile =>
        new Date(
          execSync(`git log -1 --format=%cI ${testFile}`, {
            encoding: 'utf-8'
          }).trim()
        ).getTime()
      )
    );

    const fileDate = new Date(fileLastModified).getTime();

    if (fileDate > testLastModified) {
      warnings.push(
        `⚠️  ${file}: Modifié sans mise à jour des tests (${mapping.tests.join(', ')})`
      );
    }
  }

  // Affichage
  if (warnings.length > 0) {
    console.log('\n⚠️  Avertissements test-map:');
    warnings.forEach(w => console.log(`   ${w}`));
  }

  if (errors.length > 0) {
    console.log('\n❌ Erreurs test-map:');
    errors.forEach(e => console.log(`   ${e}`));
    console.log('\n💡 Ajoutez des tests ou utilisez --no-verify pour bypass');
  }

  const valid = errors.length === 0;
  return { valid, warnings, errors };
}

const strict = process.argv.includes('--strict');
const result = validateTestMap(strict);

if (!result.valid) {
  process.exit(1);
}
```

**Exécution** :
```bash
# Pre-commit (avertissements seulement)
node scripts/validate-test-map.js

# CI (strict, bloque si fichiers non testés)
node scripts/validate-test-map.js --strict
```

#### Script 3 : `scripts/check-coverage.ts`

**Rôle** : Vérifier les seuils de couverture par fichier

```typescript
import { readFileSync } from 'fs';

interface CoverageThresholds {
  lines: number;
  statements: number;
  functions: number;
  branches: number;
}

const THRESHOLDS: CoverageThresholds = {
  lines: 60,
  statements: 60,
  functions: 60,
  branches: 50
};

function checkCoverage() {
  const coverageSummary = JSON.parse(
    readFileSync('coverage/coverage-summary.json', 'utf-8')
  );

  const failures: string[] = [];

  for (const [file, metrics] of Object.entries(coverageSummary)) {
    if (file === 'total') continue;

    for (const [metric, threshold] of Object.entries(THRESHOLDS)) {
      const value = metrics[metric].pct;
      if (value < threshold) {
        failures.push(
          `❌ ${file}: ${metric} ${value}% < ${threshold}%`
        );
      }
    }
  }

  if (failures.length > 0) {
    console.log('\n❌ Couverture insuffisante:');
    failures.forEach(f => console.log(`   ${f}`));
    process.exit(1);
  }

  console.log('✅ Tous les seuils de couverture sont respectés');
}

checkCoverage();
```

### 5. Configuration Vitest améliorée

**Fichier** : `vitest.config.ts` (modifications)

```typescript
export default defineConfig({
  test: {
    // ... config existante

    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'json-summary'],

      // Seuils globaux
      thresholds: {
        lines: 60,
        statements: 60,
        functions: 60,
        branches: 50,
        perFile: true  // ⬅️ NOUVEAU : Vérifier par fichier
      },

      // Exclure les fichiers non testables
      exclude: [
        'node_modules/',
        'dist/',
        'tests/',
        '**/*.spec.ts',
        '**/*.config.ts',
        '**/types/**',
        'src/main.ts'  // Bootstrap, difficile à tester
      ]
    }
  }
});
```

## Plan d'implémentation (3 semaines)

### Semaine 1 : Foundation

**Objectifs** :
- Scripts de génération/validation fonctionnels
- Test map généré et validé

**Tâches** :
1. Créer `scripts/generate-test-map.ts` ✅
2. Créer `scripts/validate-test-map.ts` ✅
3. Créer `scripts/check-coverage.ts` ✅
4. Ajouter scripts dans `package.json` :
   ```json
   {
     "scripts": {
       "generate-test-map": "tsx scripts/generate-test-map.ts",
       "validate-test-map": "tsx scripts/validate-test-map.ts",
       "check-coverage": "tsx scripts/check-coverage.ts"
     }
   }
   ```
5. Générer le premier `.test-map.json`
6. Analyser les fichiers non testés
7. Ajouter `.test-map.json` dans `.gitignore` (fichier généré)

**Livrables** :
- `.test-map.json` généré
- Rapport des fichiers non testés
- Scripts fonctionnels

### Semaine 2 : Automation

**Objectifs** :
- Pre-commit hooks opérationnels
- Validation automatique avant chaque commit

**Tâches** :
1. Installer Husky et lint-staged :
   ```bash
   npm install --save-dev husky lint-staged
   npx husky init
   ```
2. Créer `.husky/pre-commit` avec validation test-map
3. Configurer `lint-staged` dans `package.json`
4. Tester le workflow complet :
   - Modifier un fichier source sans toucher aux tests
   - Commiter → Devrait afficher avertissement
   - Modifier les tests associés
   - Commiter → Devrait passer
5. Ajuster les seuils si trop de faux positifs
6. Documenter le workflow dans `TESTING_BEST_PRACTICES.md`

**Livrables** :
- Pre-commit hooks fonctionnels
- Documentation utilisateur mise à jour

### Semaine 3 : CI/CD

**Objectifs** :
- Pipeline GitHub Actions opérationnel
- Validation stricte en CI

**Tâches** :
1. Créer `.github/workflows/test.yml`
2. Configurer Codecov (compte + token)
3. Tester le pipeline sur branche test :
   - Push avec tests OK → Pipeline vert
   - Push avec couverture insuffisante → Pipeline rouge
   - Push avec fichiers non testés → Pipeline rouge (strict mode)
4. Configurer branch protection sur `main` :
   - Require status checks (tests must pass)
   - Require branches to be up to date
5. Créer badge de couverture dans `README.md` :
   ```markdown
   ![Coverage](https://codecov.io/gh/OpenStride/OpenStride-front/branch/main/graph/badge.svg)
   ```

**Livrables** :
- Pipeline CI/CD fonctionnel
- Badge de couverture dans README
- Branch protection activée

## Fichiers critiques à créer

| Fichier | Description | Priorité |
|---------|-------------|----------|
| `scripts/generate-test-map.ts` | Génère `.test-map.json` avec mapping test→code | Haute |
| `scripts/validate-test-map.ts` | Valide cohérence code/tests avant commit | Haute |
| `scripts/check-coverage.ts` | Vérifie seuils de couverture par fichier | Moyenne |
| `.github/workflows/test.yml` | Pipeline CI/CD GitHub Actions | Haute |
| `.husky/pre-commit` | Hook Git pour validation automatique | Haute |
| `package.json` (sections) | Scripts npm + config lint-staged | Haute |
| `.test-map.json` | Fichier généré (ajouter dans `.gitignore`) | Auto |

**Dépendances npm à ajouter** :
```json
{
  "devDependencies": {
    "husky": "^9.0.0",
    "lint-staged": "^15.0.0",
    "tsx": "^4.0.0",
    "glob": "^10.0.0"
  }
}
```

## Coûts et ROI

### Coûts initiaux

**Temps de développement** :
- Semaine 1 (scripts) : 8-12 heures
- Semaine 2 (automation) : 6-8 heures
- Semaine 3 (CI/CD) : 6-8 heures
- **Total** : 20-28 heures (~3 semaines à temps partiel)

**Coûts récurrents** :
- CI/CD (GitHub Actions) : Gratuit pour open-source
- Codecov : Gratuit pour open-source
- Maintenance scripts : 1-2 heures/mois

### ROI attendu

**Gains directs** :
- Détection automatique des régressions → -50% bugs en production
- Pré-commit hooks → -80% commits sans tests
- CI/CD → -90% merge de code cassé dans `main`

**Gains indirects** :
- Confiance dans le refactoring → +30% vélocité
- Onboarding facilité (nouveaux contributeurs) → -2 jours de formation
- Documentation vivante (test map = carte du code)

**Payback** : 2-3 mois (si équipe ≥ 3 personnes)

## Métriques de succès

### KPIs à suivre

**Coverage** :
- Couverture globale : 60%+ (lines/statements/functions)
- Fichiers sous seuil : < 5
- Tendance : +2% par mois

**Test mapping** :
- Fichiers non testés : < 10
- Tests orphelins : 0
- Fichiers avec 0 test : < 5%

**CI/CD** :
- Pipeline success rate : > 95%
- Temps moyen pipeline : < 5 minutes
- False positives : < 2%

**Adoption** :
- Commits avec tests mis à jour : > 90%
- Pre-commit hook bypass (--no-verify) : < 5%

### Dashboard de monitoring

**Option 1** : Script de reporting
```bash
npm run test-report
```

**Option 2** : GitHub Action artifact
- Télécharger `.test-map.json` depuis Actions
- Analyser avec outil custom ou Jupyter Notebook

**Option 3** : Badge dans README
```markdown
![Tests](https://img.shields.io/badge/tests-22%20files-green)
![Coverage](https://img.shields.io/badge/coverage-85%25-brightgreen)
![Untested](https://img.shields.io/badge/untested%20files-3-orange)
```

## Exemples de code détaillés

### Exemple 1 : Hook pre-commit complet

`.husky/pre-commit` :
```bash
#!/usr/bin/env sh
. "$(dirname -- "$0")/_/husky.sh"

echo "🔍 Validation test-map..."
npm run validate-test-map

if [ $? -ne 0 ]; then
  echo ""
  echo "❌ Validation échouée. Options:"
  echo "   1. Ajouter/mettre à jour les tests"
  echo "   2. Bypass avec: git commit --no-verify"
  exit 1
fi

echo "✅ Validation OK"

echo ""
echo "🧹 Linting fichiers modifiés..."
npx lint-staged

if [ $? -ne 0 ]; then
  echo "❌ Lint échoué"
  exit 1
fi

echo "✅ Lint OK"

echo ""
echo "🧪 Tests impactés..."
npm run test:unit -- --changed --run

if [ $? -ne 0 ]; then
  echo "❌ Tests échoués"
  exit 1
fi

echo "✅ Tous les checks passés!"
```

### Exemple 2 : Intégration dans workflow développeur

**Scénario** : Modifier `ActivityService.ts`

1. Développeur modifie `src/services/ActivityService.ts`
2. Développeur commit :
   ```bash
   git add src/services/ActivityService.ts
   git commit -m "feat: add batch delete"
   ```
3. Pre-commit hook s'exécute :
   ```
   🔍 Validation test-map...
   ⚠️  src/services/ActivityService.ts: Modifié sans mise à jour des tests
       (tests/unit/ActivityService.spec.ts)

   ❌ Validation échouée. Options:
      1. Ajouter/mettre à jour les tests
      2. Bypass avec: git commit --no-verify
   ```
4. Développeur met à jour les tests :
   ```bash
   git add tests/unit/ActivityService.spec.ts
   git commit -m "feat: add batch delete"
   ```
5. Pre-commit hook passe :
   ```
   🔍 Validation test-map...
   ✅ Validation OK

   🧹 Linting fichiers modifiés...
   ✅ Lint OK

   🧪 Tests impactés...
   ✅ ActivityService.spec.ts (10 tests)
   ✅ Tous les checks passés!
   ```

### Exemple 3 : Pipeline CI/CD détaillé

**Scénario** : Pull Request avec nouveau fichier non testé

1. Développeur crée `src/services/NotificationService.ts` (sans tests)
2. Développeur ouvre PR vers `main`
3. GitHub Actions s'exécute :
   ```yaml
   Validate test mapping (strict)
   ❌ src/services/NotificationService.ts: Aucun test trouvé

   Error: Test validation failed in strict mode
   ```
4. PR bloquée (status check failed)
5. Développeur ajoute `tests/unit/NotificationService.spec.ts`
6. Push → Pipeline passe ✅
7. PR peut être mergée

## Alternatives et compromis

### Approche simplifiée (si ressources limitées)

**Phase 1 uniquement** :
- Générer `.test-map.json` manuellement (hebdomadaire)
- Pas de pre-commit hooks (revue manuelle)
- CI/CD basique (juste `npm test`)

**Avantages** :
- Implémentation en 1 semaine (8 heures)
- Moins de friction développeur

**Inconvénients** :
- Moins de garanties (dépend discipline équipe)
- Risque de dérive test-code

### Approche progressive

**Étape 1** (Semaine 1) : Scripts + monitoring passif
- Générer test map
- Reporter état dans CI (warnings seulement)

**Étape 2** (Semaine 4) : Si adoption bonne → Activer hooks
- Pre-commit hooks avec bypass facile
- Monitoring adoption (% de --no-verify)

**Étape 3** (Semaine 8) : Si adoption > 80% → Mode strict
- Bloquer commits sans tests en CI
- Pre-commit hooks obligatoires

## Questions fréquentes (FAQ)

**Q : Le pre-commit hook ralentit-il les commits ?**
R : Oui, +3-10 secondes. Optimisations possibles :
- Ne valider que fichiers modifiés (déjà fait)
- Cacher `.test-map.json` (30s → 1s)
- Utiliser `--no-verify` en cas d'urgence

**Q : Que faire pour les fichiers "non testables" (types, configs) ?**
R : Les exclure dans `generate-test-map.ts` :
```typescript
const excludePatterns = [
  'src/types/**',
  '**/*.d.ts',
  '**/*.config.ts',
  'src/main.ts'
];
```

**Q : Comment gérer les tests d'intégration (multi-fichiers) ?**
R : Le mapping détectera plusieurs sources pour un test :
```json
{
  "tests/integration/sync-flow.spec.ts": {
    "sources": [
      "src/services/SyncService.ts",
      "src/services/StorageService.ts",
      "src/services/ActivityService.ts"
    ]
  }
}
```

**Q : Peut-on bypasser le pre-commit hook ?**
R : Oui, avec `git commit --no-verify`. À utiliser exceptionnellement (hotfix urgent).

**Q : Le CI/CD fonctionne-t-il sur fork (contributions externes) ?**
R : Oui, GitHub Actions s'exécute sur les forks. Les secrets (Codecov token) sont automatiquement masqués.

## Références

- **Documentation Vitest** : https://vitest.dev/guide/coverage.html
- **Husky** : https://typicode.github.io/husky/
- **GitHub Actions** : https://docs.github.com/en/actions
- **Codecov** : https://docs.codecov.com/docs
- **Testing Best Practices (projet)** : `docs/TESTING_BEST_PRACTICES.md`

## Changelog

| Date | Version | Changements |
|------|---------|-------------|
| 2026-01-21 | 1.0.0 | Création initiale du document |

---

**Note** : Ce document est une spécification technique. L'implémentation peut être ajustée selon les contraintes du projet (budget, équipe, priorités).
