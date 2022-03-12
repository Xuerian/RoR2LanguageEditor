'use_strict';

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
const OUTPUT = document.getElementById('OUTPUT')
let _PICKUP_VALUE = null

const tpl = name => {
    const e = document.querySelector(`template.${name}`)
    if (!e) {
        throw `template.${name} did not match any element`
    }
    return e.content.firstElementChild.cloneNode(true)
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
const applyFilters = () => {
    if (INPUT_FILTER_KEY.value !== last_key_filter || INPUT_FILTER_VALUE.value !== last_value_filter) {
        last_key_filter = INPUT_FILTER_KEY.value.toLowerCase()
        last_value_filter = INPUT_FILTER_VALUE.value.toLowerCase()
        for (const [key, input] of Object.entries(inputs_by_key)) {
            let hidden = false
            if (last_key_filter && !key.toLowerCase().includes(last_key_filter)) {
                hidden = true
            }
            if (!hidden && last_value_filter && !input.value.toLowerCase().includes(last_value_filter)) {
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
    for (const [file_name, file] of Object.entries(strings_files)) {
        const file_block = tpl('file')
        file_block.querySelector('h2').textContent = file_name
        const section = file_block.querySelector('section')
        for (let [key, value] of Object.entries(file)) {
            if (key.endsWith('_PICKUP')) {
                if (_PICKUP_VALUE == 'copy') {
                    const desc = file[key.replace('_PICKUP', '_DESC')]
                    if (desc) {
                        value = desc
                    }
                }
                else if (_PICKUP_VALUE == 'desc') {
                    if (file[key.replace('_PICKUP', '_DESC')]) {
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
    for (const waiting of document.querySelectorAll('.waiting')) {
        waiting.classList.remove('waiting')
        waiting.classList.add('ready')
    }
    patchFiles_onChange.call(INPUT_FILE_PATCH)
}

const [test_input, test_pair] = newEditorPair('TEST_STRING', '')
test_input.setAttribute('placeholder', 'Test formatting here, it will not be saved or interfere with loaded files')
document.getElementById('TEST').append(test_pair)

function onFilesChange() {
    strings_files = {}
    let waiting = 0
    for (let i = 0; i < this.files.length; i++) {
        const file = this.files[i]
        const reader = new FileReader
        waiting++
        reader.onload = x => {
            waiting--
            strings_files[file.name] = parseBadJSON(x.target.result, file.name).strings
            if (waiting === 0) {
                _PICKUP_VALUE = radioValue('_pickup')
                renderFiles()
            }
        }
        reader.readAsText(file)
    }
}

INPUT_FILE_BASE.addEventListener('change', onFilesChange, false)
onFilesChange.call(INPUT_FILE_BASE)

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
            console.error(`PATCH ERROR: ${file_name}.${key} does not exist.`)
        }
    }
    mergeFiles_onChange.call(INPUT_FILE_MERGE)
}

function patchFiles_onChange()
{
    const file = this.files[0] ?? null
    if (file) {
        const matches = file.name.match(/^(.+)\.patch\.language$/)
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
            alert('Patching expects a *.patch.language file')
            throw "Invalid patch files"
        }
    }
    else {
        mergeFiles_onChange.call(INPUT_FILE_MERGE)
    }
}

// Called after base phase
INPUT_FILE_PATCH.addEventListener('change', patchFiles_onChange)


function mergeFiles_onChange()
{
    for (let i = 0; i < this.files.length; i++) {
        const file = this.files[i]
        if (!file.name.endsWith('txt')) {
            this.value = null
            alert('Merging expects .txt language files')
            throw "Invalid merge files"
        }
        const reader = new FileReader
        reader.onload = x => {
            const to_merge = parseBadJSON(x.target.result, file.name).strings
            if (to_merge) {
                for (const [key, value] of Object.entries(to_merge)) {
                    if (inputs_by_key && inputs_by_key[key]) {
                        inputs_by_key[key].value = value.replace(/\n/g, "\\n")
                        inputs_by_key[key].dispatchEvent(new Event('input'))
                        inputs_by_key[key].dispatchEvent(new Event('change'))
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
INPUT_FILE_MERGE.addEventListener('change', mergeFiles_onChange)

function onFiltersChange() {
    applyFilters()
}

INPUT_FILTER_KEY.addEventListener('input', onFiltersChange, false)
INPUT_FILTER_VALUE.addEventListener('input', onFiltersChange, false)


document.querySelector('button.export').addEventListener('click', () => {
    const zip = new JSZip;
    const folder_patched = zip.folder('patched')
    const output = {}
    const patch = {}

    for (const [file_name, data] of Object.entries(strings_files)) {
        let file_modified = false
        output[file_name] = {}
        for (const key of Object.keys(data)) {
            if (_PICKUP_VALUE === 'desc' && key.endsWith('_PICKUP')) {
                continue
            }

            const input = inputs_by_key[key]
            const value = input.value.replace(/\\n/g, "\n")

            if (input.initialValue && input.value !== input.initialValue) {
                patch[key] = value
                file_modified = true
            }

            if (_PICKUP_VALUE === 'desc' && key.endsWith('_DESC')) {
                file_modified = true
                output[file_name][key.replace('_DESC', '_PICKUP')] = value
            }

            output[file_name][key] = value
        }

        if (file_modified) {
            const str = JSON.stringify({strings: output[file_name]}, null, "\t")
            folder_patched.file(file_name, str)
        }
    }

    if (Object.keys(patch)) {
        const sorted = {}
        Object.keys(patch).sort().forEach(k => sorted[k] = patch[k])
        zip.folder('plugin').folder(patch_name).file(`${patch_name}.patch.language`, JSON.stringify({strings: sorted}, null, "\t"))
    }

    zip.generateAsync({type:"blob"})
        .then(content => saveAs(content, `${patch_name}.ror2language.zip`))
})


function modifiedFilter_onChange()
{
    document.body.classList.toggle('hide-unmodified', radioValue('INPUT_FILTER_MODIFIED') === 'modified')
}

for (const radio of document.querySelectorAll('input[name="INPUT_FILTER_MODIFIED"]')) {
    radio.addEventListener('change', modifiedFilter_onChange)
}
modifiedFilter_onChange()


function showBase_onChange()
{
    document.body.classList.toggle('show-base', this.checked)
}
INPUT_SHOW_BASE.addEventListener('change', showBase_onChange)
showBase_onChange.call(INPUT_SHOW_BASE)
