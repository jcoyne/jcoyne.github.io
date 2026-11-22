// Builds a grocery list from recipes' free-text ingredient lines. Amounts aren't added up (lines
// like "1 tablespoon grated lemon zest plus 3 tablespoons juice" can't be summed reliably);
// instead lines that look like the same ingredient are grouped, each kept as written.

const NUMBER = String.raw`(?:\d+(?:[.,/]\d+)?|[½⅓⅔¼¾⅕⅛⅜⅝⅞])+`;
const UNITS = [
  "cups?", "tablespoons?", "tbsps?\\.?", "teaspoons?", "tsps?\\.?", "ounces?", "oz\\.?", "pounds?", "lbs?\\.?",
  "grams?", "g", "kilograms?", "kg", "milliliters?", "ml", "liters?", "l", "quarts?", "qt\\.?", "pints?", "gallons?",
  "cloves?", "cans?", "jars?", "packages?", "pkgs?\\.?", "bunch(?:es)?", "heads?", "sprigs?", "slices?", "sticks?",
  "pieces?", "blocks?", "ears?", "stalks?", "bags?", "box(?:es)?", "bottles?", "handfuls?", "pinch(?:es)?", "dash(?:es)?",
  "knobs?", "fillets?", "links?", "rounds?",
];
// "2 (12- to 18-ounce) packages", "1½ cups", "2 to 2 ½ pounds", "14–16 oz." and the like.
const QUANTITY = new RegExp(
  String.raw`^(?:about |scant |heaping )?${NUMBER}(?:\s*${NUMBER})*` +
  String.raw`(?:\s*(?:-|–|to|or)\s*${NUMBER}(?:\s*${NUMBER})*)?\s*(?:\([^)]*\)\s*)?` +
  // Up to two units, as in "14–16 oz. block firm tofu".
  String.raw`(?:(?:${UNITS.join("|")})\b\.?\s*(?:\([^)]*\)\s*)?(?:of\s+)?){0,2}`,
  "i",
);
// Words that describe how much or how an ingredient is prepared, not what to buy.
const DESCRIPTORS = new Set([
  "large", "medium", "small", "fresh", "freshly", "chopped", "minced", "sliced", "thinly", "finely", "coarsely",
  "roughly", "grated", "crushed", "packed", "peeled", "trimmed", "halved", "torn", "whole", "extra-virgin", "extra",
  "virgin", "low-sodium", "unsalted", "kosher", "cold", "warm", "softened", "melted",
  "divided", "clove", "cloves", "stalk", "stalks", "leaf", "leaves", "about", "plus", "more", "for", "serving",
  "optional", "very", "or", "to", "taste", "of",
]);
// Descriptors also dropped from the start of a group's displayed name ("Chopped fresh parsley" ->
// "Parsley"). Not "diced": "diced tomatoes" are canned, a different thing to buy than tomatoes.
const LEADING_DESCRIPTORS = new RegExp(
  String.raw`^(?:(?:large|medium|small|fresh|freshly|chopped|minced|sliced|thinly|finely|coarsely|roughly|` +
  String.raw`grated|crushed|packed|peeled|trimmed|halved|torn|cold|warm|softened|melted|or),?\s+)+`,
  "i",
);

function singular(word) {
  if (/(?:ss|us|is)$/.test(word)) return word; // "molasses", "couscous"
  if (/oes$/.test(word)) return word.slice(0, -2); // tomatoes, potatoes
  if (/ies$/.test(word)) return `${word.slice(0, -3)}y`; // berries
  if (/(?:ch|sh|x)es$/.test(word)) return word.slice(0, -2); // radishes, boxes
  if (/s$/.test(word) && word.length > 3) return word.slice(0, -1);
  return word;
}

// A line that only labels a group of ingredients ("For the sauce:"), not something to buy.
export const isLabel = (line) => /:\s*$/.test(line.trim());

// What to buy, as written: the line without its leading amount and without notes after the
// first comma or in parentheses. "4 garlic cloves, thinly sliced" -> "garlic cloves".
export function ingredientName(line) {
  let text = line.trim()
    // Bon Appétit's "1½ tsp. Diamond Crystal or ¾ tsp. Morton kosher salt"
    .replace(/diamond crystal or .*?morton\s+/i, "");
  text = text.replace(QUANTITY, "").replace(/\([^)]*\)?/g, " ");
  text = text.split(/ plus | for serving/)[0];
  // Notes follow the first comma, except after modifiers: "boneless, skinless chicken thighs".
  const segments = text.split(",");
  let end = 0;
  while (end < segments.length - 1 && wordsOf(segments[end]).every((word) => MODIFIERS.has(word) || DESCRIPTORS.has(word))) end++;
  return segments.slice(0, end + 1).join(",").replace(/\s+/g, " ").trim();
}

// Words that can come before a comma in an ingredient's name. They stay in names and keys:
// boneless, skinless thighs are a different thing to buy than bone-in or skin-on ones.
const MODIFIERS = new Set(["boneless", "skinless", "bone-in", "skin-on"]);

const wordsOf = (text) => text.toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, " ").split(/\s+/).filter(Boolean);

// Keys that are the same for lines naming the same ingredient: "2 tablespoons extra-virgin olive
// oil" and "3 tablespoons olive oil" both give ["olive oil"]. "Salt and pepper" gives two keys.
export function ingredientKeys(line) {
  const kept = wordsOf(ingredientName(line)).filter((word) => !DESCRIPTORS.has(word)).map(singular);
  const key = (kept.join(" ") || ingredientName(line).toLowerCase())
    .replace(/\b(?:ground )?(?:black )?pepper\b/, (match) => (match.includes("red") ? match : "pepper"));
  const pair = key.match(/^salt and pepper$/);
  return pair ? ["salt", "pepper"] : [key];
}

const capitalize = (text) => text.charAt(0).toUpperCase() + text.slice(1);
// "Chopped fresh parsley" -> "parsley", "garlic cloves" -> "garlic", "celery stalk" -> "celery".
const displayName = (name) => name.replace(LEADING_DESCRIPTORS, "").replace(/\s+(?:cloves?|stalks?|leaves)$/i, "") || name;

// [{ key, name, lines: [{ text, recipe }] }], alphabetically by name. The name shown for a group
// is the shortest way any of its lines names the ingredient.
export function groceryList(recipes) {
  const groups = new Map();
  for (const recipe of recipes) {
    for (const text of recipe.ingredients || []) {
      if (!text.trim() || isLabel(text)) continue;
      const keys = ingredientKeys(text);
      for (const key of keys) {
        if (!groups.has(key)) groups.set(key, { key, names: [], lines: [] });
        const group = groups.get(key);
        // A line split across groups ("Salt and pepper") names each group by its key.
        group.names.push(keys.length > 1 ? key : ingredientName(text) || text);
        group.lines.push({ text, recipe });
      }
    }
  }
  return [...groups.values()]
    .map(({ key, names, lines }) => ({
      key,
      name: capitalize(names.map(displayName).reduce((a, b) => (b.length < a.length ? b : a))),
      lines,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
