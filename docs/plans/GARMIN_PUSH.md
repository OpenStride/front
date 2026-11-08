# Notification push « nouvelle sortie Garmin » — à faire plus tard

## Où on en est

Le plugin `firebase-notifications` a été retiré : il obtenait un jeton FCM et le
gardait, mais aucun serveur n'envoyait jamais rien à ce jeton. Il n'a donc
jamais rien notifié. Son retrait a aussi sorti le SDK `firebase` du bundle et du
service worker.

## Pourquoi pas côté client seul

Une notification push a toujours besoin d'un serveur qui l'émet. Le
« Periodic Background Sync » réveille le service worker de temps en temps, mais
seulement sur Chrome Android, pour une PWA installée, quand le navigateur le
décide. Rien sur iOS. On ne peut pas s'appuyer dessus.

## La piste retenue : le Web Push standard, depuis `garminProxy`

La Function `garminProxy` reçoit déjà le signal de Garmin à chaque nouvelle
sortie (`POST /ping/<secret>`). C'est exactement l'événement à notifier.

1. **Inscription :** l'app crée un abonnement `PushManager.subscribe()` avec la
   clé VAPID publique et l'envoie à un nouvel endpoint `POST /subscribe`. Cet
   endpoint est authentifié par le jeton Garmin, comme `/push` : le userId est
   déduit du jeton, jamais lu dans la requête. L'abonnement est rangé dans
   Cloud Storage sous `garmin_subs/<userId>/`. `POST /unsubscribe` le retire.
2. **Envoi :** à la réception d'un ping, la Function envoie un Web Push (lib
   `web-push`, clé VAPID privée en secret Functions) à chaque abonnement de
   l'utilisateur concerné. Un abonnement qui répond 404 ou 410 est supprimé.
3. **Contenu :** le message ne transporte rien de personnel, juste « Nouvelle
   sortie disponible ». C'est l'app qui importe ensuite les données, comme
   aujourd'hui.
4. **Service worker :** le noyau gère l'événement `push` standard et le clic
   sur la notification (ouvrir l'app). Pas de SDK Firebase, pas d'import de
   plugin : le contrat `tests/unit/contracts.spec.ts` l'interdit.
5. **Réglage :** un interrupteur dans le plugin Garmin (« Me prévenir d'une
   nouvelle sortie ») qui fait l'inscription. Le plugin passe par un point
   d'extension du `PluginContext`, pas par un import direct du service worker.

## Limites connues

- **Sorties Garmin uniquement.** Les sorties des amis passent par leur Drive, et
  aucun serveur ne les voit. Les notifier demanderait de confier le graphe
  social à un serveur, ce qui va contre le principe local-first.
- **iOS :** le Web Push n'y marche que pour une PWA installée (iOS 16.4 et
  plus).
- **App native (Capacitor) :** il faudrait APNs ou FCM natif. C'est un chantier
  séparé, voir `docs/NATIVE_APP.md`.
