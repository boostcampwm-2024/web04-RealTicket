import * as pdfjsLib from '../build/pdf.min.mjs';

globalThis.pdfjsLib = pdfjsLib;

const {
  EventBus,
  LinkTarget,
  PDFLinkService,
  PDFViewer,
} = await import('./pdf_viewer.mjs');

const PDFJS_ROOT = '/pdfjs';

pdfjsLib.GlobalWorkerOptions.workerSrc = `${PDFJS_ROOT}/build/pdf.worker.min.mjs`;

const viewerContainer = document.getElementById('viewerContainer');
const viewerElement = document.getElementById('viewer');
const status = document.getElementById('status');
const fileName = document.getElementById('fileName');
const pageNumberInput = document.getElementById('pageNumber');
const pageCount = document.getElementById('pageCount');
const previousPage = document.getElementById('previousPage');
const nextPage = document.getElementById('nextPage');
const zoomOut = document.getElementById('zoomOut');
const zoomIn = document.getElementById('zoomIn');
const zoomValue = document.getElementById('zoomValue');
const downloadLink = document.getElementById('downloadLink');

const query = new URLSearchParams(window.location.search);
const file = query.get('file');
const initialPage = getPageFromHash();

let pdfDocument = null;
let currentPage = 1;

setControlsEnabled(false);

if (!file) {
  showError('PDF file query parameter is required.');
} else if (!isSafeFileUrl(file)) {
  showError('Only same-origin PDF paths are allowed.');
} else {
  await openPdf(file);
}

async function openPdf(fileUrl) {
  try {
    const eventBus = new EventBus();
    const linkService = new PDFLinkService({
      eventBus,
      externalLinkTarget: LinkTarget.BLANK,
      externalLinkRel: 'noopener noreferrer nofollow',
    });
    const pdfViewer = new PDFViewer({
      container: viewerContainer,
      viewer: viewerElement,
      eventBus,
      linkService,
      imageResourcesPath: './images/',
    });

    linkService.setViewer(pdfViewer);
    bindControls(pdfViewer, linkService);
    bindViewerEvents(eventBus, pdfViewer, linkService);

    fileName.textContent = decodeURIComponent(fileUrl.split('/').pop() || 'PDF');
    downloadLink.href = fileUrl;

    const loadingTask = pdfjsLib.getDocument({
      url: fileUrl,
      cMapPacked: true,
      cMapUrl: `${PDFJS_ROOT}/cmaps/`,
      iccUrl: `${PDFJS_ROOT}/iccs/`,
      standardFontDataUrl: `${PDFJS_ROOT}/standard_fonts/`,
      wasmUrl: `${PDFJS_ROOT}/wasm/`,
    });

    pdfDocument = await loadingTask.promise;
    linkService.setDocument(pdfDocument);
    pdfViewer.setDocument(pdfDocument);
  } catch (error) {
    console.error(error);
    showError('Failed to load PDF.');
  }
}

function bindControls(pdfViewer, linkService) {
  previousPage.addEventListener('click', () => {
    linkService.goToPage(Math.max(1, currentPage - 1));
  });

  nextPage.addEventListener('click', () => {
    linkService.goToPage(Math.min(pdfDocument.numPages, currentPage + 1));
  });

  pageNumberInput.addEventListener('change', () => {
    linkService.goToPage(Number(pageNumberInput.value));
  });

  pageNumberInput.addEventListener('keydown', event => {
    if (event.key === 'Enter') {
      pageNumberInput.blur();
      linkService.goToPage(Number(pageNumberInput.value));
    }
  });

  zoomOut.addEventListener('click', () => {
    pdfViewer.decreaseScale();
  });

  zoomIn.addEventListener('click', () => {
    pdfViewer.increaseScale();
  });

  window.addEventListener('hashchange', () => {
    const page = getPageFromHash();
    if (page !== currentPage) {
      linkService.goToPage(page);
    }
  });
}

function bindViewerEvents(eventBus, pdfViewer, linkService) {
  eventBus.on('pagesinit', () => {
    pageNumberInput.max = String(pdfDocument.numPages);
    pageCount.textContent = `/ ${pdfDocument.numPages}`;
    setControlsEnabled(true);
    hideStatus();

    const page = clampPage(initialPage);
    currentPage = page;
    pdfViewer.currentScaleValue = 'page-width';
    linkService.goToPage(page);
    updatePageControls();
    updateZoomControl(pdfViewer.currentScale);
    syncUrlHash(page);
  });

  eventBus.on('pagechanging', ({ pageNumber }) => {
    currentPage = pageNumber;
    updatePageControls();
    syncUrlHash(pageNumber);
  });

  eventBus.on('scalechanging', ({ scale }) => {
    updateZoomControl(scale);
  });
}

function updatePageControls() {
  pageNumberInput.value = String(currentPage);
  previousPage.disabled = currentPage <= 1;
  nextPage.disabled = !pdfDocument || currentPage >= pdfDocument.numPages;
}

function updateZoomControl(scale) {
  zoomValue.textContent = `${Math.round(scale * 100)}%`;
}

function getPageFromHash() {
  const params = new URLSearchParams(window.location.hash.slice(1));
  const page = Number(params.get('page'));
  return Number.isInteger(page) && page > 0 ? page : 1;
}

function syncUrlHash(page) {
  const nextHash = `page=${page}`;

  if (window.location.hash.slice(1) !== nextHash) {
    history.replaceState(
      null,
      '',
      `${window.location.pathname}${window.location.search}#${nextHash}`,
    );
  }
}

function clampPage(page) {
  const parsed = Number(page);

  if (!Number.isInteger(parsed) || parsed < 1) {
    return 1;
  }

  if (!pdfDocument) {
    return parsed;
  }

  return Math.min(pdfDocument.numPages, parsed);
}

function isSafeFileUrl(fileUrl) {
  try {
    const url = new URL(fileUrl, window.location.origin);
    return url.origin === window.location.origin && url.pathname.endsWith('.pdf');
  } catch {
    return false;
  }
}

function setControlsEnabled(enabled) {
  previousPage.disabled = !enabled;
  nextPage.disabled = !enabled;
  zoomOut.disabled = !enabled;
  zoomIn.disabled = !enabled;
  pageNumberInput.disabled = !enabled;
}

function hideStatus() {
  status.hidden = true;
}

function showError(message) {
  status.hidden = false;
  status.textContent = message;
  setControlsEnabled(false);
}
