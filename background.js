let port = undefined;

// Run the shellfox helper program.
function initShellfoxProgram() {
	port = browser.runtime.connectNative("shellfox");
	if (!port)
		shellfoxFailed();
	else
		port.onDisconnect.addListener(shellfoxFailed);
}


// Display an error when we fail to launch Shellfox’es script.
function shellfoxFailed() {
	let error = port.error;
	console.log(error);
	port = undefined;

	// Tell the user about the error…
	openNewTab("/html/error.html?error=" + escape(error));
}


function openNewTab(url) {
	browser.tabs.query({"active": true}).then((tabs) => {
		let openerTab = undefined;
		if (tabs && tabs.length > 0)
			openerTab = tabs[0].id;

		browser.tabs.create({
			"active": true,
			"url": url,
			"openerTabId": openerTab
		})
	});
}


// Given the name of an array saved to localStorage, return it (if possible).
function savedArray(name) {
	try {
		let saved = JSON.parse(localStorage.getItem(name));
		return saved;
	} catch { return []; };
}


// Return the command-string associated with a URL, if any.
function getUrlCommands(url) {
	let matchCommands = [];
	let matchRegex = "";
	try {
		let savedCommands = savedArray("commands");
		let savedRegexRules = savedArray("urlRules");
		// Find the most-applicable command…
		for (regexCommandIPair of savedRegexRules) {
			let regex = regexCommandIPair[0];
			let match = url.match(regex);
			let command_i = regexCommandIPair[1];
			let command = savedCommands[command_i][1];

			let compared = compareRegexComplexity(matchRegex, regex);
			if (match && (compared == 0 || compared == 1)) {
				matchCommands.unshift(savedCommands[command_i][1]);
				matchRegex = regex;
			} else if (match)
				matchCommands.push(command);
		}
	} catch {};

	if (matchCommands.length == 0)
		return undefined;
	return matchCommands;
}


// Return the download-command string (if any) associated with a URL and type
// integer (0→started; 1→finished).
function getDownloadCommand(url, type) {
	let matchCommand = undefined;
	let matchRegex = "";
	try {
		let savedDownloads = savedArray("downloadCommands");
		// Find the most-applicable command.
		for (regexCommandType of savedDownloads) {
			let regex = regexCommandType[0];
			let match = url.match(regex);

			let compared = compareRegexComplexity(matchRegex, regex);
			if ((match && (compared == 0 || compared == 1))
				&& (regexCommandType[2] == type))
			{
				matchCommand = regexCommandType[1];
				matchRegex = regex;
			}
		}
	} catch {};
	return matchCommand;
}


// Execute the given command string, subsituting “$URL” with url,
// “$FILE” with filepath, and “$REFERRER” with referrer.
function runCommand(command, url, filepath, referrer) {
	if (!port)
		initShellfoxProgram();
	if (command && port)
		port.postMessage(command
						 .replaceAll("$URL", url)
						 .replaceAll("${URL}", url)
						 .replaceAll("$REFERRER", referrer || "")
						 .replaceAll("${REFERRER}", referrer || "")
						 .replaceAll("$FILE", filepath)
						 .replaceAll("${FILE}", filepath));
}


// Execute the shell command associated with the given URL, if any.
function runUrlCommand(url, referrer) {
	let commands = getUrlCommands(url);
	if (commands)
		runCommand(commands[0], url, "", referrer);
}


// Compare two regular expressions, returning which one is more specific.
// Returns -1 if a is more specific, 1 if b is, and 0 if they are equal.
// It’s a simple (and unreliable) algorithm, for now — purely based on length.
function compareRegexComplexity(a, b) {
	if (a && ((a && !b) || (a.length > b.length)))
		return -1;
	else if (b && ((b && !a) || (a.length < b.length)))
		return 1
	return 0;
}


// Display the “Run shell command” context-menu item.
function showPageContextMenuItem() {
	browser.menus.update("run-page-command", { "visible": true });
}


// Display the “Run command on link” context-menu item.
function showLinkContextMenuItem() {
	browser.menus.update("run-page-commands", { "visible": true });
}


// Hide the “Run shell command context-menu item.
function hidePageContextMenuItem() {
	browser.menus.update("run-page-command", { "visible": false });
}


// Hide the “Run command on link” context-menu item.
function hideLinkContextMenuItem() {
	browser.menus.update("run-page-commands", { "visible": false });
}


// (Re-)Create the menu-items for each context menu.
function createCommandMenuItems() {
	let savedCommands = savedArray("commands") || [];
	for (let i = 0; i < savedCommands.length; i++) {
		let nameCommandPair = savedCommands[i];
		let name = nameCommandPair[0];
		let actionId = "run-pageaction-command-" + i;
		browser.menus.remove(actionId);
		browser.menus.create(
			{
				id: actionId,
				title: browser.i18n.getMessage("pageCommandContextMenu", name),
				contexts: ["page_action"]
			});

		let pageId = "run-page-command-" + i;
		browser.menus.remove(pageId);
		browser.menus.create(
			{
				id: pageId,
				title: browser.i18n.getMessage("pageCommandContextMenu", name),
				contexts: ["page"]
			});

		let linkId = "run-link-command-" + i;
		browser.menus.remove(linkId);
		browser.menus.create(
			{
				id: linkId,
				title: browser.i18n.getMessage("linkCommandContextMenu", name),
				contexts: ["link"]
			});
	}
	browser.menus.refresh();
}


// Add a context-menu item for running the current page’s associated command.
browser.menus.create(
	{
		id: "run-page-command",
		title: browser.i18n.getMessage("pageCommandDefaultContextMenu"),
		contexts: ["page"]
	}
);


// Add a context-menu item for running the command associated with a link.
browser.menus.create(
	{
		id: "run-link-command",
		title: browser.i18n.getMessage("linkCommandDefaultContextMenu"),
		contexts: ["link"]
	}
);


// When the address-bar button is clicked, run the according command (if any).
browser.pageAction.onClicked.addListener((tab) => {
	runUrlCommand(tab.url);
});


// When a context-menu (right-click menu) is opened, only display the SHellfox
// item if there is a configured command for that page.
browser.menus.onShown.addListener(info => {
	if (info.contexts.includes("link") && getUrlCommands(info.linkUrl)) {
		showLinkContextMenuItem();
	} else if (info.contexts.includes("page") && getUrlCommands(info.pageUrl)) {
		showPageContextMenuItem();
	} else {
		hidePageContextMenuItem();
		hideLinkContextMenuItem();
	}
	browser.menus.refresh();
});


// When a tab’s URL has been changed, enable/disable the address-bar button
// based on whether or not there is an according command.
browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
	let command = getUrlCommands(tab.url);
	if (command)
		browser.pageAction.show(tabId);
	else
		browser.pageAction.hide(tabId);
});


// When the active tab has changed, enable/disable the address-bar button based
// on whether or not there is an according command for it.
browser.tabs.onActivated.addListener((activeInfo) => {
	browser.tabs.get(activeInfo.tabId).then((tab) => {
		if (getUrlCommands(tab.url))
			browser.pageAction.show(tab.id);
		else
			browser.pageAction.hide(tab.id);
	});
});


// When a context-menu item is selected, let’s execute its will!
browser.menus.onClicked.addListener((info, tab) => {
	let itemName = info.menuItemId;
	if (itemName == "run-page-command")
		runUrlCommand(tab.url);
	else if (itemName == "run-link-command" && info.linkUrl)
		runUrlCommand(info.linkUrl, tab.url);
	else if (itemName.startsWith("run-")) {
		let command_i = itemName.split("-command-")[1];
		runCommand(savedArray("commands")[command_i][1], info.linkUrl || tab.url, tab.url);
	}
});

browser.browserAction.onClicked.addListener(() => {
	openNewTab("/html/options.html");
});


// When a download starts, run any applicable download commands.
browser.downloads.onCreated.addListener((downloadItem) => {
	let command = getDownloadCommand(downloadItem.url, 0);
	if (command)
		runCommand(command, downloadItem.url, downloadItem.filename, downloadItem.referrer);
});


// When a download completes, run any applicable download commands.
browser.downloads.onChanged.addListener((downloadDelta) => {
	browser.downloads.search({ "id": downloadDelta.id }).then((downloadItems) => {
		if (downloadDelta.state.current == "complete" && downloadItems.length > 0) {
			let command = getDownloadCommand(downloadItems[0].url, 1);
			if (command)
				runCommand(command, downloadItems[0].url,
						   downloadItems[0].filename, downloadItems[0].referrer);
		}
	})
});


// Whenever settings (commands) are updated, repopulate context-menus’ items.
window.addEventListener("storage", (e) => {
	createCommandMenuItems();
});


createCommandMenuItems();
