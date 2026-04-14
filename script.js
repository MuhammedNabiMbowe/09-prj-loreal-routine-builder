/* ========== STATE MANAGEMENT ========== */
let selectedProducts = [];
let allProducts = [];
let conversationHistory = [];
let currentProducts = [];
let selectedCategory = "all";
let productSearchTerm = "";
const WORKER_URL = CLOUDFLARE_WORKER_URL; // from secrets.js

/* ========== DOM ELEMENTS ========== */
const categoryFilter = document.getElementById("categoryFilter");
const productSearchInput = document.getElementById("productSearch");
const resultsCount = document.getElementById("resultsCount");
const resetFiltersBtn = document.getElementById("resetFilters");
const productsContainer = document.getElementById("productsContainer");
const selectedProductsList = document.getElementById("selectedProductsList");
const selectedCount = document.getElementById("selectedCount");
const clearAllBtn = document.getElementById("clearAllBtn");
const generateRoutineBtn = document.getElementById("generateRoutine");
const chatForm = document.getElementById("chatForm");
const chatWindow = document.getElementById("chatWindow");
const userInput = document.getElementById("userInput");
const sendBtn = document.getElementById("sendBtn");
const productModal = document.getElementById("productModal");
const modalClose = document.querySelector(".modal-close");
const loadingOverlay = document.getElementById("loadingOverlay");
let lastFocusedElement = null;

/* ========== INITIALIZATION ========== */
async function init() {
  // Load products from JSON
  await loadAllProducts();

  // Load saved selections from localStorage
  loadSavedSelections();

  // Set up event listeners
  setupEventListeners();

  // Display initial filtered products
  applyFilters();
}

/* ========== LOAD & FETCH DATA ========== */
async function loadAllProducts() {
  try {
    const response = await fetch("products.json");
    const data = await response.json();
    allProducts = data.products;
  } catch (error) {
    console.error("Error loading products:", error);
  }
}

/* ========== EVENT LISTENERS SETUP ========== */
function setupEventListeners() {
  // Category filter
  categoryFilter.addEventListener("change", handleCategoryChange);
  productSearchInput.addEventListener("input", handleProductSearch);
  resetFiltersBtn.addEventListener("click", handleResetFilters);

  // Product selection
  document.addEventListener("click", handleProductClick);

  // Modal
  modalClose.addEventListener("click", closeModal);
  productModal.addEventListener("click", closeModalOnBackdropClick);
  document.addEventListener("keydown", handleGlobalKeydown);

  // Selected products actions
  clearAllBtn.addEventListener("click", clearAllSelections);
  generateRoutineBtn.addEventListener("click", handleGenerateRoutine);

  // Chat
  chatForm.addEventListener("submit", handleChatSubmit);
}

/* ========== CATEGORY FILTER HANDLER ========== */
async function handleCategoryChange(e) {
  selectedCategory = e.target.value || "all";
  applyFilters();
}

function handleProductSearch(e) {
  productSearchTerm = e.target.value.trim().toLowerCase();
  applyFilters();
}

function applyFilters() {
  let filtered = [...allProducts];

  if (selectedCategory !== "all") {
    filtered = filtered.filter(
      (product) => product.category === selectedCategory,
    );
  }

  if (productSearchTerm) {
    filtered = filtered.filter((product) => {
      const haystack =
        `${product.name} ${product.brand} ${product.category} ${product.description}`.toLowerCase();
      return haystack.includes(productSearchTerm);
    });
  }

  currentProducts = filtered;
  displayProducts(currentProducts);
  updateResultsCount(filtered.length);
}

function handleResetFilters() {
  selectedCategory = "all";
  productSearchTerm = "";
  categoryFilter.value = "all";
  productSearchInput.value = "";
  applyFilters();
}

function updateResultsCount(count) {
  if (!resultsCount) return;
  const label = count === 1 ? "product" : "products";
  resultsCount.textContent = `${count} ${label} shown`;
}

/* ========== DISPLAY PRODUCTS ========== */
function displayProducts(products) {
  if (products.length === 0) {
    productsContainer.innerHTML = `
      <div class="placeholder-message">
        No matching products found. Try a different keyword or category.
      </div>
    `;
    return;
  }

  productsContainer.innerHTML = products
    .map((product) => {
      const isSelected = selectedProducts.some((p) => p.id === product.id);
      return `
        <div
          class="product-card ${isSelected ? "selected" : ""}"
          data-product-id="${product.id}"
          role="button"
          tabindex="0"
          aria-pressed="${isSelected}"
          aria-label="${product.name} by ${product.brand}. ${isSelected ? "Selected" : "Not selected"}. Press Enter or Space to toggle selection."
        >
          <div class="select-checkbox">
            ${isSelected ? '<i class="fa-solid fa-check"></i>' : ""}
          </div>
          <img src="${product.image}" alt="${product.name}" class="product-card-image" />
          <div class="product-info">
            <h3>${product.name}</h3>
            <p>${product.brand}</p>
          </div>
          <div class="product-card-actions">
            <button type="button" class="product-card-btn view-details-btn" onclick="handleViewDetails(${product.id})">
              Details
            </button>
          </div>
        </div>
      `;
    })
    .join("");
}

function displayPlaceholder() {
  productsContainer.innerHTML = `
    <div class="placeholder-message">
      Select a category to view products
    </div>
  `;
}

/* ========== PRODUCT SELECTION HANDLER ========== */
function handleProductClick(e) {
  // Check if clicking on a product card (but not the details button)
  let card = e.target.closest(".product-card");

  if (!card) return;

  // Don't trigger if clicking on the details button
  if (e.target.closest(".product-card-btn")) return;

  const productId = parseInt(card.dataset.productId, 10);
  if (!Number.isNaN(productId)) {
    toggleProductSelection(productId);
  }
}

function toggleProductSelection(productId) {
  const product = allProducts.find((p) => p.id === productId);
  if (!product) return;

  const isCurrentlySelected = selectedProducts.some((p) => p.id === productId);
  if (isCurrentlySelected) {
    selectedProducts = selectedProducts.filter((p) => p.id !== productId);
  } else {
    selectedProducts.push(product);
  }

  updateSelectedProducts();
  if (currentProducts.length > 0) {
    displayProducts(currentProducts);
  }
  saveSelections();
}

/* ========== MODAL: VIEW PRODUCT DETAILS ========== */
function handleViewDetails(productId) {
  const product = allProducts.find((p) => p.id === productId);

  if (!product) return;

  // Populate modal
  document.getElementById("modalProductImage").src = product.image;
  document.getElementById("modalProductImage").alt = product.name;
  document.getElementById("modalProductName").textContent = product.name;
  document.getElementById("modalProductBrand").textContent = product.brand;
  document.getElementById("modalProductCategory").textContent =
    product.category;
  document.getElementById("modalProductDescription").textContent =
    product.description;

  // Set modal button action
  const modalAddBtn = document.getElementById("modalAddBtn");
  modalAddBtn.onclick = () => {
    // Toggle selection from modal
    const isSelected = selectedProducts.some((p) => p.id === productId);
    if (isSelected) {
      selectedProducts = selectedProducts.filter((p) => p.id !== productId);
    } else {
      selectedProducts.push(product);
    }
    updateSelectedProducts();
    closeModal();
    if (currentProducts.length > 0) {
      displayProducts(currentProducts);
    }
    saveSelections();
  };

  // Update button text based on current state
  const isSelected = selectedProducts.some((p) => p.id === productId);
  modalAddBtn.innerHTML = isSelected
    ? '<i class="fa-solid fa-minus"></i> Remove from Routine'
    : '<i class="fa-solid fa-plus"></i> Add to Routine';

  // Show modal
  lastFocusedElement = document.activeElement;
  productModal.classList.add("active");
  productModal.setAttribute("aria-hidden", "false");
  modalClose.focus();
}

function closeModal() {
  productModal.classList.remove("active");
  productModal.setAttribute("aria-hidden", "true");
  if (lastFocusedElement && typeof lastFocusedElement.focus === "function") {
    lastFocusedElement.focus();
  }
}

function closeModalOnBackdropClick(e) {
  if (e.target === productModal) {
    closeModal();
  }
}

function handleGlobalKeydown(e) {
  if (e.key === "Escape" && productModal.classList.contains("active")) {
    closeModal();
    return;
  }

  const card = e.target.closest(".product-card");
  if (!card) return;

  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    const productId = parseInt(card.dataset.productId, 10);
    if (!Number.isNaN(productId)) {
      toggleProductSelection(productId);
    }
  }
}

/* ========== UPDATE SELECTED PRODUCTS ========== */
function updateSelectedProducts() {
  // Update count
  selectedCount.textContent = `${selectedProducts.length} selected`;

  // Update list display
  if (selectedProducts.length === 0) {
    selectedProductsList.innerHTML =
      '<p class="empty-message">No products selected</p>';
    selectedProductsList.parentElement.classList.remove("has-items");
    clearAllBtn.disabled = true;
    generateRoutineBtn.disabled = true;
    return;
  }

  selectedProductsList.parentElement.classList.add("has-items");
  clearAllBtn.disabled = false;
  generateRoutineBtn.disabled = false;

  selectedProductsList.innerHTML = selectedProducts
    .map(
      (product) => `
    <div class="selected-product-chip" role="listitem">
      <span>${product.name}</span>
      <button type="button" aria-label="Remove ${product.name}" onclick="removeProduct(${product.id})">
        <i class="fa-solid fa-times"></i>
      </button>
    </div>
  `,
    )
    .join("");
}

function removeProduct(productId) {
  selectedProducts = selectedProducts.filter((p) => p.id !== productId);
  updateSelectedProducts();
  if (currentProducts.length > 0) {
    displayProducts(currentProducts);
  }
  saveSelections();
}

function clearAllSelections() {
  selectedProducts = [];
  updateSelectedProducts();
  if (currentProducts.length > 0) {
    displayProducts(currentProducts);
  }
  clearLocalStorage();
}

/* ========== WORKER API HELPER ========== */
async function callWorkerApi(payload) {
  const endpoints = [WORKER_URL];

  // If URL includes /chat, also try the root URL as a fallback.
  if (WORKER_URL.endsWith("/chat")) {
    endpoints.push(WORKER_URL.replace(/\/chat$/, ""));
  }

  let lastError = "Unknown request error";

  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const rawText = await response.text();
      let data = null;
      try {
        data = rawText ? JSON.parse(rawText) : null;
      } catch (jsonError) {
        data = null;
      }

      if (!response.ok) {
        const detail =
          data?.details ||
          data?.error ||
          (rawText && rawText.slice(0, 200)) ||
          response.statusText;
        lastError = `HTTP ${response.status}: ${detail}`;

        // Try fallback endpoint on 404/405 before failing.
        if (
          (response.status === 404 || response.status === 405) &&
          endpoint !== endpoints[endpoints.length - 1]
        ) {
          continue;
        }

        throw new Error(lastError);
      }

      const message =
        (data?.success && typeof data?.message === "string" && data.message) ||
        (typeof data?.message === "string" && data.message) ||
        (typeof data?.response === "string" && data.response) ||
        (typeof data?.result === "string" && data.result) ||
        (typeof data?.choices?.[0]?.message?.content === "string" &&
          data.choices[0].message.content) ||
        (typeof rawText === "string" &&
        rawText.trim() &&
        !rawText.trim().startsWith("<")
          ? rawText.trim()
          : null);

      if (!message) {
        lastError = "Worker responded without a readable message field";
        throw new Error(lastError);
      }

      return {
        success: true,
        message,
      };
    } catch (error) {
      lastError = error.message || String(error);
    }
  }

  throw new Error(lastError);
}

/* ========== GENERATE ROUTINE ========== */
async function handleGenerateRoutine() {
  if (selectedProducts.length === 0) return;

  // Show loading overlay
  showLoading(true);

  const productSummary = selectedProducts
    .map((p) => `${p.name} by ${p.brand}`)
    .join(", ");

  // Create the initial routine request message
  const routinePrompt = `Create a personalized skincare and beauty routine using these selected products: ${productSummary}. 
  
  For each product, explain:
  1. When in the routine to use it (morning, evening, or both)
  2. How to use it
  3. Why it's beneficial
  
  Provide clear, beginner-friendly instructions.`;

  try {
    const data = await callWorkerApi({
      messages: [
        {
          role: "user",
          content: routinePrompt,
        },
      ],
      useWebSearch: true,
      context:
        "Reply in plain text only and avoid markdown symbols like #, *, **, -, or bullet markers. Use web search for current L'Oréal-related information when helpful and include links or citations when available.",
    });

    if (data.success && data.message) {
      const cleanRoutine = sanitizeAssistantText(data.message);

      // Add to conversation history
      conversationHistory = [
        { role: "user", content: routinePrompt },
        { role: "assistant", content: cleanRoutine },
      ];

      // Clear chat and display the routine request + answer
      displayChatHistory();

      // Enable chat input
      userInput.disabled = false;
      sendBtn.disabled = false;
    } else {
      throw new Error("Invalid response from API");
    }
  } catch (error) {
    console.error("Error generating routine:", error);
    displayMessage(
      "assistant",
      `I couldn't generate your routine yet. Error: ${error.message}`,
    );
    userInput.disabled = false;
    sendBtn.disabled = false;
  } finally {
    showLoading(false);
  }
}

/* ========== CHAT FUNCTIONALITY ========== */
async function handleChatSubmit(e) {
  e.preventDefault();

  const message = userInput.value.trim();
  if (!message) return;

  // Display user message
  displayMessage("user", message);
  userInput.value = "";

  // Add to conversation history
  conversationHistory.push({
    role: "user",
    content: message,
  });

  // Show typing indicator
  displayTypingIndicator();

  try {
    const data = await callWorkerApi({
      messages: conversationHistory.map((msg) => ({
        role: msg.role,
        content: msg.content,
      })),
      useWebSearch: true,
      context:
        "You are a helpful beauty and skincare advisor answering questions about skincare, haircare, makeup, fragrance, and beauty routines. Focus on the products the user has selected. Reply in plain text only and do not use Markdown symbols like #, *, **, -, or bullet markers. Use web search for up-to-date product and routine information when relevant, and include links or citations when available.",
    });

    // Remove typing indicator
    removeTypingIndicator();

    if (data.success && data.message) {
      const cleanReply = sanitizeAssistantText(data.message);

      // Add assistant response to history
      conversationHistory.push({
        role: "assistant",
        content: cleanReply,
      });

      // Display response
      displayMessage("assistant", cleanReply);
    } else {
      throw new Error("Invalid response from API");
    }
  } catch (error) {
    console.error("Error sending message:", error);
    removeTypingIndicator();
    displayMessage(
      "assistant",
      `I had trouble processing that. Error: ${error.message}`,
    );
  }
}

/* ========== CHAT DISPLAY ========== */
function displayMessage(role, content) {
  const messageDiv = document.createElement("div");
  messageDiv.className = `chat-message message-${role}`;
  const cleanContent = sanitizeForDisplay(content);

  messageDiv.innerHTML = `
    <div class="message-content">${escapeHtml(cleanContent)}</div>
  `;

  chatWindow.appendChild(messageDiv);
  chatWindow.scrollTop = chatWindow.scrollHeight;
}

function displayTypingIndicator() {
  const indicatorDiv = document.createElement("div");
  indicatorDiv.className = "chat-message message-assistant";
  indicatorDiv.id = "typingIndicator";
  indicatorDiv.innerHTML = `
    <div class="typing-indicator">
      <div class="typing-dot"></div>
      <div class="typing-dot"></div>
      <div class="typing-dot"></div>
    </div>
  `;

  chatWindow.appendChild(indicatorDiv);
  chatWindow.scrollTop = chatWindow.scrollHeight;
}

function removeTypingIndicator() {
  const indicator = document.getElementById("typingIndicator");
  if (indicator) {
    indicator.remove();
  }
}

function displayChatHistory() {
  chatWindow.innerHTML = "";
  conversationHistory.forEach((msg) => {
    displayMessage(msg.role, msg.content);
  });
}

/* ========== LOADING OVERLAY ========== */
function showLoading(show) {
  if (show) {
    loadingOverlay.classList.add("active");
    loadingOverlay.setAttribute("aria-hidden", "false");
  } else {
    loadingOverlay.classList.remove("active");
    loadingOverlay.setAttribute("aria-hidden", "true");
  }
}

/* ========== LOCAL STORAGE ========== */
function saveSelections() {
  const selections = selectedProducts.map((p) => p.id);
  localStorage.setItem("selectedProducts", JSON.stringify(selections));
}

function loadSavedSelections() {
  const saved = localStorage.getItem("selectedProducts");
  if (saved) {
    const productIds = JSON.parse(saved);
    selectedProducts = allProducts.filter((p) => productIds.includes(p.id));
    updateSelectedProducts();
  }
}

function clearLocalStorage() {
  localStorage.removeItem("selectedProducts");
}

/* ========== UTILITY FUNCTIONS ========== */
function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function sanitizeAssistantText(text) {
  if (!text) return "";

  let cleaned = text;

  // Remove internal formatting instructions if they are ever echoed back.
  const bannedPatterns = [
    /Do not use Markdown formatting symbols[^.]*\.?/gi,
    /Return plain text only\.?/gi,
    /Reply in plain text only[^.]*\.?/gi,
    /avoid markdown symbols[^.]*\.?/gi,
  ];

  bannedPatterns.forEach((pattern) => {
    cleaned = cleaned.replace(pattern, "");
  });

  return cleaned.replace(/\n{3,}/g, "\n\n").trim();
}

function sanitizeForDisplay(text) {
  if (!text) return "";
  return text
    .replace(/[\*#]/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/* ========== START APP ========== */
init();
