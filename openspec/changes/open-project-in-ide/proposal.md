## Why

Ouvrir un projet dans son IDE reste aujourd'hui un aller-retour manuel hors de Switchboard (Finder ou terminal, puis navigation jusqu'au dossier). Switchboard connaît déjà le chemin filesystem de chaque projet : un bouton dans le header du projet supprime ce détour et complète le rôle de « poste de pilotage » de la sidebar, aux côtés de `settings` / `archive` / `new session`.

## What Changes

- **Nouveau bouton** dans le header de chaque projet de la sidebar, révélé au hover comme les boutons existants, qui ouvre le dossier du projet dans l'IDE externe configuré.
- Le bouton apparaît aussi sur les headers de **worktree** et ouvre alors le chemin du worktree, pas celui du projet parent.
- **Nouveau réglage global** « External IDE » (pas d'override par projet) : un `select` d'IDE connus (VS Code, Cursor, WebStorm, Zed, …) plus une entrée `Custom…` qui révèle un champ commande libre.
- **Nouveau canal IPC** `open-in-ide` qui prend uniquement un chemin filesystem ; la commande/l'application à lancer est résolue **côté main** depuis les settings. Le renderer ne transmet jamais de commande.
- **Retour d'erreur explicite** quand aucun IDE n'est configuré ou que le lancement échoue (IDE non installé, commande introuvable) : notification actionnable qui renvoie vers le réglage.

### Non-goals

- Pas d'ouverture d'un **fichier** précis à une ligne donnée (le viewer et le pont MCP couvrent ce besoin).
- Pas d'override du réglage par projet — arbitrage explicite pour un premier jet ; le pattern `preLaunchCmd` reste disponible si le besoin apparaît.
- Pas de menu overflow pour désencombrer le header : le bouton reste inline (4e bouton). À réévaluer si un 5e arrive.
- Pas de détection automatique de l'IDE « probable » d'un projet (via `.vscode/`, `.idea/`).

## Capabilities

### New Capabilities

- `open-in-ide`: ouverture du dossier d'un projet (ou d'un worktree) dans un IDE externe configuré globalement — sélection de l'IDE, résolution de la commande de lancement, déclenchement depuis la sidebar, et comportement en cas d'échec.

### Modified Capabilities

Aucune : `openspec/specs/` est vide, aucune capability existante ne voit ses exigences changer.

## Impact

| Zone | Nature |
|---|---|
| `src/vue/components/ProjectGroup.vue` | Bouton + icône dans les deux variantes de header (projet, worktree) |
| `public/style.css` | Style du bouton, ajout à la règle d'apparition au hover du header projet |
| `preload.js` | Exposition de `openInIde(path)` |
| `main.js` | Handler `open-in-ide`, `SETTING_DEFAULTS` (clé IDE), `GLOBAL_ONLY_SETTINGS` |
| `src/vue/components/SettingsPanelApp.vue` | Champ select + champ custom conditionnel (markup, `form`, `loadSettings`, `save`) |
| `shell-profiles.js` | Réutilisé (lecture seule) pour l'exécution d'une commande custom via login shell |

**Dépendances** : aucune nouvelle dépendance npm.

**Risque principal** : une app Electron lancée depuis le Finder n'hérite pas du `PATH` du shell de connexion ; toute commande CLI (`code`, `webstorm`) doit passer par un login shell. Traité en design.

**Surface de sécurité** : le handler existant `open-external` ne whiteliste que `http(s)`. Le nouveau canal conserve cette posture — chemin en entrée, commande résolue en interne — et n'introduit pas d'exécution arbitraire pilotée par le renderer.
