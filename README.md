# aupifometre — La République des Faits

Site statique de jeux de conviction sur données publiques. Aucun éditorial, aucun camp :
les guichets font produire la conclusion par le visiteur, à partir de chiffres qu'il ne
choisit pas et qu'il peut vérifier à la source.

**En ligne :** https://aupifometre.github.io/game/

## Les guichets

| | Page | Ce qu'on y fait |
|---|---|---|
| 🎲 **04** | `pari.html` | Un critère de vie, un axe **tiré au sort** parmi 7, et on parie sur la force du lien. Verdict sur 139 à 227 pays, exprimé en % des écarts partagés (r²), avec une jauge et la bonne réponse en cas d'erreur. |
| 🏆 **07** | `classement.html` | 7 critères, 20 jetons répartis **avant** de voir les pays. La machine classe les 16 pays du débat, dit où finit la France, et révèle **le meilleur prédicteur** du classement produit — un indicateur que le visiteur n'a jamais choisi. |
| ✏️ **02** | `courbe.html` | Le début d'une courbe est donné, on trace la suite de mémoire, la réalité se superpose. **21 séries**, centrées sur les débats politiques français. |
| 🧾 **09** | `milliards.html` | Des milliards annoncés jusqu'aux euros nets sur une fiche de paie : évaporation comportementale, clé de répartition, charges, cotisations. S'applique aux hausses de recettes **comme** aux baisses de dépenses. |

## Données

Aucun serveur, aucune base, aucun compte, aucun tracking. `rf-data.js` charge en direct
depuis les API publiques (Banque mondiale, Our World in Data, Eurostat), met en cache
30 jours dans le `localStorage`, et retombe sur `snapshot.js` si une API est indisponible.
Chaque indicateur porte un lien ⓘ vers sa source, et chaque guichet exporte ses données en CSV.

Sources : Banque mondiale · Our World in Data (V-Dem, PNUD, OMS, Gallup, Ember, IRENA,
Global Carbon Budget) · Eurostat · World Inequality Database · OIT.

## Développer

```
python3 -m http.server 8347
```

Site 100 % statique : n'importe quel serveur de fichiers convient. Les ressources portent
un paramètre `?v=` mis à jour à chaque déploiement pour contourner le cache navigateur.

### Liens utiles
- `pari.html?y=hale&x=tax&bet=peu` — rejoue un pronostic précis
- `classement.html?w=3333332` — rejoue une pondération (7 chiffres, somme = 20)
- `#menu` ouvre le tiroir de navigation · `#open` déplie les panneaux du classement
