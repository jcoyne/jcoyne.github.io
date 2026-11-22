// Recipe browser: a static, hash-routed page over the recipe files in recipes/.
//   #/               -> list of recipes
//   #/recipes/:id    -> a single recipe
// recipes/index.json lists the Base64-encoded JSON recipe files, oldest first.
// Recipe text comes from scraped sites, so it is only ever inserted as text, never as HTML.
// All URLs are relative so the site works from any directory (e.g. /recipes/ on GitHub Pages).

const app = document.getElementById("app");
const prevLink = document.querySelector('[data-nav="prev"]');
const nextLink = document.querySelector('[data-nav="next"]');
const brandLink = document.querySelector('[data-nav="list"]');
const recipeNav = document.querySelector(".site-header nav");

// A light password gate to keep casual scrapers out. This is NOT security: the password is
// only Base64-encoded here, and the recipe files themselves can still be fetched directly.
const PASSWORD_B64 = "cmVjaXBlcw==";
// Kept in localStorage so the browser stays unlocked across visits, not just for one tab.
const UNLOCKED_KEY = "recipes-unlocked";

let unlocked = false;
try {
  unlocked = localStorage.getItem(UNLOCKED_KEY) === "1";
} catch {
  // Storage unavailable (e.g. blocked); ask for the password on each page load instead.
}

function passwordMatches(value) {
  try {
    return btoa(value) === PASSWORD_B64;
  } catch {
    return false; // btoa throws on characters outside Latin-1, which can't match anyway
  }
}

function unlock() {
  unlocked = true;
  try {
    localStorage.setItem(UNLOCKED_KEY, "1");
  } catch {
    // Not remembered; the gate will reappear on the next page load.
  }
}

// The list page's sections, in order (Recipe::CATEGORIES in lib/recipe.rb). Recipes without a
// known category go in a final "Other" section.
const SECTIONS = ["Breakfast", "Mains", "Soups & Stews", "Salads", "Sides", "Desserts"];
const OTHER = "Other";
const sectionOf = (recipe) => (SECTIONS.includes(recipe.category) ? recipe.category : OTHER);
const sectionIndex = (recipe) => [...SECTIONS, OTHER].indexOf(sectionOf(recipe));

const VEGETARIAN_ONLY_KEY = "recipes-vegetarian-only";

function readVegetarianOnly() {
  try {
    return localStorage.getItem(VEGETARIAN_ONLY_KEY) === "1";
  } catch {
    return false;
  }
}

function writeVegetarianOnly(value) {
  try {
    if (value) localStorage.setItem(VEGETARIAN_ONLY_KEY, "1");
    else localStorage.removeItem(VEGETARIAN_ONLY_KEY);
  } catch {
    // Not remembered; the filter resets on the next page load.
  }
}

let recipesPromise;

async function fetchOk(url, options) {
  const response = await fetch(url, options);
  if (!response.ok) throw new Error(`Couldn’t load ${url} (${response.status})`);
  return response;
}

// The files are Base64 (with line breaks) of UTF-8 JSON.
function decodeRecipe(text) {
  const bytes = Uint8Array.from(atob(text.replace(/\s+/g, "")), (char) => char.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes));
}

function loadRecipes() {
  recipesPromise ??= (async () => {
    // Revalidate the index on each visit; the recipe files are named by content, so they can be cached.
    const files = await (await fetchOk("recipes/index.json", { cache: "no-cache" })).json();
    const recipes = await Promise.all(files.map(async (file) => decodeRecipe(await (await fetchOk(`recipes/${file}`)).text())));
    // List order (section, then title) is also the Previous/Next order.
    return recipes.sort((a, b) => sectionIndex(a) - sectionIndex(b) || a.title.localeCompare(b.title));
  })()
    .catch((error) => {
      recipesPromise = undefined; // allow a retry on the next navigation
      throw error;
    });
  return recipesPromise;
}

// Build an element: h("a", { href: "/x" }, "text", childNode)
function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [name, value] of Object.entries(attrs)) {
    if (value !== undefined && value !== null && value !== false) el.setAttribute(name, value);
  }
  el.append(...children.flat().filter((child) => child !== undefined && child !== null));
  return el;
}

// A small leaf marking vegetarian recipes. It's decorative: pair it with text for screen readers.
function leafIcon() {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  for (const [name, value] of Object.entries({
    class: "leaf", viewBox: "0 0 24 24", width: "16", height: "16", fill: "none", stroke: "currentColor",
    "stroke-width": "2", "stroke-linecap": "round", "stroke-linejoin": "round", "aria-hidden": "true", focusable: "false",
  })) svg.setAttribute(name, value);
  for (const d of [
    "M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z",
    "M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12",
  ]) {
    const path = document.createElementNS(ns, "path");
    path.setAttribute("d", d);
    svg.append(path);
  }
  return svg;
}

const recipePath = (recipe) => `#/recipes/${encodeURIComponent(recipe.id)}`;

function routeFor(hash) {
  const match = hash.match(/^#\/recipes\/([^/]+)\/?$/);
  if (match) return { name: "show", id: decodeURIComponent(match[1]) };
  return { name: "list" };
}

function setNeighbor(link, recipe) {
  link.hidden = !recipe;
  if (recipe) link.href = recipePath(recipe);
}

function updateNav(route, recipes, index) {
  if (route.name === "list") brandLink.setAttribute("aria-current", "page");
  else brandLink.removeAttribute("aria-current");

  const showing = route.name === "show" && index >= 0;
  setNeighbor(prevLink, showing ? recipes[index - 1] : undefined);
  setNeighbor(nextLink, showing ? recipes[index + 1] : undefined);
}

function listView(recipes) {
  document.title = "Recipes";
  if (recipes.length === 0) {
    return [h("h1", { tabindex: "-1" }, "Recipes"), h("p", {}, "No recipes yet. Import one with rake import:ba[URL].")];
  }
  const items = [];
  const sections = [...SECTIONS, OTHER].flatMap((name, i) => {
    const inSection = recipes.filter((recipe) => sectionOf(recipe) === name);
    if (inSection.length === 0) return [];
    const headingId = `section-${i}`;
    const sectionItems = inSection.map((recipe) => {
      const item = h("li", {},
        h("a", { href: recipePath(recipe) },
          recipe.title,
          recipe.vegetarian ? h("span", { class: "visually-hidden" }, " (vegetarian)") : null),
        // No space before the leaf, so it never wraps onto a line by itself (app.css spaces it).
        recipe.vegetarian ? leafIcon() : null);
      item.dataset.vegetarian = recipe.vegetarian ? "true" : "false";
      items.push(item);
      return item;
    });
    return h("section", { class: "recipe-section", "aria-labelledby": headingId },
      h("h2", { id: headingId }, name),
      h("ul", { class: "recipe-list" }, sectionItems));
  });

  const filter = h("input", { id: "vegetarian-only", type: "checkbox" });
  const status = h("p", { class: "filter-status", role: "status" });
  function applyFilter() {
    const vegetarianOnly = filter.checked;
    for (const item of items) item.hidden = vegetarianOnly && item.dataset.vegetarian !== "true";
    for (const section of sections) section.hidden = !section.querySelector("li:not([hidden])");
    const shown = items.filter((item) => !item.hidden).length;
    status.textContent = vegetarianOnly ? `Showing ${shown} vegetarian recipes` : "";
  }
  filter.checked = readVegetarianOnly();
  filter.addEventListener("change", () => {
    writeVegetarianOnly(filter.checked);
    applyFilter();
  });

  applyFilter();

  return [
    h("div", { class: "list-header" },
      // The site header already says "Recipes"; keep the h1 for screen readers and as the focus target.
      h("h1", { class: "visually-hidden", tabindex: "-1" }, "Recipes"),
      h("div", { class: "list-filter" },
        filter,
        h("label", { for: "vegetarian-only" }, leafIcon(), " Vegetarian only"))),
    status,
    ...sections,
  ];
}

function recipeView(recipe) {
  document.title = `${recipe.title} · Recipes`;
  const heading = recipe.link
    ? h("a", { href: recipe.link, rel: "noopener noreferrer" }, recipe.title)
    : recipe.title;

  return [
    h("article", { class: "recipe" },
      h("h1", { tabindex: "-1" }, heading),
      recipe.servings || recipe.vegetarian
        ? h("p", { class: "servings" },
          recipe.servings,
          recipe.servings && recipe.vegetarian ? " · " : null,
          recipe.vegetarian ? h("span", { class: "vegetarian" }, leafIcon(), " Vegetarian") : null)
        : null,
      recipe.image ? h("img", { class: "photo", src: recipe.image, alt: "", decoding: "async" }) : null,
      h("div", { class: "recipe-body" },
        h("section", { class: "ingredients", "aria-labelledby": "ingredients-heading" },
          h("h2", { id: "ingredients-heading" }, "Ingredients"),
          h("ul", {}, (recipe.ingredients || []).map((item) => h("li", {}, item)))),
        h("section", { class: "preparation", "aria-labelledby": "preparation-heading" },
          h("h2", { id: "preparation-heading" }, "Preparation"),
          h("ol", {}, (recipe.preparation_steps || []).map((step) => h("li", {}, step)))))),
  ];
}

function notFoundView() {
  document.title = "Recipe not found · Recipes";
  return [h("h1", { tabindex: "-1" }, "Recipe not found"), h("p", {}, h("a", { href: "#/" }, "Back to all recipes"))];
}

function errorView(error) {
  document.title = "Recipes";
  return [h("h1", { tabindex: "-1" }, "Couldn’t load recipes"), h("p", { role: "alert" }, error.message)];
}

function passwordView() {
  document.title = "Recipes";
  const input = h("input", {
    id: "password", name: "password", type: "password", autocomplete: "current-password",
    enterkeyhint: "done", required: true,
  });
  const error = h("p", { class: "form-error", role: "alert" });
  const showPassword = h("input", { id: "show-password", type: "checkbox" });
  showPassword.addEventListener("change", () => {
    input.type = showPassword.checked ? "text" : "password";
  });

  const form = h("form", { class: "password-form" },
    h("label", { for: "password" }, "Password"),
    input,
    h("div", { class: "show-password" }, showPassword, h("label", { for: "show-password" }, "Show password")),
    error,
    h("button", { type: "submit" }, "Unlock"));

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (passwordMatches(input.value)) {
      unlock();
      render();
    } else {
      error.textContent = "That password isn’t right. Try again.";
      input.select();
    }
  });

  return [h("h1", { tabindex: "-1" }, "Recipes"), h("p", {}, "Enter the password to see the recipes."), form];
}

async function render({ focus = true } = {}) {
  recipeNav.hidden = !unlocked;
  if (!unlocked) {
    app.replaceChildren(...passwordView());
    app.querySelector("#password").focus();
    return;
  }

  const route = routeFor(location.hash);
  let content;
  try {
    const recipes = await loadRecipes();
    const index = route.name === "show" ? recipes.findIndex((r) => String(r.id) === route.id) : -1;
    updateNav(route, recipes, index);
    if (route.name === "list") content = listView(recipes);
    else content = index >= 0 ? recipeView(recipes[index]) : notFoundView();
  } catch (error) {
    updateNav({ name: "error" }, [], -1);
    content = errorView(error);
  }

  const update = () => app.replaceChildren(...content);
  if (document.startViewTransition && focus) await document.startViewTransition(update).updateCallbackDone;
  else update();

  // Move focus to the new heading so keyboard and screen reader users land on the new view.
  if (focus) app.querySelector("h1")?.focus({ preventScroll: true });
}

document.querySelector('[data-action="random"]').addEventListener("click", async () => {
  try {
    const recipes = await loadRecipes();
    if (recipes.length === 0) return;
    const current = routeFor(location.hash).id;
    const choices = recipes.length > 1 ? recipes.filter((r) => String(r.id) !== current) : recipes;
    location.hash = recipePath(choices[Math.floor(Math.random() * choices.length)]);
  } catch {
    render();
  }
});

// Links, Random, and the back/forward buttons all change the hash.
window.addEventListener("hashchange", () => {
  window.scrollTo(0, 0);
  render();
});

render({ focus: false });
