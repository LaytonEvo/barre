/**
 * Kelly's photography.
 *
 * Every image is listed once with its real dimensions and its alt text. The
 * dimensions let next/image reserve the right space, which is what stops the
 * page jumping as photos load; the alt text lives here so it is written
 * deliberately rather than invented at each call site.
 *
 * Files are in public/images/, with EXIF stripped (phone and camera files can
 * carry GPS coordinates). Originals are kept in brand/photos/.
 *
 * Alt text describes what is actually in the frame. Where an image is purely
 * decorative — it sits beside text that already says the same thing — alt is an
 * empty string so screen readers skip it rather than announcing a description
 * the reader has just heard.
 */

export type Photo = {
  src: string;
  width: number;
  height: number;
  alt: string;
  orientation: 'landscape' | 'portrait';
};

function photo(name: string, width: number, height: number, alt: string): Photo {
  return {
    src: `/images/${name}.jpg`,
    width,
    height,
    alt,
    orientation: width >= height ? 'landscape' : 'portrait',
  };
}

export const PHOTOS = {
  /** Hero. Wide, with open space on the right for type to sit over. */
  fieldPath: photo(
    'kelly-field-path',
    1280,
    853,
    'Kelly standing on a mown path through long summer grass, in black activewear',
  ),
  lakeside: photo('kelly-lakeside', 1280, 853, 'Kelly beside a still lake edged with greenery'),
  gateReach: photo(
    'kelly-gate-reach',
    750,
    495,
    'Kelly reaching along a field gate in low evening sun',
  ),
  benchField: photo('kelly-bench-field', 750, 498, 'Kelly resting on a bench in a grass field'),
  stoneField: photo('kelly-stone-field', 747, 496, 'Kelly sitting on a stone block in a meadow'),

  /** Portrait, smiling and face-forward — the closest thing to a headshot. */
  portrait: photo('kelly-portrait', 750, 1110, 'Kelly smiling, outdoors by water'),
  decking: photo('kelly-decking', 648, 960, 'Kelly sitting on decking beside a wooden fence'),
  gateGrass: photo('kelly-gate-grass', 646, 960, 'Kelly leaning against a gate in long grass'),
  stretchWoods: photo(
    'kelly-stretch-woods',
    691,
    935,
    'Kelly stretching a quad, standing in woodland',
  ),
  longGrass: photo('kelly-long-grass', 642, 960, 'Kelly standing in waist-high summer grass'),

  /** Studio work at an actual barre — the clearest "this is what it is" images. */
  barreStudio: photo(
    'kelly-barre-studio',
    692,
    960,
    'Kelly at a ballet barre in a studio, one arm extended, in black and white',
  ),
  barrePlank: photo(
    'kelly-barre-plank',
    960,
    718,
    'Kelly in a plank position with one leg raised, at the barre',
  ),
  barreFloor: photo(
    'kelly-barre-floor',
    750,
    666,
    'Kelly laughing during floor work with one leg extended, beside the barre',
  ),

  /** A real class, several people working at the barre together. */
  classGroup: photo(
    'class-barre-group',
    960,
    598,
    'A barre class in progress, several people holding a raised-leg position',
  ),
} as const satisfies Record<string, Photo>;

export const LOGO = {
  src: '/images/logo.png',
  width: 512,
  height: 512,
  alt: 'Barre By Kelly',
} as const;

/** Rotating selection for the homepage strip, newest shoot first. */
export const GALLERY: Photo[] = [
  PHOTOS.gateReach,
  PHOTOS.barreFloor,
  PHOTOS.longGrass,
  PHOTOS.classGroup,
  PHOTOS.stretchWoods,
  PHOTOS.benchField,
];
