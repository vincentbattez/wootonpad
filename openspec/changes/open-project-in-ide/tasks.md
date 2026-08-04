## 1. Réglages (main + UI)

- [x] 1.1 Ajouter les clés `externalIde` (id d'IDE, défaut `null`) et `externalIdeCommand` (chaîne, défaut `''`) à `SETTING_DEFAULTS` dans `main.js`
- [x] 1.2 Ajouter ces deux clés à `GLOBAL_ONLY_SETTINGS` pour interdire l'override par projet
- [x] 1.3 Créer un module autonome `ide-launch.js` (aucun `require` d'Electron ni de SQLite, pour rester chargeable par `node --test`) contenant la liste statique des IDE connus (id, label, bundle id macOS), et le requérir depuis `main.js`
- [x] 1.4 Ajouter le champ `select` « External IDE » dans `SettingsPanelApp.vue`, section globale uniquement : markup, entrée `form`, lecture dans `loadSettings()`, écriture dans `save()`
- [x] 1.5 Ajouter le champ texte de commande custom, affiché conditionnellement quand le select vaut `custom`, avec le même cycle markup/form/load/save
- [x] 1.6 Vérifier manuellement que le champ n'apparaît pas dans le panneau de réglages d'un projet

## 2. Lancement (processus principal)

- [x] 2.1 Écrire dans `ide-launch.js` la résolution pure `(settings, dir) → argv` : id d'IDE → bundle id ; `custom` → commande + chemin échappé ; non configuré ou commande vide → erreur typée `not-configured`
- [x] 2.2 Implémenter le lancement mode « IDE connu » : `spawn('/usr/bin/open', ['-b', bundleId, dir])` (chemin absolu, pas d'API Electron — aucune n'ouvre un chemin avec une application donnée), en propageant le code retour non nul (IDE non installé)
- [x] 2.3 Implémenter le lancement mode custom : commande + chemin échappé, exécutée via `resolveShell()` + `shellArgs()` de `shell-profiles.js`, processus détaché, sortie ignorée
- [x] 2.4 Gérer le cas non-macOS : le mode « IDE connu » retourne une erreur explicite plutôt que d'échouer silencieusement
- [x] 2.5 Ajouter le handler `ipcMain.handle('open-in-ide', …)` : valide que l'argument est un dossier existant, appelle la résolution + le lancement, retourne `{ ok, error? }` — le placer hors de toute fonction où `shell` est masqué par une variable locale

## 3. Pont renderer

- [x] 3.1 Exposer `openInIde(path)` dans `preload.js`, dans le bloc `invoke`
- [x] 3.2 Vérifier qu'aucune commande ni argument n'est transmis depuis le renderer (chemin seul)

## 4. Bouton sidebar

- [x] 4.1 Ajouter la constante SVG de l'icône IDE dans `ProjectGroup.vue`, à côté des SVG existants
- [x] 4.2 Ajouter le bouton dans le header projet avec tooltip, appel direct à `window.api.openInIde(project.projectPath)` et arrêt de la propagation du clic
- [x] 4.3 Ajouter le bouton dans la variante header worktree, en passant le chemin du worktree
- [x] 4.4 Styler le bouton dans `style.css` et l'inclure dans la règle d'apparition au survol du header

## 5. Erreurs et retours

- [x] 5.1 Afficher un message distinct pour `not-configured`, avec accès direct au réglage global
- [x] 5.2 Afficher un message d'erreur nommant l'IDE quand le lancement échoue (non installé, commande introuvable)
- [x] 5.3 Vérifier qu'aucun chemin d'échec ne reste silencieux

## 6. Vérification

- [x] 6.1 Test unitaire de `ide-launch.js` sous `node --test` : IDE connu, custom, custom vide, non configuré, chemin avec espaces et apostrophes
- [x] 6.2 `npm test` passe
- [x] 6.3 Vérification manuelle dans l'app : ouverture d'un projet, ouverture d'un worktree, IDE non configuré, commande custom pointant vers un binaire inexistant
- [x] 6.4 Vérification visuelle du header avec 4 boutons au survol, sur un nom de projet long
