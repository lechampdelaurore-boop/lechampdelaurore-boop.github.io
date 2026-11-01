# Les applis de Marc

La page d'accueil de toutes les applis pour réviser et jouer : **https://lechampdelaurore-boop.github.io/**

Pompon, une petite mascotte kawaii originale, dit bonjour, puis chaque appli apparaît sous forme de grande carte à toucher.

## Ajouter une appli : rien à faire ici

La liste se met à jour toute seule. À chaque ouverture, la page demande à GitHub les dépôts publics publiés sur GitHub Pages, puis garde ceux dont la page contient :

```html
<meta name="appli-marc" content="oui">
```

(ou qui portent le sujet GitHub `appli-marc`). Le nom, la description, l'icône et la couleur sont lus dans le `manifest.webmanifest` de l'appli. Une appli créée il y a moins de 14 jours porte un badge « Nouveau ! ». La dernière liste est gardée dans le navigateur pour fonctionner hors ligne.

Pour qu'une nouvelle appli soit propre :

- `manifest.webmanifest` avec `id`, `name`, `short_name`, `description`, `start_url` et `scope` à `./`, `display: standalone`, icônes PNG 192 et 512 (`any`) et une icône `maskable` ;
- `sw.js` (hors ligne) et `<link rel="apple-touch-icon">` pour l'iPhone ;
- un bouton « 🏠 Mes applis » qui renvoie vers `/` (sur iPhone en plein écran, il n'y a pas de bouton retour).

## Installer sur un téléphone

Installer l'accueil une seule fois (Chrome sur Android : bouton « Mettre sur l'écran d'accueil » ou menu ⋮ puis « Installer l'application » ; Safari sur iPhone : Partager puis « Sur l'écran d'accueil »). Toutes les applis s'ouvrent ensuite en plein écran depuis l'accueil. Chaque appli peut aussi s'installer seule.

## Fichiers

- `index.html` : toute la page (HTML, CSS et JavaScript, sans bibliothèque). Rien n'est envoyé sur internet, à part la lecture de la liste publique des dépôts sur l'API GitHub.
- `sw.js` et `manifest.webmanifest` : installation et hors ligne. Le service worker couvre tout le site mais ne s'occupe que des fichiers de l'accueil et des icônes affichées (`?hub=1`) ; chaque appli garde son propre `sw.js`. Après une modification, changer la valeur de `CACHE` dans `sw.js`.
- `icons/` : icônes de Pompon ; `fonts/` : polices Fredoka et Nunito (licence SIL Open Font License, voir `OFL-*.txt`).
- `tests/en-ligne.cjs` et `.github/workflows/test-en-ligne.yml` : après chaque mise en ligne, et chaque matin, GitHub ouvre le vrai site dans Chrome au format téléphone (5 tailles) et vérifie que l'accueil liste les applis, puis que l'accueil et chaque appli sont installables (avis de Chrome, manifeste, icônes, service worker), sans erreur console, et se rouvrent hors ligne. Résultat et captures dans l'onglet Actions. Lancement local : `npm install --no-save playwright && node tests/en-ligne.cjs`.
