# RoR2LanguageEditor
Language file editing tool for Risk of Rain 2

Provides a list of all strings in selected files, presented approximately how they will appear in game

Edit boxes update the preview as you make changes and allow you to export your modified versions of the loaded language files

Base values and a revert button are available below modified values

A common use of custom language files is showing the full description for items and equipment, the Tooltip options make this easy. Simply open Items.txt and Equipment.txt, save, and follow Usage to apply.

# Usage
* Go to https://xuerian.github.io/RoR2LanguageEditor/ or open downloaded index.html
* Browse for and select one or more language files (Base languages are found in steamapps/common/Risk Of Rain 2/Risk of Rain 2_Data/StreamingAssets/Language/en)
* *Optional: Apply .patch.language file*
* *Optional: Merge edited \*.txt language files*
* Make changes and see how they'll look in game as you do
* Save text files zip , extract patched\\*.txt files over the \\*.txt files you opened
* Revalidate in steam to restore the base languages, or back them up yourself instead

# Loading with R2API instead of overwriting game files
* Copy the folder inside plugins/ into BepInEx/Plugins (eg BepInEx/Plugins/custom_language)
