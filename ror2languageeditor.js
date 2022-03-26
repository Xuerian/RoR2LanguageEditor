'use_strict';

/**
 * RoR2's language files are .. sort of JSON. I'm not sure
 * what they're actually parsed with because any sane JSON
 * parser doesn't like them. But we can fix them up.
 * @param {String} bad Potentially invalid JSON
 * @param {String} identifier Where the JSON came from, for errors
 * @returns {Object} json
 */
const parseBadJSON = (bad, identifier) => {
    const fixed =
        bad
        // Unquoted strings, randomly
        .replace('strings:', '"strings":')
        // Why \B?
        .replace(/\\B/g, "B")
        // Only escape double quotes, because we only use double quotes
        .replace(/\\'/g, "'")
        // Can't end a list with a comma
        .replace(/,(\W+})/g, '$1')
        // Fat fingers
        .replace(/\.,$/gm, ',')
        // Invalid escapes
        .replace(/\\(\*|�)/g, '$1')
        // Un-escaped quotes
        .replace(/(?<=": ".+?)(?<!\\)"(?!,?\s*$)/gm, '\\"')
        // Comments
        .replace(/^[\t ]+\/\/.+$/gm, '')
        // Non-last lines missing commas
        .replace(/"\n(\W+")/g, '",$1')
    try {
        return JSON.parse(fixed)
    }
    catch (error) {
        const matches = error.message.match(/JSON.parse: (.+?) at line (\d+) column (\d+)/)
        if (matches) {
            const [match, message, str_line, str_column] = matches
            const line = Number(str_line)
            const column = Number(str_column)
            const lines = fixed.split('\n')
            console.error(`Error parsing [${identifier}]: ${message} at line ${line} column ${column}`)
            const context = [
                lines[line-2],
                lines[line-1],
                lines[line-1].replace(/[^\t ]/g, ' ').substr(0, column-1)+'^ message',
                lines[line]
            ]
            console.log('Context (Fixed):')
            console.log(context.join('\n'))
            console.log('Context (Raw):')
            console.log(bad.split('\n').slice(line-3, line+1).join('\n'))
            return {}
        }
        else {
            console.error(`Error parsing [${identifier}]`)
            throw error
        }
    }
}

const radioValue = (name) => {
    for (const e of document.querySelectorAll(`input[name=${name}]`)) {
        if (e.checked) {
            return e.value
        }
    }
}

const INPUT_FILE_BASE = document.getElementById('INPUT_FILE_BASE')
const INPUT_FILTER_KEY = document.getElementById('INPUT_FILTER_KEY')
const INPUT_FILTER_VALUE = document.getElementById('INPUT_FILTER_VALUE')
const INPUT_REPLACEMENTS = document.getElementById('INPUT_REPLACEMENTS')
const INPUT_FILE_PATCH = document.getElementById('INPUT_FILE_PATCH')
const INPUT_FILE_MERGE = document.getElementById('INPUT_FILE_MERGE')
const INPUT_SHOW_BASE = document.getElementById('INPUT_SHOW_BASE')
const INPUT_SHOW_LORE = document.getElementById('INPUT_SHOW_LORE')
const OUTPUT = document.getElementById('OUTPUT')
let _PICKUP_VALUE = null

const SUFFIX_FILTERS = {}
for (const checkbox of document.querySelectorAll('input.merge-suffixes')) {
	SUFFIX_FILTERS[checkbox.value] = checkbox
}

/**
 * @param {String} name
 * @returns {HTMLElement}
 */
const tpl = name => {
    const template = document.querySelector(`template.${name}`)
    if (!template) {
        throw `template.${name} did not match any element`
    }
    return template.content.firstElementChild.cloneNode(true)
}

let strings_files = {}
let inputs_by_key = {}
// let replacements = []

const parseMarkup = str => {
    return str
        .replace(/<(style|color)(?:=([^>]+))?>/gi, "<span data-tag='$1' data-value='$2'>")
        .replace(/<\/(style|color)>/gi, '</span>')
        .replace(/(\\n|\n)/g, '<br>')
}

const setPreview = (preview, value) => {
    preview.innerHTML = parseMarkup(value)
    preview.querySelectorAll('span[data-tag=color]').forEach(e => e.style.color = e.getAttribute('data-value'))
    preview.querySelectorAll('span[data-tag=style]').forEach(e => e.classList.add(e.getAttribute('data-value')))
}

let last_key_filter = ''
let last_value_filter = ''
let last_show_lore = INPUT_SHOW_LORE.checked
const applyFilters = () => {
    if (INPUT_FILTER_KEY.value !== last_key_filter || INPUT_FILTER_VALUE.value !== last_value_filter || INPUT_SHOW_LORE !== last_show_lore) {
        last_key_filter = INPUT_FILTER_KEY.value.toLowerCase()
        last_value_filter = INPUT_FILTER_VALUE.value.toLowerCase()
        last_show_lore = INPUT_SHOW_LORE.checked
        for (const [key, input] of Object.entries(inputs_by_key)) {
            let hidden = false
            if (last_key_filter && !key.toLowerCase().includes(last_key_filter)) {
                hidden = true
            }
            else if (!hidden && last_value_filter && !input.value.toLowerCase().includes(last_value_filter)) {
                hidden = true
            }
            else if (!last_show_lore && key.endsWith('_LORE')) {
                hidden = true
            }
            input.pair.classList.toggle('hidden', hidden)
        }
    }
}

let nameMap = {}

const newEditorPair = (key, value) => {
    let baseName = null
    if (key.endsWith('_NAME')) {
        nameMap[key.split('_').slice(0, -1)] = value
        baseName = value
    }
    else {
        baseName = nameMap[key.split('_').slice(0, -1)]
    }
    const pair = tpl('file-pair')
    pair.querySelector('.key').textContent = key
    if (baseName) {
        pair.querySelector('.base-name').textContent = baseName
        pair.setAttribute('base-name', baseName)
    }
    const preview = pair.querySelector('.preview')
    setPreview(preview, value)
    const basePreview = pair.querySelector('.base-preview')
    const baseRaw = pair.querySelector('.base-raw')
    const input = pair.querySelector('input')
    input.value = value.replace(/\n/g, "\\n")
    input.initialValue = input.value
    input.key = key
    input.pair = pair
    input.addEventListener('input', () => {
        setPreview(preview, input.value)
        if (!input.baseInitialized) {
            input.baseInitialized = true
            setPreview(basePreview, input.initialValue)
            baseRaw.textContent = input.initialValue
            pair.querySelector('.revert').addEventListener('click', () => {
                input.value = input.initialValue
                input.dispatchEvent(new Event('input'))
            })
        }
        input.pair.classList.toggle('modified', input.value !== input.initialValue)
    })
    return [input, pair]
}

const renderFiles = () => {
    inputs_by_key = {}
    OUTPUT.innerHTML = ''
    for (const [file_name, file_data] of Object.entries(strings_files)) {
        const file_block = tpl('file')
        file_block.querySelector('h2').textContent = file_name
        const section = file_block.querySelector('section')
        for (let [key, value] of Object.entries(file_data)) {
            if (key.endsWith('_PICKUP')) {
                if (_PICKUP_VALUE == 'copy') {
                    const desc = file_data[key.replace('_PICKUP', '_DESC')]
                    if (desc) {
                        value = desc
                    }
                }
                else if (_PICKUP_VALUE == 'desc') {
                    if (file_data[key.replace('_PICKUP', '_DESC')]) {
                        continue;
                    }
                }
            }
            const [input, pair] = newEditorPair(key, value)
            input.file = file_name
            inputs_by_key[key] = input
            section.append(pair)
        }
        OUTPUT.append(file_block)
    }
	if (Object.keys(inputs_by_key)) {
		document.body.classList.remove('waiting')
		document.body.classList.add('ready')
	}
    patchFilesInput_onChange.call(INPUT_FILE_PATCH)
}

const [test_input, test_pair] = newEditorPair('TEST_STRING', '')
test_input.setAttribute('placeholder', 'Test formatting here, it will not be saved or interfere with loaded files')
document.getElementById('TEST').append(test_pair)

/**
 * @this {HTMLInputElement}
 */
function baseFilesInput_onChange() {
    strings_files = {}
    let waiting = 0
    for (let i = 0; i < this.files.length; i++) {
        const file = this.files[i]

        if (file.name === 'language.json') {
            console.info('Skipping language definition file [language.json]')
            continue
        }
        // To account for windows naming subsequent downloads .patch(1).json, let's try to handle that gracefully ahead of time
        if (file.name.includes('.patch') && file.name.endsWith('.json')) {
            console.info(`Skipping language patch file [${file.name}]`)
            continue
        }

        const reader = new FileReader
        waiting++
        reader.onload = x => {
            waiting--
            const strings = parseBadJSON(x.target.result, file.name).strings
            if (strings) {
                strings_files[file.name] = strings
            }
            else {
                console.error(file.name, x.target.result)
            }
            if (waiting === 0) {
                _PICKUP_VALUE = radioValue('_pickup')
                renderFiles()
            }
        }
        reader.readAsText(file)
    }
}

INPUT_FILE_BASE.addEventListener('change', baseFilesInput_onChange, false)
baseFilesInput_onChange.call(INPUT_FILE_BASE)

let patch_name = 'custom_language'
const applyPatch = patch_json => {
    const patch = parseBadJSON(patch_json, 'Patch file')
    for (const [key, value] of Object.entries(patch.strings)) {
        const input = inputs_by_key[key]
        if (input) {
            input.value = value.replace(/\n/g, "\\n")
            input.dispatchEvent(new Event('input'))
            input.dispatchEvent(new Event('change'))
        }
        else {
            console.log(`PATCH WARNING: [${key}] not in loaded language files`)
        }
    }
    mergeFilesInput_onChange.call(INPUT_FILE_MERGE)
}

/**
 * @this {HTMLInputElement}
 */
function patchFilesInput_onChange()
{
    const file = this.files[0] ?? null
    if (file) {
        const matches = file.name.match(/^(.+)\.patch\.(language|json)$/)
        if (matches) {
            patch_name = matches[1]
            const reader = new FileReader
            reader.onload = result => {
                applyPatch(result.target.result)
            }
            reader.readAsText(file)
        }
        else {
            this.value = null
            alert('Patching expects a *.patch.language/json file')
            throw "Invalid patch files"
        }
    }
    else {
        mergeFilesInput_onChange.call(INPUT_FILE_MERGE)
    }
}

// Called after base phase
INPUT_FILE_PATCH.addEventListener('change', patchFilesInput_onChange)

/**
 * @this {HTMLInputElement}
 */
function mergeFilesInput_onChange()
{
    for (let i = 0; i < this.files.length; i++) {
        const file = this.files[i]
        if (file.name === 'manifest.json' || file.name === 'README.md' || file.name === 'icon.png') {
            console.info('Skipping language pack file', file.name)
            continue
        }
        if (!file.name.endsWith('.txt') && !file.name.endsWith('.language')) {
            this.value = null
            alert('Merging expects .txt or .language language files')
            throw "Invalid merge files"
        }
        const reader = new FileReader
        reader.onload = x => {
            const to_merge = parseBadJSON(x.target.result, file.name).strings
            if (to_merge) {
                for (const [key, value] of Object.entries(to_merge)) {
					const suffix = key.split('_').pop()
					if (suffix && SUFFIX_FILTERS[suffix] && !SUFFIX_FILTERS[suffix].checked) {
						console.info(`MERGE NOTICE: ${file.name}[${key}] skipped, _${suffix} not selected`)
						continue
					}
					const input = inputs_by_key[key]
					if (input) {
						input.value = value.replace(/\n/g, "\\n")
						input.dispatchEvent(new Event('input'))
						input.dispatchEvent(new Event('change'))
					}
                    else if (_PICKUP_VALUE === 'desc' && key.endsWith('_PICKUP')) {
                        console.info(`MERGE NOTICE: ${file.name}[${key}] not applied, "Tooltip text" is set to "Only use description" --`, value)
                    }
                    else {
                        console.warn(`MERGE ERROR: ${file.name}[${key}] does not exist. --`, value)
                    }
                }
            }
        }
        reader.readAsText(file)
    }
    applyFilters()
}

// Called after patching phase
INPUT_FILE_MERGE.addEventListener('change', mergeFilesInput_onChange)

function filterInputs_onChange() {
    applyFilters()
}

INPUT_FILTER_KEY.addEventListener('input', filterInputs_onChange, {passive: true})
INPUT_FILTER_VALUE.addEventListener('input', filterInputs_onChange, {passive: true})
INPUT_SHOW_LORE.addEventListener('input', filterInputs_onChange, {passive: true})


const exportPatch = (output_filename, mimetype)  => {
    const patch = {}
    for (const [file_name, data] of Object.entries(strings_files)) {
        for (const key of Object.keys(data)) {
            if (_PICKUP_VALUE === 'desc' && key.endsWith('_PICKUP')) {
                continue
            }

            const input = inputs_by_key[key]
            const value = input.value.replace(/\\n/g, "\n")

            if (input.initialValue && input.value !== input.initialValue) {
                patch[key] = value
            }
            if (_PICKUP_VALUE === 'desc' && key.endsWith('_DESC')) {
                patch[key.replace('_DESC', '_PICKUP')] = value
            }
        }
    }

    if (Object.keys(patch)) {
        const sorted = {}
        Object.keys(patch).sort().forEach(k => sorted[k] = patch[k])
        const a = document.createElement('a')
        a.href = window.URL.createObjectURL(new Blob([JSON.stringify({strings: sorted}, null, "\t")], {type: mimetype}))
        a.download = output_filename
        a.click()
    }
    else {
        alert('No modifications to save')
    }
}

document.querySelector('button.export-patch').addEventListener('click', () => exportPatch(`zz_${patch_name}.patch.json`, 'application/json'))
document.querySelector('button.export-language').addEventListener('click', () => exportPatch(`${patch_name}.patch.language`, 'text/plain'))


function onlyModifiedToggle_onChange()
{
    document.body.classList.toggle('hide-unmodified', radioValue('INPUT_FILTER_MODIFIED') === 'modified')
}

for (const radio of document.querySelectorAll('input[name="INPUT_FILTER_MODIFIED"]')) {
    radio.addEventListener('change', onlyModifiedToggle_onChange)
}
onlyModifiedToggle_onChange()


function showBaseValue_onChange()
{
    document.body.classList.toggle('show-base', this.checked)
}
INPUT_SHOW_BASE.addEventListener('change', showBaseValue_onChange)
showBaseValue_onChange.call(INPUT_SHOW_BASE)
