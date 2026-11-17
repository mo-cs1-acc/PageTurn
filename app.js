import * as pdfjsLib from 'https://cdn.jsdelivr.net/npm/pdfjs-dist@6.5.438/build/pdf.min.mjs';
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@6.5.438/build/pdf.worker.min.mjs';

let currentSpreadIndex = 0; //needed for two-page spread
let pdfDocGlobal = null; //in theory should help with global referencing for re-rendering

//in theory could be inside reader.onload, but this works fine
const input = document.querySelector('input[type="file"]');
const container = document.getElementById('canvas-container'); //viewport in tutorial

async function getPagesPerSpread(pdfDoc, startPageIndex) {
	const wideScreen = window.innerWidth > window.innerHeight; //better than just window.width etc.
	const totalPagesLeft = pdfDoc.numPages - startPageIndex;

	if (totalPagesLeft < 2) {
		//only one page per spread if only one page left!
		return 1;
	}

	//1-indexed; await waits for pdf input without stopping
	const page1 = await pdfDoc.getPage(startPageIndex + 1);
	const page2 = await pdfDoc.getPage(startPageIndex + 2);

	const vp1 = page1.getViewport({scale: 1});
	const vp2 = page2.getViewport({scale: 1});


	const page1Portrait = vp1.width <= vp1.height;
	const page2Portrait = vp2.width <= vp2.height;

	if (wideScreen === true && page1Portrait === true && page2Portrait === true) {
    // Two pages if both are portrait, one page otherwise
    return 2;
  }
  //otherwise...
	return 1;
}

async function renderSpread(pdfDoc) {
	const pagesPerSpread = await getPagesPerSpread(pdfDoc, currentSpreadIndex);
	const startPage = currentSpreadIndex; //new value
	const endPage = Math.min(startPage + pagesPerSpread - 1, pdfDoc.numPages -1);

	const pagePromises = [];
	for (let i = startPage; i <= endPage; i++) { //iteration!
		pagePromises.push(pdfDoc.getPage(i+1)); //starts from 1, apparently
	}

	return Promise.all(pagePromises);
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

  const viewport = page.getViewport({scale: fitScale})
  
  //might change these later
  canvas.height = Math.floor(viewport.height);
  canvas.width = Math.floor(viewport.width);

  page.render({canvasContext: ctx, viewport: viewport}); //this is simpler than prev code
}

async function updateDisplay() {
	if (!pdfDocGlobal) return;
	const pages = await renderSpread(pdfDocGlobal);

}

input.addEventListener('change', function(e) {
	console.log(input.files[0]);

	//should only use the first file; is this necessary?
	const file = input.files[0];
	if (!file) return;

	//checks PDF, should not be necessary after accept attribute in HTML
	if (file.type !== "application/pdf") {
		alert("File is not a PDF.");
		input.value="";
		return;
	}

	const reader = new FileReader();

	reader.onload = function(event) {
		//raw PDF data stored here as binary array buffer
		const arrayBuffer = event.target.result;

		//raw array to virtual document
		pdfjsLib.getDocument({data: arrayBuffer}).promise.then(function(pdfDocument) {
			//test
			console.log("Document loaded, pages=", pdfDocument.numPages);

			pdfDocGlobal = pdfDocument;
			currentSpreadIndex = 0;

			//temp page 1
			return renderSpread(pdfDocument);

		}).then(function(pages) { //pages parameter is the previous return
			//creates canvas wrapper for every page (should be one or two)
			container.innerHTML = pages
				.map (function() {return '<div class="page"><canvas></canvas></div>'}) //I don't understand the arrow thing
				.join('');

			pages.forEach(function(page,index) {
				renderPage(page, container.children[index], pages.length);

			});
		});

	};

	reader.readAsArrayBuffer(file);

}, false);