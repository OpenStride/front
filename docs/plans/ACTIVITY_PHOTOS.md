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

### 2. Sync multi-appareils — fait

- `activity_photos` passe par `SyncService` (versions, tombstones), comme
  `gear` ; `photo_blobs` reste sur l'appareil.
- À chaque sync, avant les lignes : chaque image (et sa miniature) devient un
  fichier privé dans `OpenStride/photos/` (`StoragePlugin.writeFile`), et la
  ligne note les ids (`remote[pluginId]`). Une ligne arrive donc sur un autre
  appareil en sachant déjà où sont ses images. Un envoi à moitié raté est
  défait et retenté à la sync suivante.
- Un autre appareil ne télécharge une image qu'au moment de l'afficher
  (`readFile`), une seule fois, puis la garde.
- Une photo supprimée : ses fichiers sont effacés du Drive par le premier
  appareil qui synchronise, puis `remote` est vidé (une version plus loin).
- Ajouter ou supprimer une photo déclenche la sync automatique (5 s).

### 3. Partage aux amis — fait

- Une ligne « Photos (sans leur position GPS) » dans « Ce que voient vos
  amis », désactivée par défaut.
- `PublicPhotoPublisher` : chaque photo d'une sortie publique devient deux
  fichiers publics (miniature et image), le JPEG en base64 dans une enveloppe
  JSON, scellés avec la clé du lien par `writePublicFile` comme le reste. Une
  photo n'est envoyée qu'une fois (`publishedPhotos` dans les réglages) ; une
  nouvelle clé (lien changé) la renvoie.
- Les liens sont listés sur la sortie dans le fichier annuel
  (`PublicActivity.photos`), pas dans le fichier de détails : le flux d'un ami
  les affiche sans ouvrir la sortie.
- Une fois le nouveau manifeste en ligne, les fichiers des photos retirées
  (supprimées, sortie passée privée, partage coupé) sont effacés.
- Ajouter ou supprimer une photo republie (si les photos sont partagées).
- Côté ami : une sortie déjà reçue se met à jour quand ses photos (ou son
  titre) changent ; les images s'ouvrent avec la clé de l'ami
  (`ctx.friends.getSharedPhoto`), une fois par session. Carte du flux et page
  de la sortie, en lecture seule.

### 4. (Optionnel) Import Google Photos

- Picker Google, avec présélection des photos prises pendant la sortie.
- Demande un nouveau scope OAuth et sans doute une vérification de l'app : à
  ne faire que si le sélecteur de fichiers ne suffit pas.
