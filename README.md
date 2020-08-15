# RoR2LanguageEditor
Language file editing tool for Risk of Rain 2

Provides a list of all strings in selected files, presented approximately how they will appear in game

Edit boxes update the preview as you make changes and allow you to export your modified versions of the loaded language files

A common use of custom language files is showing the full description for items and equipment, the \_PICKUP options provide a shortcut for this

Filters will hide anything not matching both filter inputs

# Usage
* Go to https://xuerian.github.io/RoR2LanguageEditor/ or open index.html in browser of choice (Tested in Firefox)
* Browse for and select one or more language files
* Make changes and see how they'll look in game as you do
* Save text files zip (Easier to save a zip than multiple files), extract en\ files over your game's \en files
* Revalidate in steam to restore the base languages, or back them up yourself instead

# Loading with R2API instead of overwriting game files
* Place .language files from export into `Risk of Rain 2\BepInEx\Plugins\{SomeFolder}\*.language`
* These files can subsequently be opened in the editor just like the language .txt files
* Simply remove the files to stop using them
