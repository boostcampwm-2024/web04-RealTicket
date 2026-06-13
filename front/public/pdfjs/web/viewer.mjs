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
const fitWidth = document.getElementById('fitWidth');
const zoomValue = document.getElementById('zoomValue');
const downloadLink = document.getElementById('downloadLink');

const query = new URLSearchParams(window.location.search);
const file = query.get('file');
const initialPage = getPageFromHash();

let pdfDocument = null;
let currentPage = 1;
let ctrlWheelDelta = 0;

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
    goToPreviousPage(linkService);
  });

  nextPage.addEventListener('click', () => {
    goToNextPage(linkService);
  });

  pageNumberInput.addEventListener('change', () => {
    goToPage(Number(pageNumberInput.value), linkService);
  });

  pageNumberInput.addEventListener('keydown', event => {
    if (event.key === 'Enter') {
      pageNumberInput.blur();
      goToPage(Number(pageNumberInput.value), linkService);
    }
  });

  zoomOut.addEventListener('click', () => {
    zoomOutViewer(pdfViewer);
  });

  zoomIn.addEventListener('click', () => {
    zoomInViewer(pdfViewer);
  });

  fitWidth.addEventListener('click', () => {
    fitToWidth(pdfViewer);
  });

  viewerContainer.addEventListener('wheel', event => {
    if (!event.ctrlKey) {
      return;
    }

    event.preventDefault();
    zoomWithWheel(event.deltaY, pdfViewer);
  }, { passive: false });

  window.addEventListener('keydown', event => {
    handleKeyboardShortcut(event, pdfViewer, linkService);
  });

  window.addEventListener('hashchange', () => {
    const page = getPageFromHash();
    if (page !== currentPage) {
      goToPage(page, linkService);
    }
  });
}

function goToPreviousPage(linkService) {
  goToPage(currentPage - 1, linkService);
}

function goToNextPage(linkService) {
  goToPage(currentPage + 1, linkService);
}

function goToPage(page, linkService) {
  if (!pdfDocument) {
    return;
  }

  linkService.goToPage(clampPage(page));
}

function zoomInViewer(pdfViewer) {
  if (!pdfDocument) {
    return;
  }

  pdfViewer.increaseScale();
}

function zoomOutViewer(pdfViewer) {
  if (!pdfDocument) {
    return;
  }

  pdfViewer.decreaseScale();
}

function fitToWidth(pdfViewer) {
  if (!pdfDocument) {
    return;
  }

  pdfViewer.currentScaleValue = 'page-width';
  updateZoomControl(pdfViewer.currentScale);
}

function zoomWithWheel(deltaY, pdfViewer) {
  const wheelStep = 100;
  ctrlWheelDelta += deltaY;

  while (Math.abs(ctrlWheelDelta) >= wheelStep) {
    if (ctrlWheelDelta < 0) {
      zoomInViewer(pdfViewer);
      ctrlWheelDelta += wheelStep;
    } else {
      zoomOutViewer(pdfViewer);
      ctrlWheelDelta -= wheelStep;
    }
  }
}

function handleKeyboardShortcut(event, pdfViewer, linkService) {
  if (
    isTextInput(event.target)
    || event.altKey
    || event.metaKey
    || event.ctrlKey
  ) {
    return;
  }

  switch (event.key) {
    case 'ArrowLeft':
    case 'PageUp':
      event.preventDefault();
      goToPreviousPage(linkService);
      break;
    case 'ArrowRight':
    case 'PageDown':
      event.preventDefault();
      goToNextPage(linkService);
      break;
    case 'Home':
      event.preventDefault();
      goToPage(1, linkService);
      break;
    case 'End':
      event.preventDefault();
      goToPage(pdfDocument?.numPages, linkService);
      break;
    case '+':
    case '=':
      event.preventDefault();
      zoomInViewer(pdfViewer);
      break;
    case '-':
      event.preventDefault();
      zoomOutViewer(pdfViewer);
      break;
    case '0':
      event.preventDefault();
      fitToWidth(pdfViewer);
      break;
    default:
      break;
  }
}

function isTextInput(target) {
  return target instanceof HTMLInputElement
    || target instanceof HTMLTextAreaElement
    || target instanceof HTMLSelectElement
    || target?.isContentEditable;
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
  fitWidth.disabled = !enabled;
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
