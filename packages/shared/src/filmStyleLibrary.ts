/** Named film looks adapted from Lemo-Opuscar style prompts (MIT). Used as video-model language, not a code renderer. */

export type FilmStyleCategoryId = "paint" | "graphic" | "cartoon" | "cinema" | "material";

export type FilmStyle = {
  id: string;
  category: FilmStyleCategoryId;
  labelHe: string;
  labelEn: string;
  blurbHe: string;
  blurbEn: string;
  promptEn: string;
  cameraEn: string;
  nativeMoveEn: string;
};

export const FILM_STYLE_CATEGORIES: Array<{
  id: FilmStyleCategoryId | "all";
  labelHe: string;
  labelEn: string;
}> = [
  { id: "all", labelHe: "הכול", labelEn: "All" },
  { id: "paint", labelHe: "ציור", labelEn: "Painting" },
  { id: "graphic", labelHe: "גרפיקה", labelEn: "Graphic" },
  { id: "cartoon", labelHe: "אנימציה", labelEn: "Cartoon" },
  { id: "cinema", labelHe: "קולנוע", labelEn: "Cinema" },
  { id: "material", labelHe: "חומר", labelEn: "Material" }
];

export const FILM_STYLES: FilmStyle[] = [
  {
    id: "watercolor",
    category: "paint",
    labelHe: "מברשת מים",
    labelEn: "Watercolor brush",
    blurbHe: "דף יומן שנצבע לבד",
    blurbEn: "A journal page that paints itself",
    promptEn:
      "hand-painted watercolor on warm cotton paper, translucent layered washes, dry-brush flying white, no vector outlines, handwritten notes beside the subject",
    cameraEn: "long lateral dolly over one painted sheet, or a locked specimen plate; rare hard cuts",
    nativeMoveEn: "objects paint themselves in stroke by stroke, structure before detail"
  },
  {
    id: "ink-wash",
    category: "paint",
    labelHe: "דיו סיני",
    labelEn: "Chinese ink wash",
    blurbHe: "משיכת מכחול אחת",
    blurbEn: "One calligraphic stroke",
    promptEn:
      "Chinese ink wash on raw xuan paper, black-to-grey ink tones only, calligraphic brush as gesture, empty space as composition, no Western watercolor color",
    cameraEn: "slow vertical tilt along one form, or a locked scroll that unrolls",
    nativeMoveEn: "a single brush stroke that becomes the next scene"
  },
  {
    id: "impasto",
    category: "paint",
    labelHe: "שמן עבה",
    labelEn: "Impasto oil",
    blurbHe: "צבע שנערם בסכין",
    blurbEn: "Paint piled with a knife",
    promptEn:
      "thick impasto oil painting, visible knife ridges and wet pigment, heavy tactile color, no flat digital fill",
    cameraEn: "slow push into a ridge of paint; locked plaza that color floods",
    nativeMoveEn: "color arrives as a physical stroke that changes the whole frame"
  },
  {
    id: "urban-sketch",
    category: "paint",
    labelHe: "רישום עירוני",
    labelEn: "Urban sketch",
    blurbHe: "עט, ואז כתם צבע",
    blurbEn: "Pen first, then a wash",
    promptEn:
      "location urban sketch: ink pen line first, then a loose watercolor wash only where the story travels, paper left blank elsewhere",
    cameraEn: "walk-with tracking; color follows the subject like wind",
    nativeMoveEn: "color arrives only where the character has been"
  },
  {
    id: "crayon-book",
    category: "paint",
    labelHe: "ספר צבעי שעווה",
    labelEn: "Crayon picture book",
    blurbHe: "עמוד ילדים רך",
    blurbEn: "A soft children's page",
    promptEn:
      "hand-drawn crayon picture-book page, waxy strokes, soft paper grain, simple shapes, warm night-light palette, no 3D CGI",
    cameraEn: "page-turn and gentle push into a drawn window",
    nativeMoveEn: "a crayon line that becomes the next room"
  },
  {
    id: "swiss-motion",
    category: "graphic",
    labelHe: "גרפיקה שווייצרית",
    labelEn: "Swiss motion graphics",
    blurbHe: "רשת, צבע אות, פעימה",
    blurbEn: "Grid, one signal color, on the beat",
    promptEn:
      "Swiss International Typographic Style in motion: modular grid, one grotesque type family, flat paper, one saturated signal color, every move snaps to a beat, no gradients or bounce",
    cameraEn: "hard pan by a column or page; locked spread; rotate 90° and stop",
    nativeMoveEn: "the one element that leaves the grid becomes the character"
  },
  {
    id: "art-deco",
    category: "graphic",
    labelHe: "ארט דקו",
    labelEn: "Art Deco",
    blurbHe: "זהב, גובה, 1930",
    blurbEn: "Gold, height, 1930",
    promptEn:
      "Art Deco cinema: sunburst geometry, brass and lacquer, stepped skyscraper forms, high-contrast gold and black, elegant period wardrobe, no modern UI",
    cameraEn: "crane up a facade; tracking through revolving doors; locked title card",
    nativeMoveEn: "geometry locks into the title at the climax"
  },
  {
    id: "blueprint",
    category: "graphic",
    labelHe: "שרטוט הנדסי",
    labelEn: "Blueprint",
    blurbHe: "קו לבן על כחול",
    blurbEn: "White line on cyan",
    promptEn:
      "engineering blueprint on cyan diazo paper, white construction lines, exploded parts with dimensions, revision clouds, no photoreal product shot",
    cameraEn: "orthographic orbit and explode; pull back to the full sheet",
    nativeMoveEn: "the drawing assembles itself, then a revision cloud starts to rain"
  },
  {
    id: "dark-keynote",
    category: "graphic",
    labelHe: "השקת טק כהה",
    labelEn: "Dark tech keynote",
    blurbHe: "ממשק על במה שחורה",
    blurbEn: "UI on a black stage",
    promptEn:
      "dark software-launch keynote: near-black stage, hairline grid, soft cool light, one brand accent, original UI that snaps to a grid, generous negative space, no real OS chrome",
    cameraEn: "log zoom into one control; whip pull-out on a beat; light-sweep reveal",
    nativeMoveEn: "disorder as generated UI, then one snap that restores the grid"
  },
  {
    id: "iso-infographic",
    category: "graphic",
    labelHe: "אינפוגרפיקה איזומטרית",
    labelEn: "Isometric infographic",
    blurbHe: "עולם קטן, שלב־שלב",
    blurbEn: "A tiny world, step by step",
    promptEn:
      "clean isometric infographic world, readable miniature architecture, one process told across a single diorama, no live-action camera shake",
    cameraEn: "locked 30° isometric; slow truck along the process path",
    nativeMoveEn: "the journey is one continuous miniature world"
  },
  {
    id: "cel-anime-80s",
    category: "cartoon",
    labelHe: "אנימה שנות ה־80",
    labelEn: "80s cel anime",
    blurbHe: "צלולואיד, גשם, ניאון",
    blurbEn: "Cel paint, rain, neon",
    promptEn:
      "1980s Japanese cel animation: painted cels over watercolor backgrounds, limited animation holds, film grain, neon night rain, hand-traced highlights, not modern 3D anime",
    cameraEn: "background pan under a held cel; low-angle hero; rain on glass",
    nativeMoveEn: "a still painted city that starts to move when the courier enters"
  },
  {
    id: "rubber-hose",
    category: "cartoon",
    labelHe: "קרטון צינורות גומי",
    labelEn: "1930s rubber hose",
    blurbHe: "גפיים אלסטיות, 1930",
    blurbEn: "Elastic limbs, 1930",
    promptEn:
      "1930s rubber-hose cartoon: pie-cut eyes, looping elastic limbs, black-and-white or two-strip color, ink-on-paper texture, musical gag timing",
    cameraEn: "locked proscenium; whip pan to the next gag",
    nativeMoveEn: "a chase that turns the kitchen into instruments"
  },
  {
    id: "midcentury-toon",
    category: "cartoon",
    labelHe: "קרטון אמצע המאה",
    labelEn: "Mid-century cartoon",
    blurbHe: "שטוח, חינוכי, 1950",
    blurbEn: "Flat, instructional, 1950s",
    promptEn:
      "1950s mid-century instructional cartoon: flat graphic shapes, limited color, UPA-like design, cheerful classroom film tone, no realistic shading",
    cameraEn: "graphic cuts and simple push-ins; title cards as diagrams",
    nativeMoveEn: "a diagram that becomes the character, then a product"
  },
  {
    id: "pixel-rpg",
    category: "cartoon",
    labelHe: "פיקסל 16 ביט",
    labelEn: "16-bit pixel RPG",
    blurbHe: "מפת אריחים ושמירה",
    blurbEn: "Tile map and a save",
    promptEn:
      "16-bit SNES-era pixel RPG: 16×16 tiles, limited palette, sprite characters, scanline softness, no photorealism",
    cameraEn: "locked tile-map scroll; snap to a menu screen",
    nativeMoveEn: "the save screen replays the journey"
  },
  {
    id: "newsreel",
    category: "cinema",
    labelHe: "יומן חדשות 1920",
    labelEn: "1920s newsreel",
    blurbHe: "פילם מגורען, כותרת",
    blurbEn: "Grain, intertitle, fanfare",
    promptEn:
      "1920s newsreel: high-contrast black-and-white film grain, hand-lettered intertitles, scratched print, observational crowd photography, no modern graphics",
    cameraEn: "locked news camera, occasional iris; intertitle hold",
    nativeMoveEn: "the paper headline becomes the next shot"
  },
  {
    id: "silent-film",
    category: "cinema",
    labelHe: "סרט אילם",
    labelEn: "1920s silent film",
    blurbHe: "איריס, כותרת, גאג",
    blurbEn: "Iris, title card, gag",
    promptEn:
      "1920s silent comedy: undercranked motion, iris in/out, painted backdrops, title cards, high-contrast orthochromatic look",
    cameraEn: "iris open on the gag; chase downhill; locked two-shot",
    nativeMoveEn: "a prop chase that ends by sharing the prize"
  },
  {
    id: "caption-news",
    category: "cinema",
    labelHe: "חדשות בכתוביות",
    labelEn: "Caption news",
    blurbHe: "עובד גם בלי קול",
    blurbEn: "Reads with the sound off",
    promptEn:
      "modern caption-first news short: large kinetic captions, one clear number, observational b-roll, no studio desk, no invented wall maps",
    cameraEn: "inserts and split facts; hold the number as a full-screen card",
    nativeMoveEn: "a caption the viewer can understand muted"
  },
  {
    id: "whiteboard",
    category: "cinema",
    labelHe: "לוח הסבר",
    labelEn: "Whiteboard explainer",
    blurbHe: "יד שמציירת את הרעיון",
    blurbEn: "A hand that draws the idea",
    promptEn:
      "whiteboard explainer: dry-erase marker on a white board, simple diagrams drawn in real time, a presenter's hand, no 3D icons",
    cameraEn: "locked board; occasional push into a sketched detail",
    nativeMoveEn: "the diagram is built in the order the idea is understood"
  },
  {
    id: "glass-product",
    category: "material",
    labelHe: "מוצר זכוכית",
    labelEn: "Glass product render",
    blurbHe: "החזרות רכות, אנבוקס",
    blurbEn: "Soft caustics, unboxing",
    promptEn:
      "premium glass product cinema: studio black, strip-light sweeps, caustics, dustless close-ups, slow unboxing, no cartoon materials",
    cameraEn: "macro orbit; light sweep; locked hero on black",
    nativeMoveEn: "light reveals the product one surface at a time"
  },
  {
    id: "brick-toy",
    category: "material",
    labelHe: "צעצוע לבנים",
    labelEn: "Brick toy",
    blurbHe: "עולם בנוי מלבנים",
    blurbEn: "A world built of bricks",
    promptEn:
      "brick-toy miniature world: studded plastic bricks, minifigure-scale characters, tabletop lighting, tactile plastic sheen, not photoreal people",
    cameraEn: "tabletop push; crane off a built tower",
    nativeMoveEn: "spare parts snap into the next machine"
  },
  {
    id: "tilt-shift",
    category: "material",
    labelHe: "מיניאטורה",
    labelEn: "Tilt-shift miniature",
    blurbHe: "עיר שנראית דגם",
    blurbEn: "A city that looks like a model",
    promptEn:
      "tilt-shift miniature city: shallow focus banding, toy-like scale, daylight overhead, tiny traffic and figures, photographic not illustrated",
    cameraEn: "high overhead; slow truck across the tabletop city",
    nativeMoveEn: "rush hour as a model-train ballet"
  },
  {
    id: "ukiyoe",
    category: "material",
    labelHe: "אוקיו־אה",
    labelEn: "Ukiyo-e",
    blurbHe: "הדפס עץ יפני",
    blurbEn: "A Japanese woodblock print",
    promptEn:
      "ukiyo-e woodblock print in motion: flat mineral pigments, visible woodgrain, outlined forms, distant mountain, great wave grammar without copying a specific print",
    cameraEn: "scroll laterally along a printed world; locked block that prints itself",
    nativeMoveEn: "each shot is a finished print, then the next block stamps over it"
  }
];

export const FILM_DIRECTOR_RULES =
  "DIRECTING: hook in the first 3 seconds with no slow logo; one subject, one goal, one turn; the ending echoes the opening; every shot needs a reason (framing plus a motivated camera move); one signature shot; vary pace with one acceleration or held breath; transitions belong to the visual medium, not default fades; sound is half the film — every visible action has a matching sound.";

const BY_ID = new Map(FILM_STYLES.map((style) => [style.id, style]));

export function resolveFilmStyle(id?: string | null): FilmStyle | undefined {
  const key = id?.trim().toLowerCase();
  return key ? BY_ID.get(key) : undefined;
}

export function filmStylesInCategory(category: FilmStyleCategoryId | "all"): FilmStyle[] {
  return category === "all" ? FILM_STYLES : FILM_STYLES.filter((style) => style.category === category);
}

export function filmStylePromptClause(id?: string | null): string {
  const style = resolveFilmStyle(id);
  if (!style) return "";
  return `LOOK: ${style.promptEn}. Camera: ${style.cameraEn}. Native move: ${style.nativeMoveEn}.`;
}

export function filmStyleFieldOptions(): Array<{
  value: string;
  code: string;
  labelHe: string;
  labelEn: string;
}> {
  return FILM_STYLES.map((style) => ({
    value: style.id,
    code: style.id,
    labelHe: style.labelHe,
    labelEn: style.labelEn
  }));
}
