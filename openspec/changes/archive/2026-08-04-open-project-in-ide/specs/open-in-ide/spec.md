## Purpose

Permet d'ouvrir le dossier d'un projet (ou d'un worktree) listé dans la sidebar directement dans un IDE externe choisi une fois pour toutes dans les réglages globaux, sans quitter Switchboard.

## ADDED Requirements

### Requirement: Réglage global de l'IDE externe

Le système SHALL exposer, dans les réglages **globaux** uniquement, un réglage « External IDE » composé d'un choix parmi une liste d'IDE connus, plus une option `Custom…` associée à un champ de commande libre. Ce réglage MUST NOT être surchargeable au niveau projet.

#### Scenario: Sélection d'un IDE connu

- **WHEN** l'utilisateur ouvre les réglages globaux et sélectionne un IDE de la liste
- **THEN** le choix est persisté dans les settings globaux
- **AND** il s'applique à tous les projets

#### Scenario: Choix Custom révèle le champ commande

- **WHEN** l'utilisateur sélectionne `Custom…`
- **THEN** un champ texte de commande est affiché
- **AND** le champ est masqué pour tout autre choix

#### Scenario: Absence d'override projet

- **WHEN** l'utilisateur ouvre les réglages d'un projet
- **THEN** aucun champ « External IDE » n'y est proposé

#### Scenario: Valeur par défaut

- **WHEN** aucun IDE n'a jamais été configuré
- **THEN** le réglage vaut « non configuré » et aucun IDE n'est présumé installé

### Requirement: Bouton d'ouverture dans le header de projet

Le système SHALL afficher, dans le header de chaque projet de la sidebar, un bouton d'ouverture dans l'IDE, suivant les mêmes conventions d'affichage que les boutons d'action existants du header (révélé au survol).

#### Scenario: Ouverture d'un projet

- **WHEN** l'utilisateur clique le bouton IDE d'un projet et qu'un IDE est configuré
- **THEN** l'IDE configuré est lancé (ou activé s'il tourne déjà) avec le chemin filesystem du projet comme dossier ouvert

#### Scenario: Header de worktree

- **WHEN** l'utilisateur clique le bouton IDE sur le header d'un worktree
- **THEN** le chemin transmis est celui du worktree, pas celui du projet parent

#### Scenario: Le clic n'affecte pas la sélection

- **WHEN** l'utilisateur clique le bouton IDE
- **THEN** le projet n'est ni sélectionné, ni déplié, ni replié

### Requirement: Résolution de la commande côté processus principal

Le processus principal SHALL résoudre l'IDE à lancer à partir des settings globaux. Le canal IPC d'ouverture MUST accepter uniquement un chemin filesystem et MUST NOT accepter de commande ou d'arguments fournis par le renderer.

#### Scenario: Le renderer ne transmet qu'un chemin

- **WHEN** le renderer déclenche l'ouverture
- **THEN** la charge utile IPC ne contient que le chemin du dossier
- **AND** la commande effectivement exécutée est construite dans le processus principal à partir des settings

#### Scenario: Chemin inexistant

- **WHEN** le chemin transmis ne correspond à aucun dossier existant
- **THEN** aucun processus n'est lancé
- **AND** une erreur est retournée au renderer

### Requirement: Lancement robuste vis-à-vis du PATH

Lorsque l'IDE est lancé via une commande CLI (option `Custom…` ou IDE connu résolu par binaire), le système SHALL exécuter cette commande dans un shell de connexion afin d'hériter du `PATH` de l'utilisateur, l'application Electron n'héritant pas du `PATH` du shell quand elle est lancée depuis l'interface graphique.

#### Scenario: Commande installée via un gestionnaire de version

- **WHEN** la commande de l'IDE n'est présente que dans le `PATH` défini par le profil shell de l'utilisateur
- **THEN** le lancement réussit

#### Scenario: Le lancement ne bloque pas l'application

- **WHEN** l'IDE est lancé
- **THEN** le processus enfant est détaché et l'interface de Switchboard reste réactive

### Requirement: Retour d'erreur explicite

Le système SHALL informer l'utilisateur lorsque l'ouverture échoue, et MUST NOT échouer silencieusement.

#### Scenario: Aucun IDE configuré

- **WHEN** l'utilisateur clique le bouton IDE alors qu'aucun IDE n'est configuré
- **THEN** un message l'invite à configurer un IDE
- **AND** un accès direct au réglage global correspondant lui est proposé

#### Scenario: IDE configuré mais introuvable

- **WHEN** l'IDE configuré n'est pas installé ou que sa commande est introuvable
- **THEN** un message d'erreur nommant l'IDE concerné est affiché

#### Scenario: Commande custom vide

- **WHEN** l'option `Custom…` est retenue mais le champ commande est vide
- **THEN** le comportement est celui d'un IDE non configuré
