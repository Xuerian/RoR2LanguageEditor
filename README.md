# RoR2LanguageEditor
Language file editing tool for Risk of Rain 2

Provides a list of all strings in selected files, presented approximately how they will appear in game

Edit boxes update the preview as you make changes and allow you to export your modified versions of the loaded language files

# Usage
* Open RoR2LanguageEditor in browser of choice (Tested in Firefox)
* Browse for and select one or more language files
* Make and preview changes in page
* Export data to zip file to save modified files (Simpler to make a zip file due to editing multiple files at once)

# Loading with R2API instead of overwriting game files
* Place .language files from export into `Risk of Rain 2\BepInEx\Plugins\{SomeFolder}\*.language`
* These files can subsequently be opened in the editor just like the language .txt files
