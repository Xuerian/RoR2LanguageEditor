# RoR2LanguageEditor
Language file editing tool for Risk of Rain 2

Provides a list of all strings in selected files, presented approximately how they will appear in game

Edit boxes update the preview as you make changes and allow you to export a patch with your changes

Base values and a revert button are available below modified values

A common use of custom language files is showing the full description for items and equipment, the Tooltip options make this easy. Simply open Items.txt and Equipment.txt, save, and follow Usage to apply.

# Usage
* Go to https://xuerian.github.io/RoR2LanguageEditor/ or open downloaded index.html
* Browse for and select one or more language files (Base languages are found in steamapps/common/Risk Of Rain 2/Risk of Rain 2_Data/StreamingAssets/Language/en)
* *Optional: Apply existing .patch.language file*
* *Optional: Merge edited \*.txt language files*
* Make changes and see how they'll look in game as you do
* Save zz_{custom_language}.patch.json into language folder

# Removal
Remove the .patch.json file

# How? Don't I need to replace .txt files?
Risk of Rain 2 loads .json files in each language folder. By adding a file with a name sorted last alphabetically, it will effectively patch the loaded language, without having to overwrite anything

This has the advantage of not breaking immediately if new strings are added, or requiring you to revalidate when you want to remove the patch

# Loading with R2API instead
* Create a BepInEx/Plugins/(Your choice)/ folder and place the .language file in it