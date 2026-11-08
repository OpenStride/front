# Photos d'activité

Ajouter des photos à ses sorties, à la Strava, sans serveur ni stockage payé.

## Pourquoi pas les liens Google Photos

Depuis mars 2025, l'API Library de Google Photos ne donne plus accès qu'aux
médias créés par l'application elle-même. Reste le Picker : l'utilisateur
choisit des photos dans l'interface Google, mais les `baseUrl` obtenues expirent
au bout d'environ une heure et ne s'ouvrent qu'avec son jeton OAuth. On ne peut
donc ni les garder ni les montrer à un ami : Google Photos peut être une source
d'import, jamais un stockage. (À reconfirmer avant la phase 4.)

Les photos sont donc stockées : sur l'appareil, puis dans le Drive de
l'utilisateur, sur son propre quota (le scope `drive.file` actuel suffit).

## Phases

### 1. Local — fait

- Ajout depuis la page d'une sortie à soi (bouton appareil photo à côté du
  crayon), sélecteur de fichiers multiple : la galerie du téléphone, Google
  Photos compris, et la WebView native.
- Chaque fichier est redimensionné (2048 px, ~250–600 Ko) et ré-encodé en
  JPEG, ce qui supprime le bloc EXIF et la position GPS qu'il contient. Seule la
  date de prise de vue est lue avant (`@/utils/exifDate`), pour l'ordre.
  Miniature à 640 px.
- IndexedDB v14 : `activity_photos` (métadonnées versionnées, suppression
  douce, index `activityId`) et `photo_blobs` (les images, à part, pour qu'une
  liste ne charge jamais un mégaoctet). Les deux dans `LOCAL_ONLY_STORES`.
- 10 photos max par sortie. Une sortie supprimée emporte ses photos.
- Bandeau de miniatures sous le titre, visionneuse plein écran (flèches,
  Échap, suppression). Rien n'est affiché sans photo.
- Carte du flux : les premières miniatures sur la carte ; sans tracé, la
  première photo devient l'image de tête.
- Plugins : `ctx.photos` (`list`, `add`, `blob`, `remove`, `onChanged`).

### 2. Sync multi-appareils

- `activity_photos` sort de `LOCAL_ONLY_STORES` et passe par `SyncService`
  (versions, tombstones), comme `gear`.
- Chaque image devient un fichier Drive à part dans un dossier `photos/`, hors
  de la sauvegarde JSON ; son id Drive est noté sur la ligne.
- Un autre appareil ne télécharge une image qu'à l'ouverture de la sortie.
- Une suppression efface aussi le fichier Drive.

### 3. Partage aux amis

- Une ligne « Photos » dans « Ce que voient vos amis », désactivée par défaut.
- Versions moyennes publiées chiffrées avec la clé du lien (`publicCrypto`,
  à étendre aux octets), adresses listées dans le fichier de détails que l'ami
  ne charge qu'à l'ouverture de la sortie.

### 4. (Optionnel) Import Google Photos

- Picker Google, avec présélection des photos prises pendant la sortie.
- Demande un nouveau scope OAuth et sans doute une vérification de l'app : à
  ne faire que si le sélecteur de fichiers ne suffit pas.
