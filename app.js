//using /legacy/ fixed the error on mobile (and should work on old devices)
import * as pdfjsLib from 'https://cdn.jsdelivr.net/npm/pdfjs-dist@6.5.438/legacy/build/pdf.min.mjs';
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@6.5.438/legacy/build/pdf.worker.min.mjs';
const wasmUrl = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@6.5.438/wasm/'; //Some IMSLP sheet music needs this, apparently

let currentSpreadIndex = 0; //needed for two-page spread, this is the PAGE NUMBER.
let pdfDocGlobal = null;
let pdfDGName = null;
let resizeTimeout = null; //also necessary for the first time the resize listener is called
let pagesCache = []; //this is an awesome idea
let spreadMap = [];
let spreadStart = 0;
let wideScreen = window.innerWidth > window.innerHeight; //better than just window.width etc.

let singleFirstPage = false; //only applicable to widescreen devices
let halfTurn = false;
let isHalfTurned = false; //tracks current state of turn

const pdfInput = document.getElementById('pdf-upload'); //used to be querySelector, but this is consistent
const container = document.getElementById('canvas-container'); //viewport in tutorial

const infoOverlay = document.getElementById('info-overlay');
const pageRange = document.getElementById('page-range');
const darkenOverlay = document.getElementById('darken-overlay');
const pageInfo = document.getElementById('page-info');

//necessary for later reassignment of pageInfo
let nameInfo = null;
let pageNum = null;
let pageCount = null;  

const pageBackward = document.getElementById('backward-page');
const pageForward = document.getElementById('forward-page');
const noTurnArea = document.getElementById('noturn-area');

let backButtonTimeout = null;
let forButtonTimeout = null;

//bottom buttons
const previewButton = document.getElementById('preview');
const exportButton = document.getElementById('pdf-export');

const pagePreview = document.getElementById('page-preview');
const closePreview = document.getElementById('close-preview');
const previewSelected = [];

//Settings popover
const settingsPopover = document.getElementById('settings-popover');
const popoverSingleFirstPage = document.getElementById('cover-onepage-toggle');
const popoverHalfTurn = document.getElementById('halfturn-toggle');
const popoverTurnArea = document.getElementById('turnarea-button');
const popoverReset = document.getElementById('reset-button');

function buildSpreadMap() {

	const portraitMap = pagesCache.map(function(e) {
		const vp = e.getViewport({scale: 1});
		return vp.width <= vp.height;
	})

	//creates numPages-length array
	spreadMap = Array(pdfDocGlobal.numPages);

	for (let i = 0; i < pdfDocGlobal.numPages; i++) { //settled on a 0-index, but 1-index is nearly as viable
        //Only 1 page left, or screen isn't wide, or current page isn't portrait
        if ((i===0 && singleFirstPage === true) || i + 1 >= pdfDocGlobal.numPages || wideScreen === false || portraitMap[i] === false || portraitMap[i + 1] === false) {
            spreadMap[i] = 1;
        } else {
            spreadMap[i] = 2;
        }
    }
}

function renderPage(page, pageDiv, pagesPerSpread) {
	const canvas = pageDiv.querySelector('canvas');
	const ctx = canvas.getContext('2d');
  
  	const unscaledViewport = page.getViewport({scale: 1});

	const availableWidth = (window.innerWidth-10)/pagesPerSpread;
	const availableHeight = window.innerHeight - 10;

	const scaleX = availableWidth / unscaledViewport.width;
	const scaleY = availableHeight / unscaledViewport.height;
	const fitScale = Math.min(scaleX, scaleY);

	const viewport = page.getViewport({scale: fitScale});

	//sets value to 4 (or higher, but not likely)
	const outputScale = Math.max(window.devicePixelRatio, 4);

	//crispy
	canvas.height = Math.floor(viewport.height * outputScale);
	canvas.width = Math.floor(viewport.width * outputScale);

	canvas.style.width = Math.floor(viewport.width) + "px";
	canvas.style.height = Math.floor(viewport.height) + "px";

	const transform = [outputScale, 0, 0, outputScale, 0, 0];

	page.render({canvasContext: ctx, transform: transform, viewport: viewport}); //this is simpler than prev code
}

function updateDisplay() {
	if (pdfDocGlobal === null) return;
	pageNum.value = currentSpreadIndex+1;
	pageRange.value = currentSpreadIndex+1;

	getSpreadStart(); //gets the first page in spread
	const pagesPerSpread = spreadMap[spreadStart];
	const pages = pagesCache.slice(spreadStart, spreadStart+pagesPerSpread);
	
	//creates canvas wrapper for every page (should be one or two)
	container.innerHTML = pages
		.map (function() {return '<div class="page"><canvas></canvas></div>'})
		.join('');

	pages.forEach(function(page,index) {
		renderPage(page, container.children[index], pages.length);
	});
}

function getSpreadStart() {
	let validIndex = 0;
	while (validIndex + spreadMap[validIndex] <= currentSpreadIndex) { //searches the spreadMap
		validIndex += spreadMap[validIndex];
	}
	
	spreadStart = validIndex; //this allows currentSpreadIndex to retain its value
}

window.addEventListener('resize', function() { //timeouts are fun
	//clears prev wait
	clearTimeout(resizeTimeout);

	//waits 200 ms
	resizeTimeout = setTimeout(function () {
		wideScreen = window.innerWidth > window.innerHeight;
		if (wideScreen === true) {
			isHalfTurned = false;
		}

		if (pdfDocGlobal !== null) {
			buildSpreadMap();
			updateDisplay();
		}

	}, 200);

});

pdfInput.addEventListener('change', function() {
	const file = pdfInput.files[0];
	if (!file) return;

	//checks PDF, should not be necessary after accept attribute in HTML
	if (file.type !== "application/pdf") {
		alert("File is not a PDF.");
		pdfInput.value="";
		return;
	}

	pdfDocGlobal = null; //resets pdfDocGlobal, might change later

	isHalfTurned = false; //where else to put this

	nameInfo = document.getElementById('name-info');
	pdfDGName = file.name;
	nameInfo.textContent = pdfDGName;

	const reader = new FileReader();

	reader.onload = function(event) {
		//raw PDF data stored here as binary array buffer
		const arrayBuffer = event.target.result;

		//raw array to virtual document
		pdfjsLib.getDocument({data: arrayBuffer, wasmUrl}).promise.then(async function(pdfDocument) {
			pdfDocGlobal = pdfDocument;
			currentSpreadIndex = 0;
			pageRange.style.display = 'initial';
			pageRange.max = pdfDocGlobal.numPages;
			pageRange.value = 1;
			pageInfo.innerHTML = 'Page <input type="text" inputmode="numeric" id="page-num" /> of <span id="page-count"></span>';
			pageNum = document.getElementById('page-num');
			pageCount = document.getElementById('page-count');  
			pageNum.style.width = String(pdfDocGlobal.numPages).length + "ch"; //ch is pretty nice for a monospaced font
			pageCount.textContent = pdfDocGlobal.numPages; 

			//loads all PDFs to minimise delay
			const pagePromises = [];
			for (let i = 1; i <= pdfDocGlobal.numPages; i++) { //making i 1-indexed works nicely
  				pagePromises.push(pdfDocGlobal.getPage(i));
			}
			pagesCache = await Promise.all(pagePromises);
			buildSpreadMap();
			updateDisplay();
		});
	};

	reader.readAsArrayBuffer(file);

});

function nextSpread() { //simple enough, no checks necessary here
	getSpreadStart();
	currentSpreadIndex = spreadStart + spreadMap[spreadStart];
	updateDisplay();
}

function canGoNextSpread() { //made this a whole function
	getSpreadStart();
	return spreadStart+spreadMap[spreadStart]<pdfDocGlobal.numPages; //Cannot be equal to due to 1-index
}

function prevSpread() { //similar but different logic to getSpreadStart
	let prevIndex = 0;
	while (prevIndex + spreadMap[prevIndex] < spreadStart) { //not equals to because going backwards
		prevIndex += spreadMap[prevIndex];
	}
	currentSpreadIndex = prevIndex;
	updateDisplay(); //one run of the function at the end
}

document.addEventListener('keyup',  function(e) {
	if (pdfDocGlobal !== null && document.activeElement !== pageNum) {
		if (canGoNextSpread() && (e.code === 'Space' || e.code === 'ArrowRight' || e.code === 'ArrowDown')) {
			nextSpread();
		} else if (currentSpreadIndex > 0 && (e.code === 'ArrowLeft' || e.code === 'ArrowUp')) {
			prevSpread();
		}
	}
});

darkenOverlay.addEventListener('click', function() {
	if (!pdfDocGlobal) {
		pdfInput.click(); //reusing this idea
		return;
	}
	darkenOverlay.blur();
	infoOverlay.style.pointerEvents = 'none';
	infoOverlay.style.transition = 'opacity 200ms'; //for some reason this looks natural...
	infoOverlay.style.opacity = '0';

});

noTurnArea.addEventListener('click', function() {
	noTurnArea.blur();
	infoOverlay.style.pointerEvents = 'auto';
	infoOverlay.style.transition = 'opacity 400ms'; //...with this
	infoOverlay.style.opacity = '1';

});

pageBackward.addEventListener('click', function() {
	pageBackward.blur();
	if (pdfDocGlobal !== null && currentSpreadIndex > 0) {
		clearTimeout(backButtonTimeout);
		pageBackward.style.transition = 'opacity 400ms';
		pageBackward.style.opacity = '1';
		prevSpread();
		backButtonTimeout = setTimeout(function() {
			pageBackward.style.transition = 'opacity 200ms';
			pageBackward.style.opacity = '0';
		}, 400);
	}
});

pageForward.addEventListener('click', function() {
	pageForward.blur();
	if (pdfDocGlobal !== null) {
		if (canGoNextSpread()) {
			clearTimeout(forButtonTimeout);
			pageForward.style.transition = 'opacity 400ms';
			pageForward.style.opacity = '1';
			nextSpread();
			forButtonTimeout = setTimeout(function() {
				pageForward.style.transition = 'opacity 200ms';
				pageForward.style.opacity = '0';
			}, 400);
		}
	}
});

pageRange.addEventListener('input', function() { //this was incredibly easy to code, love it
	currentSpreadIndex = parseInt(pageRange.value, 10) - 1;
	updateDisplay();
});

pageInfo.addEventListener('change', function(e) {
	e.target.blur();

	isHalfTurned = false;

	let pageInput = parseInt(e.target.value, 10); //just in case

	if (isNaN(pageInput) || pageInput < 1) {
		pageInput = 1;
	} else if (pageInput > pdfDocGlobal.numPages) {
		pageInput = pdfDocGlobal.numPages;
	}

	currentSpreadIndex = pageInput - 1; //again, 0-based
	//no need to snap the page number to a valid index anymore

	updateDisplay();

});

previewButton.addEventListener('click', function() {
	if (!pdfDocGlobal) return;
	pagePreview.style.display = 'flex';

	//populate the preview-canvascontainer


});

closePreview.addEventListener('click', function() {
	pagePreview.style.display = 'none';

})

exportButton.addEventListener('click', async function() { //downloads for user, thank you tutorial!
	if (!pdfDocGlobal) return;
	const exportData = await pdfDocGlobal.saveDocument();
	const exportBlob = new Blob([exportData], {type: 'application/pdf'});

	//creates temp element to trigger download
	const exportUrl = URL.createObjectURL(exportBlob);
	const exportHyperlink = document.createElement('a');
	exportHyperlink.href = exportUrl;
	exportHyperlink.download = pdfDGName;
	exportHyperlink.style.display = "none";
	document.body.appendChild(exportHyperlink);

	//I am inevitable
	exportHyperlink.click();

	//deletes temp element and exportUrl to free space
	URL.revokeObjectURL(exportUrl);
	exportHyperlink.remove();
});

popoverSingleFirstPage.addEventListener('change', function() {
	singleFirstPage = popoverSingleFirstPage.checked;
	if (pdfDocGlobal !== null) {
		buildSpreadMap();
		updateDisplay();
	}

});

//I haven't made this do anything yet because the logic is too headachey
popoverHalfTurn.addEventListener('change', function() {
	halfTurn = popoverHalfTurn.checked;

	if (halfTurn === false) {
		isHalfTurned = false;
	}

});

popoverTurnArea.addEventListener('click', function() {
	/* Ideas...
	popoverTurnArea.blur();
	settingsPopover.hidePopover(); //this was intuitive; didn't even need a tutorial

	function outOfSight(erasedElement) { //there was definitely a much easier way of doing this
		erasedElement.style.pointerEvents = 'none';
		erasedElement.style.transtion = 'opacity 0ms';
		erasedElement.style.opacity = '0';
	}
	
	//whatever, this keeps the PDF loaded
	outOfSight(infoOverlay);
	outOfSight(pageBackward);
	outOfSight(noTurnArea);
	outOfSight(pageForward);
	*/

});

popoverReset.addEventListener('click', function() {
	popoverSingleFirstPage.checked = false;
	popoverHalfTurn.checked = false;

	singleFirstPage = false;
	halfTurn = false;
	isHalfTurned = false;

	if (pdfDocGlobal !== null) {
		buildSpreadMap();
		updateDisplay();
	}
	

});