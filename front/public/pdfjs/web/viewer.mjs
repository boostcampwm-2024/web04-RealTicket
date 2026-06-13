import {
  GlobalWorkerOptions,
  getDocument,
} from '../build/pdf.min.mjs';

const PDFJS_ROOT = '/pdfjs';
const MIN_SCALE = 0.5;
const MAX_SCALE = 2.5;
const SCALE_STEP = 0.2;

GlobalWorkerOptions.workerSrc = `${PDFJS_ROOT}/build/pdf.worker.min.mjs`;

const viewer = document.getElementById('viewer');
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
let pageCountValue = 0;
let currentPage = initialPage;
let scale = 1;
let renderVersion = 0;

if (!file) {
  showError('PDF file query parameter is required.');
} else if (!isSafeFileUrl(file)) {
  showError('Only same-origin PDF paths are allowed.');
} else {
  await openPdf(file);
}

async function openPdf(fileUrl) {
  try {
    fileName.textContent = decodeURIComponent(fileUrl.split('/').pop() || 'PDF');
    downloadLink.href = fileUrl;

    const loadingTask = getDocument({
      url: fileUrl,
      cMapPacked: true,
      cMapUrl: `${PDFJS_ROOT}/cmaps/`,
      iccUrl: `${PDFJS_ROOT}/iccs/`,
      standardFontDataUrl: `${PDFJS_ROOT}/standard_fonts/`,
      wasmUrl: `${PDFJS_ROOT}/wasm/`,
    });

    pdfDocument = await loadingTask.promise;
    pageCountValue = pdfDocument.numPages;
    currentPage = clampPage(initialPage);

    pageNumberInput.max = String(pageCountValue);
    pageCount.textContent = `/ ${pageCountValue}`;
    bindControls();
    await renderDocument({ scrollPage: currentPage });
    syncUrlHash(currentPage);
  } catch (error) {
    console.error(error);
    showError('Failed to load PDF.');
  }
}

function bindControls() {
  previousPage.addEventListener('click', () => goToPage(currentPage - 1));
  nextPage.addEventListener('click', () => goToPage(currentPage + 1));

  pageNumberInput.addEventListener('change', () => {
    goToPage(Number(pageNumberInput.value));
  });

  zoomOut.addEventListener('click', () => setScale(scale - SCALE_STEP));
  zoomIn.addEventListener('click', () => setScale(scale + SCALE_STEP));

  window.addEventListener('hashchange', () => {
    goToPage(getPageFromHash(), { updateHash: false });
  });
}

async function renderDocument({ scrollPage = currentPage } = {}) {
  const version = ++renderVersion;
  viewer.textContent = '';

  for (let pageNumber = 1; pageNumber <= pageCountValue; pageNumber += 1) {
    const pageShell = document.createElement('section');
    pageShell.id = `page-${pageNumber}`;
    pageShell.className = 'page';
    pageShell.setAttribute('aria-label', `Page ${pageNumber}`);
    viewer.appendChild(pageShell);

    const canvas = document.createElement('canvas');
    pageShell.appendChild(canvas);
  }

  for (let pageNumber = 1; pageNumber <= pageCountValue; pageNumber += 1) {
    if (version !== renderVersion) {
      return;
    }

    const pageShell = document.getElementById(`page-${pageNumber}`);
    const canvas = pageShell.querySelector('canvas');
    const page = await pdfDocument.getPage(pageNumber);
    const viewport = page.getViewport({ scale });
    const outputScale = window.devicePixelRatio || 1;
    const context = canvas.getContext('2d', { alpha: false });

    canvas.width = Math.floor(viewport.width * outputScale);
    canvas.height = Math.floor(viewport.height * outputScale);
    canvas.style.width = `${Math.floor(viewport.width)}px`;
    canvas.style.height = `${Math.floor(viewport.height)}px`;

    await page.render({
      canvasContext: context,
      transform:
        outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : null,
      viewport,
    }).promise;

    if (pageNumber === scrollPage) {
      scrollToPage(scrollPage);
    }
  }

  updateControls();
}

function goToPage(page, options = {}) {
  currentPage = clampPage(page);
  scrollToPage(currentPage);
  updateControls();

  if (options.updateHash !== false) {
    syncUrlHash(currentPage);
  }
}

async function setScale(nextScale) {
  const visiblePage = currentPage;
  scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, Number(nextScale.toFixed(2))));
  await renderDocument({ scrollPage: visiblePage });
  updateControls();
}

function scrollToPage(page) {
  document.getElementById(`page-${page}`)?.scrollIntoView({
    block: 'start',
    inline: 'nearest',
  });
}

function updateControls() {
  pageNumberInput.value = String(currentPage);
  previousPage.disabled = currentPage <= 1;
  nextPage.disabled = currentPage >= pageCountValue;
  zoomOut.disabled = scale <= MIN_SCALE;
  zoomIn.disabled = scale >= MAX_SCALE;
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
    history.replaceState(null, '', `${window.location.pathname}${window.location.search}#${nextHash}`);
  }
}

function clampPage(page) {
  const parsed = Number(page);

  if (!Number.isInteger(parsed)) {
    return 1;
  }

  return Math.min(pageCountValue || parsed, Math.max(1, parsed));
}

function isSafeFileUrl(fileUrl) {
  try {
    const url = new URL(fileUrl, window.location.origin);
    return url.origin === window.location.origin && url.pathname.endsWith('.pdf');
  } catch {
    return false;
  }
}

function showError(message) {
  if (!viewer.contains(status)) {
    viewer.textContent = '';
    viewer.appendChild(status);
  }

  status.textContent = message;
  previousPage.disabled = true;
  nextPage.disabled = true;
  zoomOut.disabled = true;
  zoomIn.disabled = true;
  pageNumberInput.disabled = true;
}
