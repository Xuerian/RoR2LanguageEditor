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
        // Normalize newlines
        .replace(/\\r\\n/g, '\\n')
        // Unquoted strings, randomly
        .replace('strings:', '"strings":')
        // Can't end a list with a comma
        .replace(/,(\W+})/g, '$1')
        // Fat fingers
        .replace(/\.,$/gm, ',')
        // Invalid escapes
        .replace(/\\(\*|\u201D|\u201C|B|')/g, '$1')
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
            alert(`Error parsing ${identifier}: ${error.message}`)
            return {}
        }
        else {
            alert(`Error parsing ${identifier}: ${error.message}`)
            console.error(`Error parsing [${identifier}]`)
            throw error
        }
    }
}

/**
 * Return a promise for a file as text. Attempts to load as ascii if unexpected output is found (Base game files..)
 * See: https://stackoverflow.com/questions/47914510/how-to-find-out-charset-of-text-file-loaded-by-inputtype-file-in-javascript
 * @param {File} file
 * @param {Boolean} try_ascii
 * @returns {Promise<Object>}
 */
const readStringsFile = (file, try_ascii) => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onerror = reject
        reader.onload = () => {
            if (reader.result.includes("\uFFFD")) {
                console.log(`Loading ${file.name} in ascii compat mode`)
                readStringsFile(file, true).then(resolve).catch(reject)
            }
            else {
                resolve(parseBadJSON(reader.result, file.name).strings)
            }
        }
        reader.readAsText(file, try_ascii ? 'CP1251' : undefined)
    })
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
let sections = {}
let labels_by_key = {}
// let replacements = []

const parseMarkup = str => {
    return str
        .replace(/<(style|color)(?:=([^>]+))?>/gi, "<span data-tag='$1' data-value='$2'>")
        .replace(/<\/(style|color)>/gi, '</span>')
        .replace(/<sprite name="(.+?)"( tint=\d+)?>/gi, "<span data-tag='sprite' class=sprite>SPRITE:$1</span>")
}

const setPreview = (preview, value) => {
    preview.innerHTML = value ? parseMarkup(value) : null
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
            input.closest('.pair').classList.toggle('hidden', hidden)
        }
    }
}

let nameMap = {}

/**
 * @this {HTMLInputElement}
 */
function editor_onInput()
{
    const pair = this.closest('.pair')
    setPreview(pair.querySelector('.preview'), this.value)
    if (!this.baseInitialized) {
        this.baseInitialized = true
        setPreview(pair.querySelector('.base-preview'), this.initialValue)
        pair.querySelector('.base-raw').textContent = this.initialValue
        pair.querySelector('.revert').addEventListener('click', () => {
            this.value = this.initialValue
            this.dispatchEvent(new Event('input'))
        })
    }
    pair.classList.toggle('modified', this.value !== this.initialValue)
    // Resizing with the browser will probably set a width
    if (!this.style.width) {
        this.style.height = '0px'
        this.style.height = `${this.scrollHeight}px`
    }
}

const newEditorPair = (key, value, initially_empty = false) => {
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
    const input = pair.querySelector('textarea')
    input.value = value
    input.initialValue = initially_empty ? '' : value
    input.addEventListener('input', editor_onInput)
    setTimeout(() => editor_onInput.call(input))
    return [input, pair]
}

/**
 * Create or update an editor pair. If file_name is not provided, it either uses the existing section for the key, or places it in the Custom section
 * @param {String|null} file_name File name, if from base language file
 * @param {String} key
 * @param {String} value
 */
const addOrPatchEditorPair = (key, value, file_name) => {
    const label = file_name || labels_by_key[key] || 'Custom'
    // Initialize section
    if (!sections[label]) {
        const block = tpl('file')
        block.querySelector('h2').textContent = label
        sections[label] = block.querySelector('section')
        OUTPUT.append(block)
    }
    // Create pair editor
    if (!inputs_by_key[key]) {
        const [input, pair] = newEditorPair(key, value, !file_name)
        inputs_by_key[key] = input
        labels_by_key[key] = label
        sections[label].append(pair)
        if (!label) {
            input.initialValue = null
        }
    }
    // Update existing editor
    else {
        inputs_by_key[key].value = value
        inputs_by_key[key].dispatchEvent(new Event('input'))
        inputs_by_key[key].dispatchEvent(new Event('change'))
    }
}

const renderFiles = () => {
    inputs_by_key = {}
    OUTPUT.innerHTML = ''
    for (const [file_name, file_data] of Object.entries(strings_files)) {
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
            addOrPatchEditorPair(key, value, file_name)
        }
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
    if (this.files.length) {
        Promise.all(
            Array.from(this.files)
            .filter(file => {
                if (file.name === 'language.json') {
                    console.info('Skipping language definition file [language.json]')
                    return false
                }
                // To account for windows naming subsequent downloads .patch(1).json, let's try to handle that gracefully ahead of time
                if (file.name.includes('.patch') && file.name.endsWith('.json')) {
                    console.info(`Skipping language patch file [${file.name}]`)
                    return false
                }
                return true
            })
            .map(file => readStringsFile(file).then(strings => {
                if (strings) {
                    strings_files[file.name] = strings
                }
            }))
        )
        .then(() => {
            _PICKUP_VALUE = radioValue('_pickup')
            renderFiles()
        })
    }
}

INPUT_FILE_BASE.addEventListener('change', baseFilesInput_onChange, false)
baseFilesInput_onChange.call(INPUT_FILE_BASE)

let patch_name = 'custom_language'

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
            readStringsFile(file).then(strings => {
                for (const [key, value] of Object.entries(strings)) {
                    if (!labels_by_key[key]) {
                        console.log(`PATCH: Adding Custom pair`, key, value)
                    }
                    addOrPatchEditorPair(key, value)
                }
                mergeFilesInput_onChange.call(INPUT_FILE_MERGE)
            })
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
    if (this.files.length) {
        Promise.all(
            Array.from(this.files)
            .filter(file => {
                if (file.name === 'manifest.json' || file.name === 'README.md' || file.name === 'icon.png') {
                    console.info('Skipping language pack file', file.name)
                    return false
                }
                if (!file.name.endsWith('.txt') && !file.name.endsWith('.language')) {
                    this.value = null
                    alert('Merging expects .txt or .language language files')
                    return false
                }
                return true
            })
            .map(file => readStringsFile(file).then(to_merge => {
                if (to_merge) {
                    for (const [key, value] of Object.entries(to_merge)) {
                        const suffix = key.split('_').pop()
                        if (suffix && SUFFIX_FILTERS[suffix] && !SUFFIX_FILTERS[suffix].checked) {
                            console.info(`MERGE NOTICE: ${file.name}[${key}] skipped, _${suffix} not selected`)
                            continue
                        }
                        if (labels_by_key[key]) {
                            addOrPatchEditorPair(key, value)
                        }
                        else if (_PICKUP_VALUE === 'desc' && key.endsWith('_PICKUP')) {
                            console.info(`MERGE NOTICE: ${file.name}[${key}] not applied, "Tooltip text" is set to "Only use description" --`, value)
                        }
                        else {
                            console.log(`MERGE ${file.name}: Adding custom pair`, key, value)
                            addOrPatchEditorPair(key, value)
                        }
                    }
                }
            }))
        ).then(applyFilters)
    }
    else {
        applyFilters()
    }
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
    for (const [key, input] of Object.entries(inputs_by_key)) {
        if (_PICKUP_VALUE === 'desc' && key.endsWith('_PICKUP')) {
            continue
        }

        const value = input.value.replace(/\\n/g, "\n")

        if (labels_by_key[key] === 'Custom' || input.value !== input.initialValue) {
            patch[key] = value
        }
        if (_PICKUP_VALUE === 'desc' && key.endsWith('_DESC')) {
            patch[key.replace('_DESC', '_PICKUP')] = value
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
