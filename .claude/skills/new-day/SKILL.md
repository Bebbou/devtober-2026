---
name: new-day
description: Démarre un nouveau jour du Devtober. Crée le dossier NN-Nom et la page de doc à partir de _template/. À lancer avec le numéro et le thème, par exemple "/new-day 03 Bloom".
argument-hint: "<numéro> <thème>, ex. 03 Bloom"
---

# Nouveau jour

Arguments : `$ARGUMENTS` (un numéro à deux chiffres, puis le thème). S'il en manque un, le prendre dans `THEMES` de `docs/pages.js` : le jour `n` est `THEMES[n - 1]`. Le thème s'écrit comme dans `THEMES` (ex. `Bloom`).

Trois valeurs servent partout :

- `NN` : le numéro (`03`)
- `Nom` : le thème tel qu'écrit dans `THEMES` (`Bloom`)
- `nom` : le même en minuscules (`bloom`)

## Étapes

1. Vérifier que `NN-Nom/` et `docs/NN-nom.html` n'existent pas. S'ils existent, s'arrêter et le dire.
2. Copier `_template/index.html`, `style.css` et `script.js` dans un nouveau dossier `NN-Nom/`.
3. Copier `_template/doc.html` en `docs/NN-nom.html`.
4. Dans ces quatre fichiers, remplacer `{{NN}}`, `{{Nom}}` et `{{nom}}`. Faire le remplacement en acceptant les fins de ligne LF et CRLF.
5. Vérifier qu'il ne reste aucun `{{` : `grep -rn "{{" NN-Nom docs/NN-nom.html` ne doit rien afficher. Les `À COMPLÉTER` restent, ils se remplissent au fil du jour.
6. Dire à Lino ce qui a été créé.

## À ne pas faire

- Ne pas toucher à `docs/pages.js` ni au `README.md` : une entrée dans `DOCS` marque le jour comme terminé dans le calendrier et sur l'accueil. Cela se fait avec `/finish-day`.
- Ne pas créer de branche ni de commit : Lino s'en occupe (branche `NN/Nom`).
- Si l'idée du jour n'est pas choisie, s'arrêter après la copie et proposer des pistes. Ne pas partir sur un projet sans son accord.

Le code et l'écriture suivent `CLAUDE.md` (direction artistique, pas de framework, pas de tournures « IA »).
