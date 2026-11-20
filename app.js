import * as pdfjsLib from 'https://cdn.jsdelivr.net/npm/pdfjs-dist@6.5.438/build/pdf.min.mjs';
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@6.5.438/build/pdf.worker.min.mjs';
const wasmUrl = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@6.5.438/wasm/'; //Some IMSLP sheet music needs this, apparently

let currentSpreadIndex = 0; //needed for two-page spread, this is the PAGE NUMBER.
let pdfDocGlobal = null;
let resizeTimeout = null; //also necessary for the first time the resize listener is called
let pagesCache = []; //this is an awesome idea
let spreadMap = [];

//in theory could be inside reader.onload, but this works fine
const input = document.querySelector('input[type="file"]');
const container = document.getElementById('canvas-container'); //viewport in tutorial

const infoOverlay = document.getElementById('info-overlay');
const darkenOverlay = document.getElementById('darken-overlay');
const pageInfo = document.getElementById('page-info');

//necessary for later reassignment of pageInfo
let nameInfo = null;
let pageNum = null;
let pageCount = null;  

const pageBackward = document.getElementById('backward-page');
const pageForward = document.getElementById('forward-page');
const noTurnArea = document.getElementById('noturn-area');

function buildSpreadMap() {
	const wideScreen = window.innerWidth > window.innerHeight; //better than just window.width etc.

	const portraitMap = pagesCache.map(function(e) {
		const vp = e.getViewport({scale: 1});
		return vp.width <= vp.height;
	})

	//creates numPages-length array
	spreadMap = Array(pdfDocGlobal.numPages);

	for (let i = 0; i < pdfDocGlobal.numPages; i++) { //settled on a 0-index, but 1-index is nearly as viable
        //Only 1 page left, or screen isn't wide, or current page isn't portrait
        if (i + 1 >= pdfDocGlobal.numPages || wideScreen === false || portraitMap[i] === false || portraitMap[i + 1] === false) {
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

  const outputScale = window.devicePixelRatio * 2;
  
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
	const pagesPerSpread = spreadMap[currentSpreadIndex];
	const pages = pagesCache.slice(currentSpreadIndex, currentSpreadIndex+pagesPerSpread);
	
	//creates canvas wrapper for every page (should be one or two)
	container.innerHTML = pages
		.map (function() {return '<div class="page"><canvas></canvas></div>'})
		.join('');

	pages.forEach(function(page,index) {
		renderPage(page, container.children[index], pages.length);
	});

}

window.addEventListener('resize', function() { //timeouts are fun
	//clears prev wait
	clearTimeout(resizeTimeout);

	//waits 200 ms
	resizeTimeout = setTimeout(function () {
		buildSpreadMap();
		updateDisplay();
	}, 200);
});

input.addEventListener('change', function() {
	//should only use the first file; is this necessary?
	const file = input.files[0];
	if (!file) return;

	//checks PDF, should not be necessary after accept attribute in HTML
	if (file.type !== "application/pdf") {
		alert("File is not a PDF.");
		input.value="";
		return;
	}

	nameInfo = document.getElementById('name-info');
	nameInfo.textContent = file.name;

	const reader = new FileReader();

	reader.onload = function(event) {
		//raw PDF data stored here as binary array buffer
		const arrayBuffer = event.target.result;

		//raw array to virtual document
		pdfjsLib.getDocument({data: arrayBuffer, wasmUrl}).promise.then(async function(pdfDocument) {
			pdfDocGlobal = pdfDocument;
			currentSpreadIndex = 0;
			pageInfo.innerHTML = 'Page <span id="page-num"></span> of <span id="page-count"></span>';
			pageNum = document.getElementById('page-num');
			pageCount = document.getElementById('page-count');  
			pageNum.textContent = 1;
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
	currentSpreadIndex += spreadMap[currentSpreadIndex];
	pageNum.textContent = currentSpreadIndex+1;
	updateDisplay();
}

function canGoNextSpread() { //made this a whole function
	if (currentSpreadIndex+spreadMap[currentSpreadIndex]<pdfDocGlobal.numPages) { //Cannot be equal to due to 1-index
		return true;
	}
	return false;
}

function prevSpread() {
	if (currentSpreadIndex >= 2) {
		//no need for prevCheck2 or getPagesPerSpread huh...
		if (spreadMap[currentSpreadIndex-2] === 2) {
			currentSpreadIndex -= 2;
		} else {
			currentSpreadIndex -= 1;
		}
	} else { //if currentSpreadIndex is 1, 0, and anything invalid
		currentSpreadIndex = 0;
	}
	pageNum.textContent = currentSpreadIndex+1;
	updateDisplay(); //one run of the function at the end
}

document.addEventListener('keyup',  function(e) {
	if (pdfDocGlobal !== null) {
		if (canGoNextSpread() && (e.code === 'Space' || e.code === 'ArrowRight' || e.code === 'ArrowDown')) {
			nextSpread();
		} else if (currentSpreadIndex > 0 && (e.code === 'ArrowLeft' || e.code === 'ArrowUp')) {
			prevSpread();
		}
	}
});

darkenOverlay.addEventListener('click', function() {
	darkenOverlay.blur();
	infoOverlay.style.pointerEvents = 'none';
	infoOverlay.style.transition = 'opacity 200ms' //for some reason this looks natural...
	infoOverlay.style.opacity = '0';

});

noTurnArea.addEventListener('click', function() {
	noTurnArea.blur();
	infoOverlay.style.pointerEvents = 'auto';
	infoOverlay.style.transition = 'opacity 400ms' //...with this
	infoOverlay.style.opacity = '1';

});

pageBackward.addEventListener('click', function() {
	pageBackward.blur();
	if (pdfDocGlobal !== null && currentSpreadIndex > 0) {
		pageBackward.style.transition = 'opacity 400ms'
		pageBackward.style.opacity = '1';
		prevSpread();
		setTimeout(function() {
			pageBackward.style.transition = 'opacity 200ms'
			pageBackward.style.opacity = '0';
		}, 400);
	}
});

pageForward.addEventListener('click', function() {
	pageForward.blur();
	if (pdfDocGlobal !== null) {
		if (canGoNextSpread()) {
			pageForward.style.transition = 'opacity 400ms'
			pageForward.style.opacity = '1';
			nextSpread();
			setTimeout(function() {
				pageForward.style.transition = 'opacity 200ms'
				pageForward.style.opacity = '0';
			}, 400);
		}
	}
});