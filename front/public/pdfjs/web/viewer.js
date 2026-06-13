import * as pdfjsLib from '../build/pdf.min.js';

globalThis.pdfjsLib = pdfjsLib;

const {
  EventBus,
  LinkTarget,
  PDFLinkService,
  PDFViewer,
} = await import('./pdf_viewer.js');

const PDFJS_ROOT = '/pdfjs';
const WHEEL_ZOOM_STEP = 100;
const WHEEL_ZOOM_INTERVAL_MS = 80;
const WHEEL_ZOOM_SCALE_DELTA = 1.1;
const MIN_ZOOM_SCALE = 0.1;
const MAX_ZOOM_SCALE = 10;

pdfjsLib.GlobalWorkerOptions.workerSrc = `${PDFJS_ROOT}/build/pdf.worker.min.js`;

const viewerContainer = document.getElementById('viewerContainer');
const viewerElement = document.getElementById('viewer');
const status = document.getElementById('status');
const statusMessage = document.getElementById('statusMessage');
const fileName = document.getElementById('fileName');
const pageNumberInput = document.getElementById('pageNumber');
const pageCount = document.getElementById('pageCount');
const previousPage = document.getElementById('previousPage');
const nextPage = document.getElementById('nextPage');
const zoomOut = document.getElementById('zoomOut');
const zoomIn = document.getElementById('zoomIn');
const fitToggle = document.getElementById('fitToggle');
const zoomValue = document.getElementById('zoomValue');
const downloadLink = document.getElementById('downloadLink');
const directPdfLink = document.getElementById('directPdfLink');

const FIT_MODES = {
  WIDTH: {
    label: '너비에 맞춤',
    scaleValue: 'page-width',
  },
  HEIGHT: {
    label: '높이에 맞춤',
    scaleValue: 'page-height',
  },
};

const query = new URLSearchParams(window.location.search);
const file = query.get('file');
const initialView = getViewFromHash();

let pdfDocument = null;
let currentPage = 1;
let ctrlWheelDelta = 0;
let ctrlWheelFrameId = null;
let ctrlWheelTimeoutId = null;
let lastCtrlWheelZoomAt = 0;
let pendingWheelScale = null;
let nextFitMode = FIT_MODES.WIDTH;

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
    directPdfLink.href = fileUrl;

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

  fitToggle.addEventListener('click', () => {
    toggleFitMode(pdfViewer);
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
    goToView(getViewFromHash(), linkService);
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

function goToView(view, linkService) {
  if (!pdfDocument) {
    return;
  }

  const page = clampPage(view.page);
  linkService.goToPage(page);

  if (isValidTopOffset(view.top)) {
    scrollToPageTop(page, view.top);
  }
}

function zoomInViewer(pdfViewer) {
  if (!pdfDocument) {
    return;
  }

  clearPendingWheelZoom();
  pdfViewer.increaseScale();
}

function zoomOutViewer(pdfViewer) {
  if (!pdfDocument) {
    return;
  }

  clearPendingWheelZoom();
  pdfViewer.decreaseScale();
}

function toggleFitMode(pdfViewer) {
  if (!pdfDocument) {
    return;
  }

  clearPendingWheelZoom();
  pdfViewer.currentScaleValue = nextFitMode.scaleValue;
  updateZoomControl(pdfViewer.currentScale);
  nextFitMode = nextFitMode === FIT_MODES.WIDTH
    ? FIT_MODES.HEIGHT
    : FIT_MODES.WIDTH;
  updateFitToggle();
}

function zoomWithWheel(deltaY, pdfViewer) {
  if (!pdfDocument) {
    return;
  }

  ctrlWheelDelta += deltaY;
  if (updatePendingWheelScale(pdfViewer)) {
    scheduleWheelZoom(pdfViewer);
  }
}

function updatePendingWheelScale(pdfViewer) {
  const steps = Math.trunc(Math.abs(ctrlWheelDelta) / WHEEL_ZOOM_STEP);

  if (steps === 0) {
    return false;
  }

  const isZoomingIn = ctrlWheelDelta < 0;
  const stepDelta = steps * WHEEL_ZOOM_STEP;
  const baseScale = pendingWheelScale ?? pdfViewer.currentScale;

  pendingWheelScale = getWheelScaleAfterSteps(
    baseScale,
    isZoomingIn ? steps : -steps,
  );
  ctrlWheelDelta += isZoomingIn ? stepDelta : -stepDelta;

  return true;
}

function scheduleWheelZoom(pdfViewer) {
  if (ctrlWheelFrameId !== null || ctrlWheelTimeoutId !== null) {
    return;
  }

  const now = performance.now();
  const elapsed = now - lastCtrlWheelZoomAt;

  if (lastCtrlWheelZoomAt > 0 && elapsed < WHEEL_ZOOM_INTERVAL_MS) {
    ctrlWheelTimeoutId = window.setTimeout(() => {
      ctrlWheelTimeoutId = null;
      scheduleWheelZoom(pdfViewer);
    }, WHEEL_ZOOM_INTERVAL_MS - elapsed);
    return;
  }

  ctrlWheelFrameId = requestAnimationFrame(() => {
    ctrlWheelFrameId = null;

    const zoomApplied = applyPendingWheelZoom(pdfViewer);
    if (zoomApplied) {
      lastCtrlWheelZoomAt = performance.now();
    }
  });
}

function applyPendingWheelZoom(pdfViewer) {
  if (!pdfDocument || pendingWheelScale === null) {
    return false;
  }

  const previousScale = pdfViewer.currentScale;
  const nextScale = pendingWheelScale;

  pendingWheelScale = null;

  if (nextScale === previousScale) {
    return false;
  }

  pdfViewer.currentScale = nextScale;

  if (pdfViewer.currentScale === previousScale) {
    ctrlWheelDelta = 0;
    return false;
  }

  return true;
}

function getWheelScaleAfterSteps(scale, signedSteps) {
  let nextScale = scale;
  const steps = Math.abs(signedSteps);
  const scaleDelta = signedSteps > 0
    ? WHEEL_ZOOM_SCALE_DELTA
    : 1 / WHEEL_ZOOM_SCALE_DELTA;
  const round = signedSteps > 0 ? Math.ceil : Math.floor;

  for (let step = 0; step < steps; step += 1) {
    nextScale = round((nextScale * scaleDelta).toFixed(2) * 10) / 10;
  }

  return clampZoomScale(nextScale);
}

function clampZoomScale(scale) {
  return Math.min(MAX_ZOOM_SCALE, Math.max(MIN_ZOOM_SCALE, scale));
}

function clearPendingWheelZoom() {
  ctrlWheelDelta = 0;
  pendingWheelScale = null;

  if (ctrlWheelFrameId !== null) {
    cancelAnimationFrame(ctrlWheelFrameId);
    ctrlWheelFrameId = null;
  }

  if (ctrlWheelTimeoutId !== null) {
    clearTimeout(ctrlWheelTimeoutId);
    ctrlWheelTimeoutId = null;
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
      toggleFitMode(pdfViewer);
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

    const page = clampPage(initialView.page);
    currentPage = page;
    pdfViewer.currentScale = 1;
    goToView({ ...initialView, page }, linkService);
    updatePageControls();
    updateFitToggle();
    updateZoomControl(pdfViewer.currentScale);
    syncUrlHash(page, initialView.top);
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

function updateFitToggle() {
  fitToggle.textContent = nextFitMode.label;
  fitToggle.setAttribute('aria-label', `${nextFitMode.label} 적용`);
}

function getViewFromHash() {
  const params = new URLSearchParams(window.location.hash.slice(1));
  const page = Number(params.get('page'));
  const top = params.has('top') ? Number(params.get('top')) : null;

  return {
    page: Number.isInteger(page) && page > 0 ? page : 1,
    top: Number.isFinite(top) && top >= 0 ? Math.round(top) : null,
  };
}

function syncUrlHash(page, top = getCurrentHashTopForPage(page)) {
  const nextParams = new URLSearchParams();
  nextParams.set('page', String(page));

  if (isValidTopOffset(top)) {
    nextParams.set('top', String(top));
  }

  const nextHash = nextParams.toString();

  if (window.location.hash.slice(1) !== nextHash) {
    history.replaceState(
      null,
      '',
      `${window.location.pathname}${window.location.search}#${nextHash}`,
    );
  }
}

function getCurrentHashTopForPage(page) {
  const view = getViewFromHash();
  return view.page === page ? view.top : null;
}

function isValidTopOffset(top) {
  return Number.isInteger(top) && top >= 0;
}

function scrollToPageTop(page, top, attempts = 0) {
  const pageElement = viewerElement.querySelector(
    `.page[data-page-number="${page}"]`,
  );

  if (!pageElement) {
    if (attempts < 20) {
      requestAnimationFrame(() => scrollToPageTop(page, top, attempts + 1));
    }
    return;
  }

  requestAnimationFrame(() => {
    const containerRect = viewerContainer.getBoundingClientRect();
    const pageRect = pageElement.getBoundingClientRect();
    const nextScrollTop = viewerContainer.scrollTop
      + pageRect.top
      - containerRect.top
      + top;

    viewerContainer.scrollTo({
      top: nextScrollTop,
      left: viewerContainer.scrollLeft,
      behavior: 'auto',
    });
  });
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
  fitToggle.disabled = !enabled;
  pageNumberInput.disabled = !enabled;
}

function hideStatus() {
  status.hidden = true;
}

function showError(message) {
  status.hidden = false;
  statusMessage.textContent = message;
  setControlsEnabled(false);
}
