---
name: finish-day
description: Termine un jour du Devtober. Complète la page de doc, ajoute le jour au calendrier (docs/pages.js) et au README, et vérifie qu'il ne reste aucun placeholder. À lancer quand le projet du jour est fini, par exemple "/finish-day 03".
argument-hint: "<numéro>, ex. 03"
---

# Terminer un jour

Argument : `$ARGUMENTS` (le numéro du jour). Le thème et les noms de fichiers se déduisent de `docs/pages.js` et du dossier `NN-Nom/`.

## Étapes

1. **Relire le projet** : le dossier `NN-Nom/` et la page `docs/NN-nom.html`.
2. **Compléter la doc.** Remplacer tous les `À COMPLÉTER` et `{{`. Chaque section décrit ce qui existe, d'après le code (ne rien inventer). Garder les sections utiles seulement : en retirer une vide vaut mieux que la remplir. Chaque section garde son `data-name` pour apparaître dans le sommaire.
3. **Compléter la page du projet** : le `description` du `<head>` et les crédits du pied de page. Créditer tout ce qui n'est pas de Lino (logos, polices, images, bibliothèques).
4. **Ajouter le jour au calendrier.** Dans `DOCS` de `docs/pages.js`, à la suite des autres :
   `{ day: "NN", title: "Nom", href: "NN-nom.html", status: "Terminé" },`
5. **Ajouter la ligne au README**, dans le tableau des projets : ``| NN | Nom | [`NN-Nom`](NN-Nom)``.
6. **Relire les textes** avec les règles d'écriture de `CLAUDE.md`, et lancer :
   `grep -rn -i -E 'vraiment|vrai[es]? |simplement|véritable|—|raison :|À COMPLÉTER|\{\{' NN-Nom docs/NN-nom.html`
7. **Vérifier dans le navigateur** (serveur PHP de `CLAUDE.md`) : la page `docs/` marque le jour comme terminé, la page de doc s'affiche, l'aperçu intégré se charge, la console est vide, et le projet tient à 375 px de large.
8. **Résumer à Lino** les fichiers modifiés et ce qu'il y a à commiter. Ne pas commiter ni pousser.
