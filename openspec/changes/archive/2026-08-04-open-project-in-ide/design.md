## Context

Voir `proposal.md — Why` pour la motivation. Contraintes de l'existant qui façonnent l'approche :

- Aucun précédent de lancement d'**application externe** dans le repo. `open-terminal` (`main.js:1708`) spawn un PTY interne ; `open-external` (`main.js:710`) whiteliste `http(s)` et ne sert que les liens. `shell.openPath` / `showItemInFolder` ne sont utilisés nulle part.
- Le header projet est rendu par `ProjectGroup.vue` (variante projet l. 13-32, variante worktree l. 5-10), avec des SVG en constantes locales et des boutons révélés au hover (`style.css:1257-1259`).
- Les settings vivent en SQLite, fusionnés défauts ← global ← projet (`get-effective-settings`, `main.js:1624`). `GLOBAL_ONLY_SETTINGS` (`main.js:1617`) existe déjà pour les clés non surchargeables.
- `shell-profiles.js` expose `resolveShell(profileId)` et `shellArgs(shellPath, cmd, extraArgs)` — le mécanisme déjà utilisé partout pour exécuter une commande dans le shell de connexion de l'utilisateur.

```
ProjectGroup.vue  ──window.api.openInIde(path)──▶  preload.js
                                                       │ invoke('open-in-ide', path)
                                                       ▼
                                              main.js  handler
                                                       │
                                    lit settings globaux (externalIde)
                                                       │
                          ┌────────────────────────────┴──────────────┐
                          ▼                                           ▼
                 IDE connu → bundle id                     Custom → commande libre
                 spawn(/usr/bin/open -b <id>)              spawn(login shell, cmd)
```

## Goals / Non-Goals

**Goals**

- Un seul chemin de code de lancement pour les deux modes, avec une frontière nette entre « IDE connu » (déclaratif, sans PATH) et « custom » (commande, avec PATH).
- Le renderer reste sans privilège : il envoie un chemin, rien d'autre.
- Échec observable et actionnable dans tous les cas.

**Non-Goals (niveau design)**

- Pas de détection de l'IDE installé pour pré-remplir le select — la liste est statique, la validation se fait au lancement.
- Pas d'abstraction générique « external launcher » réutilisable : un seul consommateur aujourd'hui.
- Pas de support Windows/Linux de première classe pour le mode « IDE connu » (voir Risques).

## Decisions

### D1 — Deux mécanismes de lancement, un seul réglage

| | IDE connu (select) | Custom (commande) |
|---|---|---|
| Mécanisme | `spawn('/usr/bin/open', ['-b', bundleId, dir])` | `spawn` de la commande via login shell |
| PATH | non concerné (`open` en chemin absolu) | login shell requis |
| Détection d'échec | code retour non nul de `open` | code retour + `command not found` |

> Il n'existe **aucune** API Electron permettant d'ouvrir un chemin avec une application donnée : `shell.openPath` délègue au handler par défaut (Finder pour un dossier) et `shell.openExternal` vise les URL. Le mode « IDE connu » passe donc obligatoirement par `/usr/bin/open`.

**Pourquoi les deux** : le mode « IDE connu » est le seul qui fonctionne sans configuration ni shim CLI installé — c'est le défaut sain. Le mode custom couvre tout le reste (flags `--new-window`, IDE absent de la liste, wrapper maison) sans faire grossir la liste.

*Alternative écartée* — n'exposer qu'un champ commande libre : simple à implémenter, mais casse pour tout utilisateur qui n'a pas installé le shim CLI de son IDE (« Shell Command: Install 'code' in PATH » n'est pas fait par défaut) et lui demande de connaître le nom du binaire.

*Alternative écartée* — n'exposer que le select : impossible de passer des flags, et toute demande d'IDE absent devient une modification du code.

### D2 — Modèle de données du réglage

Deux clés plutôt qu'une valeur polymorphe : un identifiant d'IDE (`'vscode' | 'cursor' | … | 'custom' | null`) et une commande custom (chaîne, ignorée si l'identifiant ≠ `custom`). Ajoutées à `SETTING_DEFAULTS` **et** à `GLOBAL_ONLY_SETTINGS`.

**Pourquoi** : le champ custom conserve sa valeur quand l'utilisateur bascule temporairement vers un IDE de la liste puis revient — comportement attendu d'un formulaire de réglages. Deux clés séparées rendent aussi la migration triviale si un override projet est ajouté plus tard.

*Alternative écartée* — une seule clé contenant soit un id soit une commande : ambiguïté de parsing (`code` est-il un id ou une commande ?) et perte de la valeur custom au changement de select.

### D3 — Placement de la commande dans la ligne de commande custom

La commande custom reçoit le chemin **en argument final**, ajouté par le processus principal et échappé (`sh`-quoting). Pas de placeholder `{path}` dans un premier temps.

**Pourquoi** : couvre `code`, `code -n`, `webstorm`, `zed`, `subl -a` — l'écrasante majorité des IDE prennent le dossier en dernier argument. Un placeholder ajoute une syntaxe à documenter et une classe d'erreurs (placeholder oublié → l'IDE s'ouvre sans dossier).

*À revoir* si un cas réel demande le chemin en position non finale ; le placeholder reste ajoutable de façon rétrocompatible (absence de `{path}` ⇒ ajout en fin).

### D4 — Frontière IPC

Le canal prend `(projectPath)` et retourne `{ ok, error? }`. La commande est construite dans le main. Le handler valide que le chemin existe et est un dossier avant tout lancement.

La **résolution** (settings + chemin → argv) vit dans un module autonome sans aucun `require` d'Electron ni de SQLite, séparé du **lancement** (spawn). Motif : `node --test` ne peut pas charger un module qui remonte jusqu'à `db.js` (ABI Electron) ; la logique testable — liste d'IDE, cas `custom` vide, échappement des chemins à espaces/apostrophes — doit donc rester du côté pur.

**Pourquoi** : conserve la posture de `open-external`. Accepter une commande depuis le renderer transformerait un canal d'ouverture en exécution arbitraire — surface disproportionnée pour la fonctionnalité.

### D5 — Un 4e bouton inline, pas de menu overflow

Le header passe à 4 boutons hover (gear, archive, new session, IDE). Le bouton IDE se place à gauche du groupe existant.

**Pourquoi** : l'utilisateur a demandé un bouton ; un menu overflow ajoute un clic à l'action la plus fréquente. Le seuil de bascule vers un overflow est noté comme dette de design à réévaluer au 5e bouton.

### D6 — Surface d'erreur

Le retour `{ ok: false, error }` remonte au renderer, qui affiche un message. Le cas « non configuré » est distingué du cas « lancement échoué » car seul le premier a une action de réparation évidente (ouvrir les réglages globaux).

## Risks / Trade-offs

| Risque | Mitigation |
|---|---|
| Electron lancé depuis le Finder n'hérite pas du `PATH` → la commande custom échoue | Exécution systématique via `resolveShell` + `shellArgs` (login shell), comme le reste du repo |
| Le mode « IDE connu » repose sur `open`/bundle ids, spécifiques à macOS | Cible actuelle = macOS. Sur les autres plateformes, le select se réduit au mode custom ; à traiter explicitement en tâche plutôt qu'à laisser planter |
| Une commande custom qui bloque ou attend en avant-plan gèle un slot | Processus détaché, sortie ignorée, pas d'attente de fin |
| Une commande custom mal formée peut lancer n'importe quoi | Accepté : c'est un réglage saisi par l'utilisateur lui-même, au même titre que `preLaunchCmd` déjà présent. La garantie porte sur le renderer, pas sur l'utilisateur |
| Le chemin contient espaces/apostrophes → commande cassée | Échappement `sh` du chemin lors de la concaténation |
| 4 boutons au hover réduisent la zone cliquable du nom de projet | Vérifier visuellement sur un nom de projet long ; le nom est déjà tronqué par `shortName` |

## Migration Plan

Aucune migration de données : deux clés de settings additives, absentes ⇒ « non configuré » ⇒ le bouton signale simplement qu'il faut configurer. Rollback = retrait du bouton et du handler ; les clés orphelines en base sont inertes.

## Open Questions

- Quelle liste exacte d'IDE connus pour le premier jet ? (VS Code, Cursor, WebStorm, Zed est une base raisonnable ; ajouter une entrée est une ligne de constante et ne change ni les specs ni le découpage.)
- Le message d'erreur passe-t-il par un toast ou par le mécanisme de notification existant du renderer ? À trancher en lisant l'existant au moment de l'implémentation.
