const { spawn, exec } = require("child_process");
const path = require("path");
const os = require("os");
const fs = require("fs");

const sugoi_root = path.resolve('./../../..')

const $ = document.querySelector.bind(document);
const createElement = document.createElement.bind(document);

let consoleView = $("#console-view");
let consoleInput = $("#console-input");
let consoleTabs = $("#console-tabs");
let consoleSelector = $("#console-selector");
let consoleFilterErrorToggle = $("#console-filter-error-toggle");
let killProgramButton = $("#kill-program");
let copyLogButton = $("#copy-log");

let consoleLogLimit = 2000;
let consoleLog = [];

const getCurrentConsoleTab = () => consoleSelector.value || "all";
const getFilterState = () => consoleFilterErrorToggle.checked;

function getMaxScrollTop() {
    return consoleView.scrollHeight - consoleView.clientHeight;
}

let currentlySelectedProcess = null;
function refreshConsoleView(filterProgram, filterError) {
    let isOneProcess = active_processes.has(filterProgram)
    let scrollWhenDone = consoleView.scrollTop === getMaxScrollTop();
    let text = "";
    for (let line of consoleLog) {
        if (filterError && !line.err) continue; // Skip non-error lines if filter is active
        if (filterProgram !== "all" && line.program !== filterProgram && line.group !== filterProgram) continue; // Skip lines not matching the current tab
        text += `\n${line.text}`;
    }
    consoleView.textContent = text;
    killProgramButton.disabled = active_processes.size === 0

    if (isOneProcess) {
        consoleInput.disabled = false; // Enable input if we're viewing a specific process
        consoleInput.value = "";
        currentlySelectedProcess = filterProgram;
    } else {
        consoleInput.disabled = true; // Disable input if we're viewing all processes or a group
        consoleInput.value = "Select a process to enable input.";
        currentlySelectedProcess = null;
    }
    if (scrollWhenDone) { consoleView.scrollTop = getMaxScrollTop(); } // Scroll to the bottom if it was already at the bottom before
}

function addConsoleLine(text, program, err, group = null) {
    if (consoleLog.length >= consoleLogLimit) {
        consoleLog.shift(); // Remove the oldest line if we exceed the limit
    }
    const line = { text, program, err, group };
    consoleLog.push(line);

    if (getFilterState() && !err) { return } // Skip non-error lines if filter is active
    if (getCurrentConsoleTab() !== "all" && getCurrentConsoleTab() !== program && getCurrentConsoleTab() !== group) { return } // Skip lines not matching the current tab

    let scrollWhenDone = consoleView.scrollTop === getMaxScrollTop();
    consoleView.textContent += `\n${text}`;
    if (scrollWhenDone) { consoleView.scrollTop = getMaxScrollTop(); } // Scroll to the bottom if it was already at the bottom before
}

consoleSelector.addEventListener("change", () => {
    refreshConsoleView(getCurrentConsoleTab(), getFilterState());
});
consoleFilterErrorToggle.addEventListener("change", () => {
    refreshConsoleView(getCurrentConsoleTab(), getFilterState());
});
consoleInput.addEventListener("keyup", (event) => {
    if (event.key === "Enter") {
        const inputText = consoleInput.value
        if (!currentlySelectedProcess) { return addConsoleLine("No process selected to send input to.", "System", true); }
        const proc = active_processes.get(currentlySelectedProcess);
        if (!proc) { return addConsoleLine(`No active process named "${currentlySelectedProcess}" to send input to.`, "System", true); }

        proc.stdin.write(inputText + "\n"); // Send input to the process
        addConsoleLine(`> ${inputText}`, currentlySelectedProcess, false);
        consoleInput.value = ""; // Clear the input field
        if (getMaxScrollTop() - consoleView.scrollTop < 50) { // If we're near the bottom of the console
            consoleView.scrollTop = getMaxScrollTop(); // Scroll to the bottom
        }
    }
});

function killProc(proc) {
    if (os.platform() === "win32") {
        exec(`taskkill /F /T /pid ${proc.pid}`);
    } else {
        proc.kill();
    }
}
//kill all processes on unload (reloading the page / closing the app)
window.addEventListener('beforeunload', () => {
    for (let proc of active_processes.values()) {
        killProc(proc);
    }
})

function killProcOrGroup(targ) {
    if (active_process_groups.has(targ)) {
        const processes = active_process_groups.get(targ);
        for (let proc of processes) {
            killProc(proc);
        }
        addConsoleLine(`Killed process group: ${targ}`, "System", false);
    }
    if (active_processes.has(targ)) {
        const proc = active_processes.get(targ);
        killProc(proc);
        addConsoleLine(`Killed program: ${targ}`, "System", false);
    }
    if (!active_processes.has(targ) && !active_process_groups.has(targ)) {
        addConsoleLine(`No active program or group named "${targ}" to kill.`, "System", true);
    }
}

killProgramButton.addEventListener("click", () => {
    const selectedProgram = getCurrentConsoleTab();
    if (selectedProgram === "all") {
        for (let [name, program] of active_processes) {
            killProc(program);
            addConsoleLine(`Killed program: ${name}`, "System", false);
        }
        return;
    }
    killProcOrGroup(selectedProgram);
})

copyLogButton.addEventListener("click", () => {
    const currentTab = getCurrentConsoleTab();
    // const textToCopy = consoleLog.map(line => `[${line.program}${line.group ? ` (${line.group})` : ""}] ${line.text}`).join("\n");
    const textToCopy = consoleLog
        .filter(line => (currentTab === "all" || line.program === currentTab || line.group === currentTab) && (!getFilterState() || line.err))
        .map(line => `[${line.program}${line.group ? ` (${line.group})` : ""}] ${line.text}`)
        .join("\n");

    navigator.clipboard.writeText(textToCopy).then(() => {
        addConsoleLine("Console log copied to clipboard.", "System", false);
    }).catch(err => {
        addConsoleLine(`Failed to copy log: ${err}`, "System", true);
    });
});

function addSystemConsoleLine(text) {
    addConsoleLine(text, "System", false);
}

String.raw`
  _       _   _   _   _   _         
 /_' / / /_) /_/ /_/ /_/ /_' /_/ / /
._/ /_/ /_) / / / \ / / ._/ / / / / 
                                    
  __  _   _      __  __      _      
 /_  /_/ / / /|/ /  /_  /|/ / |     
/   / \ /_/ / | /  /_  / | /_.'     
                                    
     _   _   _   __  _              
 /  / / /_/ / | /_  / |             
/_,/_/ / / /_.'/_  /_.'             
`
    .split("\n").forEach((v, i) => i ? addSystemConsoleLine(v) : 0)
addSystemConsoleLine(`Man cannot live on bread alone, he must also have high-speed internet.`)

const active_processes = new Map();
const active_process_groups = new Map();

function forceSelectProgram(program) {
    if (program === "all") {
        consoleSelector.value = "all";
        refreshConsoleView("all", getFilterState());
        return;
    }
    if (active_processes.has(program)) {
        consoleSelector.value = program;
        refreshConsoleView(program, getFilterState());
    }
    if (active_process_groups.has(program)) {
        consoleSelector.value = program;
        refreshConsoleView(program, getFilterState());
    }

}

function refreshActivePrograms() {
    let old_selected = consoleSelector.value; // Store the currently selected program

    consoleSelector.innerHTML = ""; // Clear the current options
    //add the default "all" option
    let allOption = createElement("option");
    allOption.value = "all";
    allOption.textContent = active_processes.size === 0 ? "--No processes active--" : "All Active Programs";
    consoleSelector.appendChild(allOption);
    // Add options for each active process group
    for (let [groupName, group] of active_process_groups) {
        let option = createElement("option");
        option.value = groupName;
        option.textContent = `${groupName} (${group.size} processes)`;
        consoleSelector.appendChild(option);
    }
    // Add a separator for clarity
    if (active_process_groups.size > 0) {
        let separator = createElement("option");
        separator.disabled = true;
        separator.textContent = "------------------";
        consoleSelector.appendChild(separator);
    }
    // Add options for each active program
    for (let [name, program] of active_processes) {
        let option = createElement("option");
        option.value = name;
        option.textContent = name;
        consoleSelector.appendChild(option);
    }

    if (active_processes.has(old_selected)) {
        consoleSelector.value = old_selected; // Restore the previously selected program if it still exists
    } else {
        forceSelectProgram("all"); // If the old selected program is not active, force select "all"
    }

}
function start_program(target, args, name, process_group = null) {
    const child = spawn(target, args, { shell: true, detached: false, cwd: path.dirname(target) });
    active_processes.set(name, child);
    if (process_group) {
        if (!active_process_groups.has(process_group)) {
            active_process_groups.set(process_group, new Set());
        }
        active_process_groups.get(process_group).add(child);
    }
    refreshActivePrograms();

    child.stderr.on("data", (data) => {
        addConsoleLine(`[ERROR]: ${data}`, name, true, process_group);
    });
    child.stdout.on("data", (data) => {
        addConsoleLine(data.toString(), name, false, process_group);
        if (data.toString().includes("Press Enter to continue...")) {
            //focus this process in the console when user input is requested
            forceSelectProgram(name);
        }
    });
    child.on("close", (code) => {
        addConsoleLine(`Program ${name} exited with code ${code}`, name, false, process_group);
        active_processes.delete(name);
        if (process_group && active_process_groups.has(process_group)) {
            active_process_groups.get(process_group).delete(child);
            if (active_process_groups.get(process_group).size === 0) {
                active_process_groups.delete(process_group);
            }
        }
        refreshActivePrograms();
    });
}

const optionsContainer = $("#options-container");

function createProgramCategory(name) {
    const categoryContainer = createElement("div");
    categoryContainer.className = "program-group";
    const categoryTitle = createElement("h3");
    categoryTitle.textContent = name;
    categoryContainer.appendChild(categoryTitle);
    optionsContainer.appendChild(categoryContainer);
    return categoryContainer;
}
const vnCategory = createProgramCategory("VN Tools");
const sugoiFileTranslatorCategory = createProgramCategory("Sugoi File Translator");
const sugoiMangaOcrCategory = createProgramCategory("Sugoi Manga OCR");
const lightNovelTranslatorCategory = createProgramCategory("Light Novel Translator");
const translationServerCategory = createProgramCategory("Translation Server");
const translationWindowCategory = createProgramCategory("Translation Window");
const settingsCategory = createProgramCategory("Settings");

function highlightCategory(category) {
    // Remove highlight from all categories
    const allCategories = document.querySelectorAll(".program-group");
    allCategories.forEach(cat => cat.classList.remove("highlighted"));
    allCategories.forEach(cat => cat.querySelectorAll("button").forEach(btn => btn.disabled = true)); // Disable all buttons in other categories

    // Highlight the selected category
    category.classList.add("highlighted");
    category.querySelectorAll("button").forEach(btn => btn.disabled = false); // Enable buttons in the highlighted category
}
function unhighlightAllCategories() {
    const allCategories = document.querySelectorAll(".program-group");
    allCategories.forEach(cat => cat.classList.remove("highlighted"));
    allCategories.forEach(cat => cat.querySelectorAll("button").forEach(btn => btn.disabled = false)); // Enable all buttons in all categories
}


let pending_fn_list = []
let doNotRequireNextCategory = false; // Flag to skip the next category requirement check
function createButton(text, fn, category, otherRequiredCategory = null, requiresOtherCategoryStrictOnce = false) {
    const button = createElement("button");
    button.className = "button";
    button.textContent = text;
    button.addEventListener("click", () => {
        unhighlightAllCategories();
        if (otherRequiredCategory && !doNotRequireNextCategory) {
            addConsoleLine(`Cannot start ${text} without activating ${otherRequiredCategory.children[0].textContent}.`, "System", true);
            highlightCategory(otherRequiredCategory);
            pending_fn_list.push(fn)
            doNotRequireNextCategory = requiresOtherCategoryStrictOnce; // Set the flag to skip the next category requirement check
            return;
        }
        doNotRequireNextCategory = false; // Reset the flag for future clicks
        while (pending_fn_list.length > 0) {
            pending_fn_list.pop()(); // Execute all pending functions
        }
        fn();
    });
    category.appendChild(button);
    return button;
}

function changeServerType(translatorChosen) {
    let userSettings = fs.readFileSync(path.join(sugoi_root, "Code", "User-Settings.json"), "utf8");
    userSettings = JSON.parse(userSettings);
    userSettings["Translation_API_Server"]["current_translator"] = translatorChosen
    userSettings["Sugoi_Japanese_Translator"]["currentTranslator"] = translatorChosen
    fs.writeFileSync(path.join(sugoi_root, "Code", "User-Settings.json"), JSON.stringify(userSettings, null, 4), "utf8");
    addConsoleLine(`Changed translation server to: ${translatorChosen}`, "System", false);
}

const program_data = {
    "Textractor x64": {
        path: path.join(sugoi_root, "Code", "Textractor", "x64", "Textractor.exe"),
        args: [],
        category: vnCategory,
        requiresOtherCategory: translationWindowCategory
    },
    "Textractor x86": {
        path: path.join(sugoi_root, "Code", "Textractor", "x86", "Textractor.exe"),
        args: [],
        category: vnCategory,
        requiresOtherCategory: translationWindowCategory
    },
    "Visual Novel OCR": {
        isGroup: true,
        children: {
            "VN OCR Interface": { path: path.join(sugoi_root, "Code", "userInterface", "Visual-Novel-OCR", "userInterface.exe"), args: [] },
            "VN OCR Backend": { path: path.join(sugoi_root, "Code", "backendServer", "Program-Backend", "Visual-Novel-OCR", "activateBackendServer.bat"), args: [] },
            "VN OCR Vision": { path: path.join(sugoi_root, "Code", "backendServer", "Program-Backend", "Visual-Novel-OCR", "activateComputerVision.bat"), args: [] },
            "VN OCR API": { path: path.join(sugoi_root, "Code", "backendServer", "Modules", "OCR-API-Server", "activate.bat"), args: [] }
        },
        requiresOtherCategory: translationWindowCategory,
        category: vnCategory
    },

    "Translation Server Offline": {
        path: path.join(sugoi_root, "Code", "Translation-API-Server.bat"),
        fn: changeServerType.bind(null, "Offline"),
        args: ["Offline"],
        category: translationServerCategory
    },
    "Translation Server DeepL": {
        isGroup: true,
        children: {
            "DeepL P1": { path: path.join(sugoi_root, "Code", "backendServer", "Modules", "Translation-API-Server", "DeepL", "activate_server.bat"), args: [] },
            "DeepL P2": { path: path.join(sugoi_root, "Code", "backendServer", "Modules", "Translation-API-Server", "DeepL", "activate_deepL.bat"), args: [] }
        },
        fn: changeServerType.bind(null, "DeepL"),
        category: translationServerCategory
    },
    "Translation Server Google": {
        path: path.join(sugoi_root, "Code", "Translation-API-Server.bat"),
        fn: changeServerType.bind(null, "Google"),
        args: ["Google"],
        category: translationServerCategory
    },
    "Translation Server LLM": {
        path: path.join(sugoi_root, "Code", "Translation-API-Server.bat"),
        fn: changeServerType.bind(null, "LLM"),
        args: ["LLM"],
        category: translationServerCategory
    },

    "Sugoi Translator Window": {
        isGroup: true,
        children: {
            "Translator Window Server": { path: path.join(sugoi_root, "Code", "backendServer", "Program-Backend", "Sugoi-Japanese-Translator", "activate.bat"), args: [] },
            "Translator Window Interface": { path: path.join(sugoi_root, "Code", "userInterface", "Sugoi-Japanese-Translator", "userInterface.exe"), args: [] },
        },
        requiresOtherCategory: translationServerCategory,
        category: translationWindowCategory
    },

    "Sugoi File Translator": {
        path: path.join(sugoi_root, "Code", "userInterface", "Sugoi-File-Translator", "userInterface.exe"),
        args: [],
        category: sugoiFileTranslatorCategory,
        requiresOtherCategory: translationServerCategory
    },

    "Sugoi Audio/Video Translator": {
        isGroup: true,
        children: {
            "Audio/Video Transcription Server": { path: path.join(sugoi_root, "Code", "backendServer", "Program-Backend", "Sugoi-Audio-Video-Translator", "activateTranscriptionServer.bat"), args: [] },
            "Audio/Video Processor": { path: path.join(sugoi_root, "Code", "backendServer", "Program-Backend", "Sugoi-Audio-Video-Translator", "activate_processor.bat"), args: [] }
        },
        requiresOtherCategory: translationServerCategory,
        category: sugoiFileTranslatorCategory
    },

    "Sugoi Manga OCR": {
        isGroup: true,
        children: {
            "Manga OCR Interface": { path: path.join(sugoi_root, "Code", "userInterface", "Sugoi-Manga-OCR", "userInterface.exe"), args: [] },
            "Manga OCR Backend": { path: path.join(sugoi_root, "Code", "backendServer", "Program-Backend", "Sugoi-Manga-OCR", "activate.bat"), args: [] },
            "Manga OCR Python Server": { path: path.join(sugoi_root, "Code", "backendServer", "Program-Backend", "Sugoi-Manga-OCR", "activatePythonServer.bat"), args: [] },
            "Manga OCR Clipboard Listener": { path: path.join(sugoi_root, "Code", "backendServer", "Program-Backend", "Sugoi-Manga-OCR", "activateClipboardListener.bat"), args: [] },
            "Manga OCR API": { path: path.join(sugoi_root, "Code", "backendServer", "Modules", "OCR-API-Server", "activate_manga_ocr.bat"), args: [] }
        },
        requiresOtherCategory: translationWindowCategory,
        category: sugoiMangaOcrCategory
    },

    "Sugoi Manhwa OCR": {
        isGroup: true,
        children: {
            "Translation Server Korean": { path: path.join(sugoi_root, "Code", "backendServer", "Modules", "Translation-API-Server", "Google", "activate.bat"), args: [] },
            "Manhwa OCR Interface": { path: path.join(sugoi_root, "Code", "userInterface", "Sugoi-Manga-OCR", "userInterface.exe"), args: [] },
            "Manhwa OCR Backend": { path: path.join(sugoi_root, "Code", "backendServer", "Program-Backend", "Sugoi-Manga-OCR", "activate.bat"), args: [] },
            "Manhwa OCR Python Server": { path: path.join(sugoi_root, "Code", "backendServer", "Program-Backend", "Sugoi-Manga-OCR", "activatePythonServer.bat"), args: [] },
            "Manhwa OCR Clipboard Listener": { path: path.join(sugoi_root, "Code", "backendServer", "Program-Backend", "Sugoi-Manga-OCR", "activateClipboardListener.bat"), args: [] },
            "Manhwa OCR API": { path: path.join(sugoi_root, "Code", "backendServer", "Modules", "OCR-API-Server", "activate_korean.bat"), args: [] }
        },
        fn: changeServerType.bind(null, "Google"),
        requiresOtherCategory: translationWindowCategory,
        requiresOtherCategoryStrictOnce: true, // This is a special case where the translation server will already be running, so we don't need the translation window category to request it again.
        category: sugoiMangaOcrCategory
    },

    "Manga Rikai OCR": {
        isGroup: true,
        children: {
            "Manga Rikai OCR Interface": { path: path.join(sugoi_root, "Code", "userInterface", "Manga-Rikai-OCR", "activateUserInterface.bat"), args: [] },
            "Manga Rikai OCR API": { path: path.join(sugoi_root, "Code", "backendServer", "Modules", "OCR-API-Server", "activate_manga_ocr.bat"), args: [] },
            "Manga Rikai Text Detection Server": { path: path.join(sugoi_root, "Code", "backendServer", "Modules", "Text_Detection_Server", "CRAFT", "activate.bat"), args: [] },
            "Manga Rikai OCR Backend": { path: path.join(sugoi_root, "Code", "backendServer", "Program-Backend", "Manga-Rikai-OCR", "activateBackendServer.bat"), args: [] },
            "Manga Rikai OCR Computer Vision": { path: path.join(sugoi_root, "Code", "backendServer", "Program-Backend", "Manga-Rikai-OCR", "activateComputerVision.bat"), args: [] }
        },
        requiresOtherCategory: translationServerCategory,
        category: sugoiMangaOcrCategory,
    },

    "Manga Batch Translator": {
        isGroup: true,
        children: {
            "Manga Batch Translator OCR Server": { path: path.join(sugoi_root, "Code", "backendServer", "Modules", "OCR-API-Server", "activate_manga_ocr.bat"), args: [] },
            "Manga Batch Translator Text Detection Server": { path: path.join(sugoi_root, "Code", "backendServer", "Modules", "Text_Detection_Server", "CRAFT", "activate.bat"), args: [] },
            "Manga Batch Translator Backend": { path: path.join(sugoi_root, "Code", "backendServer", "Program-Backend", "Manga-Batch-Translator", "activate.bat"), args: [] },
        },
        requiresOtherCategory: translationServerCategory,
        category: sugoiMangaOcrCategory
    },

    "Light Novel Image Translator": {
        isGroup: true,
        children: {
            "Light Novel Image Translator OCR Server": { path: path.join(sugoi_root, "Code", "backendServer", "Modules", "OCR-API-Server", "activate_Japanese_Vertical.bat"), args: [] },
            "Light Novel Image Translator Backend": { path: path.join(sugoi_root, "Code", "backendServer", "Program-Backend", "Light-Novel-Image-Translator", "activate.bat"), args: [] }
        },
        requiresOtherCategory: translationServerCategory,
        category: lightNovelTranslatorCategory
    },

    "Light Novel EPUB Translator": {
        path: path.join(sugoi_root, "Code", "backendServer", "Program-Backend", "Light-Novel-EPUB-Translator", "activate.bat"),
        args: [],
        category: lightNovelTranslatorCategory,
        requiresOtherCategory: translationServerCategory
    },

    "Japanese Dictionary": {
        path: path.join(sugoi_root, "Code", "Japanese-Dictionary", "TranslationAggregator.exe"),
        args: [],
        category: settingsCategory
    },

}

function createProgramButton(name, path, args, category, otherRequiredCategory = null, extraFn = null, requiresOtherCategoryStrictOnce) {
    const button = createButton(name, () => {
        if (extraFn) { extraFn(); }
        if (active_processes.has(name)) {
            addConsoleLine(`Program ${name} is already running.`, "System", false);
            return;
        }
        start_program(path, args, name);
        addConsoleLine(`Starting program: ${name}`, name, false);
    }, category, otherRequiredCategory, requiresOtherCategoryStrictOnce);
    return button;
}
function createProgramGroupButton(name, programs, category, otherRequiredCategory = null, extraFn = null, requiresOtherCategoryStrictOnce = false) {
    const button = createButton(name, () => {
        if (extraFn) { extraFn(); }
        for (const [progName, progData] of Object.entries(programs)) {
            if (active_processes.has(progName)) {
                addConsoleLine(`Program ${progName} is already running.`, "System", false, name);
                continue;
            }
            start_program(progData.path, progData.args, progName, name);
            addConsoleLine(`Starting program: ${progName}`, progName, false, name);
        }
    }, category, otherRequiredCategory, requiresOtherCategoryStrictOnce);
    return button;
}

for (const [name, data] of Object.entries(program_data)) {
    if (data.isGroup) {
        const groupButton = createProgramGroupButton(name, data.children, data.category, data.requiresOtherCategory, data.fn, data.requiresOtherCategoryStrictOnce);
    } else {
        const programButton = createProgramButton(name, data.path, data.args, data.category, data.requiresOtherCategory, data.fn);
    }
}

const settingsButton = createButton("Settings", () => {
    openSettingsMenu();
}, settingsCategory);

function openSettingsMenu() {
    $("#configuration-container").classList.add("opened");
    populateConfigurationContainer();


    // // This function should open the settings menu, which is not implemented
    // // instead, open the text editor to edit the User Settings file directly
    // start_program(
    //     path.join(sugoi_root, "Code", "Edit-User-Settings.bat"),
    //     [],
    //     "Edit User Settings"
    // );
}

const specialBehaviors = {
    "cudaCheck": function (selectedDevice) {
        if (selectedDevice !== "cuda") { return true; } // If the selected device is not CUDA, skip the check
        //check if the cuda files are present in the Power-Source/Python39 directory
        const check_dir = path.join(sugoi_root, "Code", "Power-Source", "Python39");
        const files_to_check = ["cublas64_12.dll", "cublasLt64_12.dll", "cudnn_cnn_infer64_8.dll", "cudnn_ops_infer64_8.dll"];
        let allFilesPresent = true;
        for (const file of files_to_check) {
            if (!fs.existsSync(path.join(check_dir, file))) {
                allFilesPresent = false;
                break;
            }
        }
        if (!allFilesPresent) {
            addConsoleLine("CUDA files are missing. Please install the CUDA toolkit.", "System", true);
            addConsoleLine("There is a CUDA installation script in Sugoi-Toolkit/GPU_INSTALLATION_INSIDE.", "System", false);
            forceSelectProgram("all");
        }
        return allFilesPresent;
    },
    "selectCurrentTranslator": function (translatorMapping) {
        let userSettings = fs.readFileSync(path.join(sugoi_root, "Code", "User-Settings.json"), "utf8");
        userSettings = JSON.parse(userSettings);
        currentTranslator = userSettings["Translation_API_Server"]["current_translator"];
        if (!translatorMapping[currentTranslator]) {
            addConsoleLine(`Current translator "${currentTranslator}" is not available.`, "System", true);
            return;
        }
        translatorMapping[currentTranslator].click(); // Simulate a click on the button for the current translator
    }
}

function populateConfigurationContainer() {
    const configContainer = $("#configuration-container");
    configContainer.innerHTML = ""; // Clear previous content

    const userSettings = JSON.parse(fs.readFileSync(path.join(sugoi_root, "Code", "User-Settings.json"), "utf8"));
    function saveUserSettings() {
        fs.writeFileSync(path.join(sugoi_root, "Code", "User-Settings.json"), JSON.stringify(userSettings, null, 4), "utf8");
    }
    //key format: Translation_API_Server.Offline.HTTP_port_number
    function getUserSetting(key) {
        const keys = key.split(".");
        let obj = userSettings;
        for (const k of keys) {
            if (obj.hasOwnProperty(k)) {
                obj = obj[k];
            } else {
                return null; // Key not found
            }
        }
        return obj;
    }
    function setUserSetting(key, value) {
        const keys = key.split(".");
        let obj = userSettings;
        for (let i = 0; i < keys.length - 1; i++) {
            const k = keys[i];
            if (obj.hasOwnProperty(k)) {
                obj = obj[k];
            } else {
                return null; // Key not found
            }
        }
        const lastKey = keys[keys.length - 1];
        if (obj.hasOwnProperty(lastKey)) {
            obj[lastKey] = value; // Update the value
            saveUserSettings(); // Save the updated settings
            addConsoleLine(`Updated setting: ${key} = ${value}`, "System", false);
        } else {
            return null; // Key not found
        }
    }

    const settingsDefinition = JSON.parse(fs.readFileSync(path.join(sugoi_root, "Code", "userInterface", "Menu-Interface", "resources", "app", "menuWindow", "subarashii_userSettingsDefinition.json"), "utf8"));

    let labelLevel = 0; // Start with h1 for the main title

    function createConfigItem(itemToCreate, container = configContainer) {
        labelLevel++;
        // Ensure label level is within the range of h1 to h6
        let clampedLabelLevel = Math.max(1, Math.min(labelLevel, 6));

        const label = createElement(`h${clampedLabelLevel}`);
        label.textContent = itemToCreate.label;
        label.className = "config-label";
        label.title = itemToCreate.toolTip || "";
        container.appendChild(label);

        switch (itemToCreate.type) {
            case "category":
                const childItems = itemToCreate.children || [];
                childItems.forEach((child) => createConfigItem(child));
                break;
            case "tabbed":
                const tabContainer = createElement("div");
                tabContainer.className = "tabbed-container";
                const tabMapping = {}
                for (const tab of Object.keys(itemToCreate.children)) {
                    const tabButton = createElement("button");
                    tabButton.textContent = tab;
                    tabButton.className = "tab-button";
                    tabMapping[tab] = tabButton;

                    const tabContent = createElement("div");
                    tabContent.className = "tab-content";
                    tabContainer.appendChild(tabContent);

                    for (const child of itemToCreate.children[tab]) {
                        createConfigItem(child, tabContent);
                    }

                    tabButton.addEventListener("click", () => {
                        const allTabs = tabContainer.querySelectorAll(".tab-content");
                        allTabs.forEach(t => t.style.display = "none"); // Hide all tabs
                        tabContent.style.display = "block"; // Show the clicked tab
                    });
                    container.appendChild(tabButton);
                }
                container.appendChild(tabContainer);

                // Show the first tab by default
                const firstTab = Object.values(tabMapping)[0];
                if (firstTab) {
                    firstTab.click(); // Simulate a click on the first tab
                }

                if (itemToCreate.specialPostGenerationBehavior) {
                    const specialBehavior = specialBehaviors[itemToCreate.specialPostGenerationBehavior];
                    if (specialBehavior) {
                        specialBehavior(tabMapping);
                    } else {
                        addConsoleLine(`Special behavior "${itemToCreate.specialPostGenerationBehavior}" not found.`, "System", true);
                    }
                }

                break;

            case "text":
                const textInput = createElement("input");
                textInput.type = "text";
                let currentValue = getUserSetting(itemToCreate.settingsPath);
                if (currentValue === null || currentValue === undefined) {
                    addConsoleLine(`Setting "${itemToCreate.settingsPath}" not found.`, "System", true);
                }
                currentValue = currentValue || "";
                textInput.value = currentValue;
                textInput.className = "config-text-input";
                textInput.addEventListener("change", () => {
                    setUserSetting(itemToCreate.settingsPath, textInput.value);
                });
                container.appendChild(textInput);
                break;

            case "number":
                const numberInput = createElement("input");
                numberInput.type = "number";
                let currentNumberValue = getUserSetting(itemToCreate.settingsPath);
                if (currentNumberValue === null || currentNumberValue === undefined) {
                    addConsoleLine(`Setting "${itemToCreate.settingsPath}" not found.`, "System", true);
                }
                currentNumberValue = currentNumberValue || 0;
                numberInput.value = currentNumberValue;
                numberInput.className = "config-number-input";
                numberInput.addEventListener("change", () => {
                    let itemValue = parseFloat(numberInput.value);
                    itemValue = Math.max(itemValue, itemToCreate.range[0]);
                    itemValue = Math.min(itemValue, itemToCreate.range[1]);
                    setUserSetting(itemToCreate.settingsPath, itemValue);
                });
                container.appendChild(numberInput);
                break;

            case "integer":
                const integerInput = createElement("input");
                integerInput.type = "number";
                let currentIntegerValue = getUserSetting(itemToCreate.settingsPath);
                if (currentIntegerValue === null || currentIntegerValue === undefined) {
                    addConsoleLine(`Setting "${itemToCreate.settingsPath}" not found.`, "System", true);
                }
                currentIntegerValue = currentIntegerValue || 0;
                integerInput.value = currentIntegerValue;
                integerInput.className = "config-integer-input";
                integerInput.addEventListener("change", () => {
                    let itemValue = parseInt(integerInput.value, 10);
                    itemValue = Math.max(itemValue, itemToCreate.range[0]);
                    itemValue = Math.min(itemValue, itemToCreate.range[1]);
                    setUserSetting(itemToCreate.settingsPath, itemValue);
                });
                container.appendChild(integerInput);
                break;

            case "boolean":
                const checkbox = createElement("input");
                checkbox.type = "checkbox";
                let currentBoolValue = getUserSetting(itemToCreate.settingsPath);
                if (currentBoolValue === null || currentBoolValue === undefined) {
                    addConsoleLine(`Setting "${itemToCreate.settingsPath}" not found.`, "System", true);
                }
                currentBoolValue = currentBoolValue || false;
                checkbox.checked = currentBoolValue;
                checkbox.className = "config-boolean-input";
                checkbox.addEventListener("change", () => {
                    setUserSetting(itemToCreate.settingsPath, checkbox.checked);
                });
                container.appendChild(checkbox);
                break;

            case "select":
                const select = createElement("select");
                select.className = "config-select-input";
                let currentSelectValue = getUserSetting(itemToCreate.settingsPath);
                if (currentSelectValue === null || currentSelectValue === undefined) {
                    addConsoleLine(`Setting "${itemToCreate.settingsPath}" not found.`, "System", true);
                }
                currentSelectValue = currentSelectValue || itemToCreate.options[0].value; // Default to the first option if not set
                itemToCreate.options.forEach(option => {
                    const optionElement = createElement("option");
                    optionElement.value = option;
                    optionElement.textContent = option;
                    select.appendChild(optionElement);
                });
                select.value = currentSelectValue;
                select.addEventListener("change", () => {
                    if (itemToCreate.specialPreSubmitBehavior) {
                        const specialBehavior = specialBehaviors[itemToCreate.specialPreSubmitBehavior];
                        if (specialBehavior) {
                            const allowSelection = specialBehavior(select.value);
                            if (!allowSelection) {
                                select.value = itemToCreate.default;
                            }
                        }
                    }
                    setUserSetting(itemToCreate.settingsPath, select.value);
                });
                container.appendChild(select);
                break;

            case "longtext":
                const longTextArea = createElement("textarea");
                longTextArea.className = "config-longtext-input";
                let currentLongTextValue = getUserSetting(itemToCreate.settingsPath);
                if (currentLongTextValue === null || currentLongTextValue === undefined) {
                    addConsoleLine(`Setting "${itemToCreate.settingsPath}" not found.`, "System", true);
                }
                currentLongTextValue = currentLongTextValue || "";
                longTextArea.value = currentLongTextValue;
                longTextArea.addEventListener("change", () => {
                    setUserSetting(itemToCreate.settingsPath, longTextArea.value);
                });
                container.appendChild(longTextArea);
                break;

            default:
                addConsoleLine(`Unknown item type: ${itemToCreate.type}`, "System", true);
                return;

        }

        labelLevel--;
    }
    createConfigItem(settingsDefinition)
    // Add a close button to the configuration container
    const closeButton = createElement("button");
    closeButton.textContent = "Close";
    closeButton.className = "config-close-button";
    closeButton.addEventListener("click", () => {
        configContainer.classList.remove("opened");
    });
    configContainer.appendChild(closeButton);
}