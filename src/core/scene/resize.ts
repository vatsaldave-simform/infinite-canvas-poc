/**
 * Resizing elements. See CONTEXT.md ("Resize", "Fit").
 */

/**
 * The smallest size, in world units, an element may have. Drawing refuses
 * anything smaller and resizing never shrinks below it, so every element stays
 * big enough to select again.
 */
export const MIN_ELEMENT_SIZE = 2;
